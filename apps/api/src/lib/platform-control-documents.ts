import { loadDocumentCategoryConfig } from './document-config.js';
import {
  documentMatchesLibrary,
  loadDocumentLibraries,
} from './document-libraries.js';
import { loadDocumentDetailPayload } from './document-route-detail-loaders.js';
import {
  runDocumentCanonicalBackfillAction,
  runDocumentDeepParseAction,
  runDocumentOrganizeAction,
  runDocumentReparseAction,
  runDocumentVectorRebuildAction,
  runReclusterUngroupedAction,
} from './document-route-operations.js';
import {
  createManagedDocumentLibrary,
  deleteManagedDocumentLibrary,
  updateManagedDocumentLibrary,
} from './document-route-services.js';
import { ingestLocalFilesIntoLibrary } from './document-upload-ingest.js';
import { DEFAULT_SCAN_DIR, buildDocumentId, loadParsedDocuments } from './document-store.js';
import { readOpenClawMemorySyncStatus } from './openclaw-memory-sync.js';

type CommandFlags = Record<string, string>;

export type PlatformControlResult = {
  ok: boolean;
  action: string;
  summary: string;
  data?: Record<string, unknown>;
};

function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampLimit(value: string | undefined, fallback: number, max: number) {
  return Math.max(1, Math.min(max, Number(value || fallback) || fallback));
}

function splitFlagList(value: string | undefined) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveBooleanFlag(value: string | undefined) {
  const normalized = normalizeText(value || '');
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function scoreLibraryMatch(reference: string, library: { key: string; label: string; description?: string }) {
  const normalizedReference = normalizeText(reference);
  const haystack = normalizeText(`${library.key} ${library.label} ${library.description || ''}`);
  if (!normalizedReference || !haystack) return 0;
  if (haystack === normalizedReference) return 120;
  if (haystack.includes(normalizedReference)) return 90;
  if (normalizedReference.includes(normalizeText(library.label || ''))) return 60;
  if (normalizedReference.includes(normalizeText(library.key || ''))) return 50;
  return 0;
}

async function resolveLibraryReference(reference: string) {
  const libraries = await loadDocumentLibraries();
  if (!libraries.length) {
    throw new Error('No knowledge libraries are configured.');
  }

  const normalizedReference = String(reference || '').trim();
  if (!normalizedReference && libraries.length === 1) {
    return libraries[0];
  }
  if (!normalizedReference) {
    throw new Error('Missing --library.');
  }

  const matches = libraries
    .map((library) => ({ library, score: scoreLibraryMatch(normalizedReference, library) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!matches.length) {
    throw new Error(`No library matched "${reference}".`);
  }
  if (matches.length > 1 && matches[0].score === matches[1].score) {
    throw new Error(`Library match is ambiguous: ${matches.slice(0, 5).map((item) => item.library.label).join(', ')}`);
  }
  return matches[0].library;
}

async function resolveTargetLibrariesFromFlags(flags: CommandFlags) {
  const requested = [
    ...splitFlagList(flags.library),
    ...splitFlagList(flags.libraries),
  ];
  if (!requested.length) return [];

  const dedup = new Map<string, { key: string; label: string; mode: 'primary' | 'secondary' }>();
  for (const [index, reference] of requested.entries()) {
    const library = await resolveLibraryReference(reference);
    if (!dedup.has(library.key)) {
      dedup.set(library.key, {
        key: library.key,
        label: library.label,
        mode: index === 0 ? 'primary' : 'secondary',
      });
    }
  }
  const values = Array.from(dedup.values());
  if (values[0]) values[0].mode = 'primary';
  return values;
}

function summarizeDocumentItem(item: Awaited<ReturnType<typeof loadParsedDocuments>>['items'][number]) {
  return {
    id: buildDocumentId(item.path),
    title: item.title || item.name,
    name: item.name,
    path: item.path,
    libraryGroups: Array.isArray(item.groups) ? item.groups : [],
    parseStage: item.parseStage,
    detailParseStatus: item.detailParseStatus,
    summary: item.summary || '',
  };
}

export async function runDocumentCommand(subcommand: string, flags: CommandFlags): Promise<PlatformControlResult> {
  if (!subcommand || subcommand === 'libraries') {
    const libraries = await loadDocumentLibraries();
    return {
      ok: true,
      action: 'documents.libraries',
      summary: `Loaded ${libraries.length} libraries.`,
      data: {
        items: libraries.map((item) => ({
          key: item.key,
          label: item.label,
          description: item.description || '',
        })),
      },
    };
  }

  if (subcommand === 'create-library') {
    const name = String(flags.name || flags.label || '').trim();
    if (!name) throw new Error('Missing --name for documents create-library.');
    const { library, libraries } = await createManagedDocumentLibrary({
      name,
      description: String(flags.description || '').trim() || undefined,
      permissionLevel: flags.permission !== undefined ? Number(flags.permission) : undefined,
    });
    return {
      ok: true,
      action: 'documents.create-library',
      summary: `Created library "${library.label}".`,
      data: { item: library, items: libraries },
    };
  }

  if (subcommand === 'update-library') {
    const key = String(flags.library || flags.key || '').trim();
    if (!key) throw new Error('Missing --library for documents update-library.');
    const patch: Parameters<typeof updateManagedDocumentLibrary>[1] = {};
    if (flags.label !== undefined) patch.label = String(flags.label || '').trim();
    if (flags.description !== undefined) patch.description = String(flags.description || '').trim();
    if (flags.permission !== undefined) patch.permissionLevel = Number(flags.permission);
    if (flags['knowledge-pages'] !== undefined) patch.knowledgePagesEnabled = resolveBooleanFlag(flags['knowledge-pages']);
    if (flags['knowledge-pages-mode'] !== undefined) patch.knowledgePagesMode = String(flags['knowledge-pages-mode'] || '').trim() as 'none' | 'overview' | 'topics';
    if (!Object.keys(patch).length) {
      throw new Error('Missing library update fields. Provide --label, --description, --permission, or knowledge page flags.');
    }
    const { library, libraries } = await updateManagedDocumentLibrary(key, patch);
    return {
      ok: true,
      action: 'documents.update-library',
      summary: `Updated library "${library.label}".`,
      data: { item: library, items: libraries },
    };
  }

  if (subcommand === 'delete-library') {
    const key = String(flags.library || flags.key || '').trim();
    if (!key) throw new Error('Missing --library for documents delete-library.');
    const { deleted, libraries } = await deleteManagedDocumentLibrary(key);
    return {
      ok: true,
      action: 'documents.delete-library',
      summary: `Deleted library "${deleted.label}".`,
      data: { item: deleted, items: libraries },
    };
  }

  if (subcommand === 'list') {
    const libraries = await loadDocumentLibraries();
    const scopeLibrary = flags.library ? await resolveLibraryReference(flags.library) : null;
    const limit = clampLimit(flags.limit, 20, 200);
    const snapshot = await loadParsedDocuments(Math.max(limit * 5, 200), false);
    const items = (scopeLibrary
      ? snapshot.items.filter((item) => documentMatchesLibrary(item, scopeLibrary))
      : snapshot.items)
      .slice(0, limit)
      .map(summarizeDocumentItem);

    return {
      ok: true,
      action: 'documents.list',
      summary: `Loaded ${items.length} documents${scopeLibrary ? ` from ${scopeLibrary.label}` : ''}.`,
      data: {
        library: scopeLibrary ? { key: scopeLibrary.key, label: scopeLibrary.label } : null,
        totalCached: snapshot.items.length,
        availableLibraries: libraries.map((item) => ({ key: item.key, label: item.label })),
        items,
      },
    };
  }

  if (subcommand === 'import-local') {
    const filePaths = [...splitFlagList(flags.paths), ...splitFlagList(flags.path)];
    if (!filePaths.length) {
      throw new Error('Missing --path or --paths for documents import-local.');
    }
    const targetLibraries = await resolveTargetLibrariesFromFlags(flags);
    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const libraries = await loadDocumentLibraries();
    const ingestResult = await ingestLocalFilesIntoLibrary({
      filePaths,
      documentConfig: config,
      libraries,
      preferredLibraryKeys: targetLibraries.map((item) => item.key),
      forcedLibraryKeys: targetLibraries.map((item) => item.key),
    });
    return {
      ok: true,
      action: 'documents.import-local',
      summary: `Imported ${ingestResult.summary.successCount}/${ingestResult.summary.total} local files into the dataset base.`,
      data: {
        uploadedFiles: ingestResult.uploadedFiles,
        summary: ingestResult.summary,
        metrics: ingestResult.metrics,
        confirmedLibraryKeys: ingestResult.confirmedLibraryKeys,
        ingestItems: ingestResult.ingestItems,
      },
    };
  }

  if (subcommand === 'sync-status') {
    const status = await readOpenClawMemorySyncStatus();
    return {
      ok: true,
      action: 'documents.sync-status',
      summary: `Memory sync status: ${status.status}.`,
      data: status as unknown as Record<string, unknown>,
    };
  }

  if (subcommand === 'detail') {
    const id = String(flags.id || '').trim();
    if (!id) throw new Error('Missing --id for documents detail.');
    const payload = await loadDocumentDetailPayload(id, { includeSourceAvailability: true });
    if (!payload) throw new Error(`Document "${id}" was not found.`);
    return {
      ok: true,
      action: 'documents.detail',
      summary: `Loaded detail for document "${id}".`,
      data: payload,
    };
  }

  if (subcommand === 'reparse') {
    const ids = [...splitFlagList(flags.ids), ...splitFlagList(flags.id)];
    if (!ids.length) throw new Error('Missing --id or --ids for documents reparse.');
    const result = await runDocumentReparseAction(ids);
    return {
      ok: true,
      action: 'documents.reparse',
      summary: `Reparse completed: matched=${result.matchedCount}, succeeded=${result.succeededCount}, failed=${result.failedCount}.`,
      data: result,
    };
  }

  if (subcommand === 'organize') {
    const result = await runDocumentOrganizeAction();
    return {
      ok: true,
      action: 'documents.organize',
      summary: `Auto-grouping completed for ${result.organizedCount} documents.`,
      data: result,
    };
  }

  if (subcommand === 'recluster-ungrouped') {
    const result = await runReclusterUngroupedAction();
    return {
      ok: true,
      action: 'documents.recluster-ungrouped',
      summary: `Reclustered ${result.processedCount} ungrouped documents.`,
      data: result,
    };
  }

  if (subcommand === 'deep-parse') {
    const result = await runDocumentDeepParseAction(flags.limit);
    return {
      ok: true,
      action: 'documents.deep-parse',
      summary: 'Detailed parse batch completed.',
      data: result as Record<string, unknown>,
    };
  }

  if (subcommand === 'canonical-backfill') {
    const result = await runDocumentCanonicalBackfillAction(flags.limit, resolveBooleanFlag(flags.run));
    return {
      ok: true,
      action: 'documents.canonical-backfill',
      summary: result.runImmediately
        ? `Queued ${result.queuedCount}/${result.matchedCount} canonical backfill candidates and ran one detailed-parse batch.`
        : `Queued ${result.queuedCount}/${result.matchedCount} canonical backfill candidates.`,
      data: result as Record<string, unknown>,
    };
  }

  if (subcommand === 'vector-rebuild') {
    const result = await runDocumentVectorRebuildAction();
    return {
      ok: true,
      action: 'documents.vector-rebuild',
      summary: 'Vector rebuild completed.',
      data: result as Record<string, unknown>,
    };
  }

  throw new Error(`Unsupported documents subcommand: ${subcommand}`);
}
