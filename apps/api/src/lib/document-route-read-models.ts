import { buildDocumentId } from './document-store.js';
import { documentMatchesLibrary, type DocumentLibrary } from './document-libraries.js';
import type { ParsedDocument } from './document-parser.js';
import type { OpenClawMemorySyncStatus } from './openclaw-memory-sync.js';

function truncateText(value: unknown, maxLength: number) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function toListItem<T extends Record<string, unknown>>(item: T) {
  const source = item as T & {
    id?: string;
    path?: string;
    name?: string;
    ext?: string;
    title?: string;
    category?: string;
    parseStatus?: string;
    parseMethod?: string;
    summary?: string;
    excerpt?: string;
    topicTags?: string[];
    groups?: string[];
    confirmedGroups?: string[];
    suggestedGroups?: string[];
    ignored?: boolean;
    retentionStatus?: string;
    riskLevel?: string;
    parseStage?: string;
    schemaType?: string;
    structuredProfile?: Record<string, unknown>;
    categoryConfirmedAt?: string;
    retainedAt?: string;
    originalDeletedAt?: string;
    detailParseStatus?: string;
    detailParseQueuedAt?: string;
    detailParsedAt?: string;
    detailParseAttempts?: number;
    detailParseError?: string;
  };

  return {
    id: source.id,
    path: source.path,
    name: source.name,
    ext: source.ext,
    title: source.title,
    category: source.category,
    parseStatus: source.parseStatus,
    parseMethod: source.parseMethod,
    summary: truncateText(source.summary, 220),
    excerpt: truncateText(source.excerpt, 280),
    topicTags: (source.topicTags || []).slice(0, 8),
    groups: source.groups || [],
    confirmedGroups: source.confirmedGroups || [],
    suggestedGroups: source.suggestedGroups || [],
    ignored: Boolean(source.ignored),
    retentionStatus: source.retentionStatus,
    riskLevel: source.riskLevel,
    parseStage: source.parseStage,
    schemaType: source.schemaType,
    structuredProfile: source.structuredProfile,
    groupConfirmedAt: source.categoryConfirmedAt,
    retainedAt: source.retainedAt,
    originalDeletedAt: source.originalDeletedAt,
    detailParseStatus: source.detailParseStatus,
    detailParseQueuedAt: source.detailParseQueuedAt,
    detailParsedAt: source.detailParsedAt,
    detailParseAttempts: source.detailParseAttempts,
    detailParseError: source.detailParseError,
  };
}

export function extractDocumentTimestamp(item: { name?: string; path?: string }) {
  const text = `${item?.name || ''} ${item?.path || ''}`;
  const match = text.match(/(\d{13})/);
  return match ? Number(match[1]) : 0;
}

export function resolveLibraryScenarioKey(
  library: { key: string },
  _items: Array<{ bizCategory?: string }>,
) {
  if (['paper', 'contract', 'daily', 'invoice', 'order', 'service', 'inventory'].includes(String(library.key || ''))) {
    return library.key === 'paper' ? 'paper' : library.key;
  }
  return 'default';
}

export function buildMatchedFolders(
  categories: Record<string, { label: string; folders: string[] }>,
  filePath: string,
) {
  return Object.entries(categories)
    .filter(([, value]) => value.folders.some((folder) => folder && filePath.toLowerCase().includes(folder.toLowerCase())))
    .map(([key, value]) => ({ key, label: value.label, folders: value.folders }));
}

export function buildDocumentsIndexPayload(input: {
  config: { scanRoot: string; scanRoots?: string[] };
  exists: boolean;
  files: string[];
  totalFiles?: number;
  items: ParsedDocument[];
  cacheHit: boolean;
  generatedAt?: string;
  loadedFrom?: 'cache' | 'scan';
  durationMs?: number;
  libraries: DocumentLibrary[];
  memorySync?: OpenClawMemorySyncStatus | null;
}) {
  const byExtension = input.items.reduce<Record<string, number>>((acc, item) => {
    acc[item.ext] = (acc[item.ext] || 0) + 1;
    return acc;
  }, {});

  const byCategory = input.items.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  const byStatus = input.items.reduce<Record<string, number>>((acc, item) => {
    acc[item.parseStatus] = (acc[item.parseStatus] || 0) + 1;
    return acc;
  }, {});

  const libraryCounts = input.libraries.reduce<Record<string, number>>((acc, library) => {
    acc[library.key] = input.items.filter((item) => documentMatchesLibrary(item, library)).length;
    return acc;
  }, {});

  const generatedAt = input.generatedAt || new Date().toISOString();
  const loadedFrom = input.loadedFrom || (input.cacheHit ? 'cache' : 'scan');

  return {
    mode: 'read-only',
    scanRoot: input.config.scanRoot,
    scanRoots: input.config.scanRoots,
    exists: input.exists,
    totalFiles: input.totalFiles ?? input.files.length,
    byExtension,
    byCategory,
    byStatus,
    items: input.items.map((item) => toListItem({ ...item, id: buildDocumentId(item.path) })),
    capabilities: ['scan', 'summarize', 'group'],
    cacheHit: input.cacheHit,
    generatedAt,
    loadedFrom,
    durationMs: Math.max(0, Number(input.durationMs || 0)),
    lastScanAt: generatedAt,
    config: input.config,
    libraries: input.libraries,
    meta: {
      parsed: byStatus.parsed || 0,
      unsupported: byStatus.unsupported || 0,
      error: byStatus.error || 0,
      libraryCounts,
      memorySync: input.memorySync || null,
    },
  };
}

export function buildDocumentsOverviewPayload(input: {
  config: { scanRoot: string; scanRoots?: string[] };
  exists: boolean;
  files: string[];
  totalFiles?: number;
  items: ParsedDocument[];
  cacheHit: boolean;
  generatedAt?: string;
  loadedFrom?: 'cache' | 'scan';
  durationMs?: number;
  libraries: DocumentLibrary[];
  memorySync?: OpenClawMemorySyncStatus | null;
}) {
  const summarizedLibraries = input.libraries
    .map((library) => {
      const matchedItems = input.items.filter((item) => documentMatchesLibrary(item, library));
      const lastUpdatedAt = matchedItems.reduce((latest, item) => Math.max(latest, extractDocumentTimestamp(item)), 0);

      return {
        ...library,
        documentCount: matchedItems.length,
        lastUpdatedAt,
        scenarioKey: resolveLibraryScenarioKey(library, matchedItems),
      };
    })
    .sort((a, b) => {
      const countDiff = b.documentCount - a.documentCount;
      if (countDiff !== 0) return countDiff;

      const updatedDiff = b.lastUpdatedAt - a.lastUpdatedAt;
      if (updatedDiff !== 0) return updatedDiff;

      if (a.key === 'ungrouped' || b.key === 'ungrouped') {
        return a.key === 'ungrouped' ? 1 : -1;
      }

      return String(a.label || '').localeCompare(String(b.label || ''), 'zh-CN');
    });

  const generatedAt = input.generatedAt || new Date().toISOString();
  const loadedFrom = input.loadedFrom || (input.cacheHit ? 'cache' : 'scan');

  return {
    mode: 'read-only',
    scanRoot: input.config.scanRoot,
    scanRoots: input.config.scanRoots,
    exists: input.exists,
    totalFiles: input.totalFiles ?? input.files.length,
    parsed: input.items.filter((item) => item.parseStatus === 'parsed').length,
    cacheHit: input.cacheHit,
    generatedAt,
    loadedFrom,
    durationMs: Math.max(0, Number(input.durationMs || 0)),
    lastScanAt: generatedAt,
    memorySync: input.memorySync || null,
    libraries: summarizedLibraries,
  };
}

export function buildDocumentLibrariesPayload(input: {
  items: ParsedDocument[];
  libraries: DocumentLibrary[];
  generatedAt?: string;
  loadedFrom?: 'cache' | 'scan';
  durationMs?: number;
}) {
  return {
    mode: 'read-only',
    generatedAt: input.generatedAt || new Date().toISOString(),
    loadedFrom: input.loadedFrom || 'cache',
    durationMs: Math.max(0, Number(input.durationMs || 0)),
    items: input.libraries.map((library) => ({
      ...library,
      documentCount: input.items.filter((item) => documentMatchesLibrary(item, library)).length,
    })),
  };
}
