import { loadDocumentDetailPayload } from './document-route-detail-loaders.js';
import {
  runDocumentCanonicalBackfillAction,
  runDocumentDeepParseAction,
  runDocumentOrganizeAction,
  runDocumentReparseAction,
  runDocumentVectorRebuildAction,
  runReclusterUngroupedAction,
} from './document-route-operations.js';
import { ingestLocalFilesIntoLibrary } from './document-upload-ingest.js';
import { DEFAULT_SCAN_DIR } from './document-store.js';
import { readOpenClawMemorySyncStatus } from './openclaw-memory-sync.js';
import type {
  CommandFlags,
  PlatformControlResult,
} from './platform-control-documents-support.js';
import {
  loadDocumentListData,
  resolveBooleanFlag,
  resolveTargetLibrariesFromFlags,
  splitFlagList,
} from './platform-control-documents-support.js';

export async function runDocumentActionCommand(subcommand: string, flags: CommandFlags): Promise<PlatformControlResult | null> {
  if (subcommand === 'list') {
    const data = await loadDocumentListData(flags);
    return {
      ok: true,
      action: 'documents.list',
      summary: `Loaded ${data.items.length} documents${data.library ? ` from ${data.library.label}` : ''}.`,
      data: {
        library: data.library,
        totalCached: data.totalCached,
        availableLibraries: data.availableLibraries,
        items: data.items,
      },
    };
  }

  if (subcommand === 'import-local') {
    const filePaths = [...splitFlagList(flags.paths), ...splitFlagList(flags.path)];
    if (!filePaths.length) {
      throw new Error('Missing --path or --paths for documents import-local.');
    }
    const targetLibraries = await resolveTargetLibrariesFromFlags(flags);
    const data = await loadDocumentListData({});
    const ingestResult = await ingestLocalFilesIntoLibrary({
      filePaths,
      documentConfig: data.documentConfig,
      libraries: data.librariesRaw,
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

  return null;
}
