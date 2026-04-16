import { loadDocumentCategoryConfig } from './document-config.js';
import {
  documentMatchesLibrary,
  loadDocumentLibraries,
} from './document-libraries.js';
import { DEFAULT_SCAN_DIR, buildDocumentId, loadParsedDocuments } from './document-store.js';

export type CommandFlags = Record<string, string>;

export type PlatformControlResult = {
  ok: boolean;
  action: string;
  summary: string;
  data?: Record<string, unknown>;
};

export function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function clampLimit(value: string | undefined, fallback: number, max: number) {
  return Math.max(1, Math.min(max, Number(value || fallback) || fallback));
}

export function splitFlagList(value: string | undefined) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function resolveBooleanFlag(value: string | undefined) {
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

export async function resolveLibraryReference(reference: string) {
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

export async function resolveTargetLibrariesFromFlags(flags: CommandFlags) {
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

export function summarizeDocumentItem(item: Awaited<ReturnType<typeof loadParsedDocuments>>['items'][number]) {
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

export async function loadDocumentListData(flags: CommandFlags) {
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
    library: scopeLibrary ? { key: scopeLibrary.key, label: scopeLibrary.label } : null,
    totalCached: snapshot.items.length,
    availableLibraries: libraries.map((item) => ({ key: item.key, label: item.label })),
    items,
    documentConfig: await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR),
    librariesRaw: libraries,
  };
}
