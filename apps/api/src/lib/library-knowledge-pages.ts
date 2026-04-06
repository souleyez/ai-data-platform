import { promises as fs } from 'node:fs';
import path from 'node:path';
import { readDocumentCache } from './document-cache-repository.js';
import { buildDocumentId } from './document-store.js';
import { documentMatchesLibrary, loadDocumentLibraries, type DocumentLibrary } from './document-libraries.js';
import type { ParsedDocument } from './document-parser.js';
import { MEMORY_ROOT } from './paths.js';

export type LibraryKnowledgePagesMode = 'none' | 'overview' | 'topics';

export type LibraryKnowledgeUpdateEntry = {
  documentId: string;
  title: string;
  summary: string;
  updatedAt: string;
};

export type LibraryKnowledgeRepresentativeDocument = {
  documentId: string;
  title: string;
  summary: string;
};

export type LibraryKnowledgeCompilation = {
  version: 1;
  libraryKey: string;
  libraryLabel: string;
  description: string;
  mode: LibraryKnowledgePagesMode;
  updatedAt: string;
  trigger: string;
  documentCount: number;
  overview: string;
  keyTopics: string[];
  keyFacts: string[];
  suggestedQuestions: string[];
  representativeDocuments: LibraryKnowledgeRepresentativeDocument[];
  recentUpdates: LibraryKnowledgeUpdateEntry[];
  sourceDocumentIds: string[];
  sourceTitles: string[];
};

const LIBRARY_PAGES_ROOT = path.join(MEMORY_ROOT, 'library-pages');
const SUMMARY_FILE_NAME = 'summary.json';
const MAX_CONTEXT_LIBRARIES = 3;
const MAX_CONTEXT_CHARS_PER_LIBRARY = 1800;

function normalizeText(value: unknown, maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength
    ? `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`
    : text;
}

function normalizeMode(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'topics' || normalized === 'overview' ? normalized : 'none';
}

function isLibraryKnowledgePagesEnabled(library: Pick<DocumentLibrary, 'knowledgePagesEnabled' | 'knowledgePagesMode'>) {
  return Boolean(library.knowledgePagesEnabled) && normalizeMode(library.knowledgePagesMode) !== 'none';
}

function resolveLibraryDirectory(libraryKey: string) {
  return path.join(LIBRARY_PAGES_ROOT, String(libraryKey || '').trim());
}

function resolveSummaryFile(libraryKey: string) {
  return path.join(resolveLibraryDirectory(libraryKey), SUMMARY_FILE_NAME);
}

function extractDocumentTimestamp(item: ParsedDocument) {
  const candidates = [
    Date.parse(String(item.detailParsedAt || '')),
    Date.parse(String(item.cloudStructuredAt || '')),
    Date.parse(String(item.retainedAt || '')),
  ].filter((value) => Number.isFinite(value) && value > 0);

  const pathMatch = String(item.path || '').match(/(?:^|[\\/])(\d{13})(?:[-_.]|$)/);
  const pathTimestamp = pathMatch ? Number(pathMatch[1]) : 0;
  if (pathTimestamp > 0) candidates.push(pathTimestamp);

  return candidates.length ? Math.max(...candidates) : 0;
}

function sortDocumentsByRecency(items: ParsedDocument[]) {
  return [...items].sort((left, right) => {
    const rightDetail = right.parseStage === 'detailed' || right.detailParseStatus === 'succeeded' ? 1 : 0;
    const leftDetail = left.parseStage === 'detailed' || left.detailParseStatus === 'succeeded' ? 1 : 0;
    if (rightDetail !== leftDetail) return rightDetail - leftDetail;
    return extractDocumentTimestamp(right) - extractDocumentTimestamp(left);
  });
}

function deriveSuggestedQuestions(library: DocumentLibrary, items: ParsedDocument[]) {
  const haystack = `${library.key} ${library.label} ${library.description || ''}`.toLowerCase();
  if (/ioa|enterprise|guidance|规范|指引|流程/.test(haystack)) {
    return [
      'How do I complete a process in this system?',
      'What approvals or restrictions apply?',
      'Which documents define the current policy?',
    ];
  }
  if (/contract|合同|协议/.test(haystack)) {
    return [
      'What are the key obligations and payment terms?',
      'Which clauses or dates are most important?',
      'What changed between related agreements?',
    ];
  }
  if (/technical|api|iot|物联/.test(haystack)) {
    return [
      'What capabilities and modules does this solution include?',
      'What integrations and deployment modes are documented?',
      'Which source explains a given component best?',
    ];
  }
  if (items.some((item) => item.schemaType === 'technical')) {
    return [
      'What is the current process or rule?',
      'Which source document should I trust for details?',
      'What changed recently in this library?',
    ];
  }
  return [
    'What does this library mainly cover?',
    'Which source documents are most relevant?',
    'What changed recently in this library?',
  ];
}

function collectKeyTopics(items: ParsedDocument[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const topic of item.topicTags || []) {
      const normalized = normalizeText(topic, 64);
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'))
    .slice(0, 8)
    .map(([topic, count]) => `${topic} (${count})`);
}

function collectKeyFacts(items: ParsedDocument[]) {
  const facts = new Set<string>();

  for (const item of items) {
    const profile = item.structuredProfile && typeof item.structuredProfile === 'object'
      ? (item.structuredProfile as Record<string, unknown>)
      : null;
    if (profile) {
      const focusedEntries = Array.isArray(profile.focusedFieldEntries)
        ? profile.focusedFieldEntries
        : [];
      for (const entry of focusedEntries) {
        if (!entry || typeof entry !== 'object') continue;
        const key = normalizeText((entry as Record<string, unknown>).alias || (entry as Record<string, unknown>).key, 80);
        const value = normalizeText((entry as Record<string, unknown>).value, 120);
        if (key && value) facts.add(`${key}: ${value}`);
        if (facts.size >= 8) return [...facts];
      }

      const focusedFields = profile.focusedFields && typeof profile.focusedFields === 'object'
        ? (profile.focusedFields as Record<string, unknown>)
        : null;
      for (const [key, value] of Object.entries(focusedFields || {})) {
        const normalizedKey = normalizeText(key, 80);
        const normalizedValue = normalizeText(value, 120);
        if (normalizedKey && normalizedValue) facts.add(`${normalizedKey}: ${normalizedValue}`);
        if (facts.size >= 8) return [...facts];
      }
    }

    const summary = normalizeText(item.summary, 160);
    if (summary) facts.add(summary);
    if (facts.size >= 8) return [...facts];
  }

  return [...facts];
}

function buildRepresentativeDocuments(items: ParsedDocument[]): LibraryKnowledgeRepresentativeDocument[] {
  return sortDocumentsByRecency(items)
    .slice(0, 6)
    .map((item) => ({
      documentId: buildDocumentId(item.path),
      title: normalizeText(item.title || item.name, 100) || 'Untitled document',
      summary: normalizeText(item.summary, 180),
    }));
}

function buildRecentUpdates(items: ParsedDocument[], changedItems: ParsedDocument[]): LibraryKnowledgeUpdateEntry[] {
  const changedPaths = new Set(changedItems.map((item) => String(item.path || '').trim()).filter(Boolean));
  const source = changedPaths.size
    ? sortDocumentsByRecency(items.filter((item) => changedPaths.has(String(item.path || '').trim())))
    : sortDocumentsByRecency(items);

  return source.slice(0, 8).map((item) => {
    const updatedAt = extractDocumentTimestamp(item);
    return {
      documentId: buildDocumentId(item.path),
      title: normalizeText(item.title || item.name, 100) || 'Untitled document',
      summary: normalizeText(item.summary, 160),
      updatedAt: updatedAt ? new Date(updatedAt).toISOString() : '',
    };
  });
}

function buildOverviewText(input: {
  library: DocumentLibrary;
  keyTopics: string[];
  keyFacts: string[];
  representativeDocuments: LibraryKnowledgeRepresentativeDocument[];
}) {
  const description = normalizeText(input.library.description, 180);
  const summaryParts = [
    description ? `${input.library.label} mainly covers ${description}.` : `${input.library.label} is a compiled knowledge view for this library.`,
    input.keyTopics.length
      ? `Key topics include ${input.keyTopics.slice(0, 4).map((entry) => entry.replace(/\s*\(\d+\)$/, '')).join(', ')}.`
      : '',
    input.keyFacts.length
      ? `The most reusable facts include ${input.keyFacts.slice(0, 3).join(' ; ')}.`
      : '',
    input.representativeDocuments.length
      ? `Representative sources include ${input.representativeDocuments.slice(0, 3).map((item) => item.title).join(', ')}.`
      : '',
  ].filter(Boolean);
  return summaryParts.join(' ');
}

function buildLibraryKnowledgeCompilation(
  library: DocumentLibrary,
  items: ParsedDocument[],
  changedItems: ParsedDocument[],
  reason: string,
): LibraryKnowledgeCompilation {
  const sortedItems = sortDocumentsByRecency(items);
  const keyTopics = collectKeyTopics(sortedItems);
  const keyFacts = collectKeyFacts(sortedItems);
  const representativeDocuments = buildRepresentativeDocuments(sortedItems);
  const recentUpdates = buildRecentUpdates(sortedItems, changedItems);
  const sourceDocumentIds = representativeDocuments.map((item) => item.documentId).filter(Boolean);
  const sourceTitles = representativeDocuments.map((item) => item.title).filter(Boolean);
  const overview = buildOverviewText({ library, keyTopics, keyFacts, representativeDocuments });

  return {
    version: 1,
    libraryKey: library.key,
    libraryLabel: library.label,
    description: normalizeText(library.description, 240),
    mode: normalizeMode(library.knowledgePagesMode),
    updatedAt: new Date().toISOString(),
    trigger: normalizeText(reason, 120) || 'library-sync',
    documentCount: sortedItems.length,
    overview,
    keyTopics,
    keyFacts,
    suggestedQuestions: deriveSuggestedQuestions(library, sortedItems),
    representativeDocuments,
    recentUpdates,
    sourceDocumentIds,
    sourceTitles,
  };
}

function buildOverviewMarkdown(summary: LibraryKnowledgeCompilation) {
  return [
    `# ${summary.libraryLabel} Knowledge Overview`,
    '',
    `- Updated: ${summary.updatedAt}`,
    `- Mode: ${summary.mode}`,
    `- Document count: ${summary.documentCount}`,
    summary.description ? `- Description: ${summary.description}` : '',
    '',
    '## Overview',
    summary.overview || '- No overview available yet',
    '',
    '## Suggested Questions',
    ...(summary.suggestedQuestions.length ? summary.suggestedQuestions.map((entry) => `- ${entry}`) : ['- No suggested questions yet']),
    '',
    '## Key Topics',
    ...(summary.keyTopics.length ? summary.keyTopics.map((entry) => `- ${entry}`) : ['- No stable topic clusters yet']),
    '',
    '## Key Facts',
    ...(summary.keyFacts.length ? summary.keyFacts.map((entry) => `- ${entry}`) : ['- No extracted key facts yet']),
    '',
    '## Representative Documents',
    ...(summary.representativeDocuments.length
      ? summary.representativeDocuments.map((item) => item.summary ? `- ${item.title}: ${item.summary}` : `- ${item.title}`)
      : ['- No representative documents yet']),
    '',
  ].filter(Boolean).join('\n');
}

function buildUpdatesMarkdown(summary: LibraryKnowledgeCompilation) {
  return [
    `# ${summary.libraryLabel} Knowledge Updates`,
    '',
    `- Updated: ${summary.updatedAt}`,
    `- Trigger: ${summary.trigger}`,
    `- Mode: ${summary.mode}`,
    '',
    '## Recent Source Updates',
    ...(summary.recentUpdates.length
      ? summary.recentUpdates.map((item) => item.summary
        ? `- [${item.updatedAt || '-'}] ${item.title}: ${item.summary}`
        : `- [${item.updatedAt || '-'}] ${item.title}`)
      : ['- No recent source updates']),
    '',
  ].join('\n');
}

async function writeLibraryKnowledgeFiles(summary: LibraryKnowledgeCompilation) {
  const libraryDir = resolveLibraryDirectory(summary.libraryKey);
  await fs.mkdir(libraryDir, { recursive: true });
  await fs.writeFile(resolveSummaryFile(summary.libraryKey), JSON.stringify(summary, null, 2), 'utf8');
  await fs.writeFile(path.join(libraryDir, 'overview.md'), buildOverviewMarkdown(summary), 'utf8');
  await fs.writeFile(path.join(libraryDir, 'updates.md'), buildUpdatesMarkdown(summary), 'utf8');
}

async function removeLibraryKnowledgeFiles(libraryKey: string) {
  await fs.rm(resolveLibraryDirectory(libraryKey), { recursive: true, force: true });
}

export async function syncLibraryKnowledgePagesForLibraryKeys(libraryKeys: string[], reason: string) {
  const normalizedKeys = [...new Set((libraryKeys || []).map((item) => String(item || '').trim()).filter(Boolean))];
  if (!normalizedKeys.length) {
    return { updatedLibraryCount: 0, removedLibraryCount: 0 };
  }

  const [libraries, cache] = await Promise.all([loadDocumentLibraries(), readDocumentCache()]);
  const items = cache?.items || [];
  let updatedLibraryCount = 0;
  let removedLibraryCount = 0;

  for (const libraryKey of normalizedKeys) {
    const library = libraries.find((item) => item.key === libraryKey);
    if (!library) continue;
    if (!isLibraryKnowledgePagesEnabled(library)) {
      await removeLibraryKnowledgeFiles(library.key);
      removedLibraryCount += 1;
      continue;
    }

    const matchedItems = sortDocumentsByRecency(
      items.filter((item) => item.parseStatus === 'parsed' && documentMatchesLibrary(item, library)),
    );
    if (!matchedItems.length) {
      await removeLibraryKnowledgeFiles(library.key);
      removedLibraryCount += 1;
      continue;
    }

    await writeLibraryKnowledgeFiles(
      buildLibraryKnowledgeCompilation(library, matchedItems, matchedItems.slice(0, 4), reason),
    );
    updatedLibraryCount += 1;
  }

  return { updatedLibraryCount, removedLibraryCount };
}

export async function syncLibraryKnowledgePagesForDocuments(items: ParsedDocument[], reason: string) {
  const normalizedItems = (items || []).filter((item) => item && item.parseStatus === 'parsed');
  if (!normalizedItems.length) {
    return { updatedLibraryCount: 0, removedLibraryCount: 0 };
  }

  const [libraries, cache] = await Promise.all([loadDocumentLibraries(), readDocumentCache()]);
  const allItems = cache?.items || [];
  const affectedKeys = new Set<string>();

  for (const item of normalizedItems) {
    for (const library of libraries) {
      if (documentMatchesLibrary(item, library)) affectedKeys.add(library.key);
    }
  }

  let updatedLibraryCount = 0;
  let removedLibraryCount = 0;

  for (const libraryKey of affectedKeys) {
    const library = libraries.find((entry) => entry.key === libraryKey);
    if (!library) continue;
    if (!isLibraryKnowledgePagesEnabled(library)) continue;

    const matchedItems = sortDocumentsByRecency(
      allItems.filter((item) => item.parseStatus === 'parsed' && documentMatchesLibrary(item, library)),
    );
    const changedItems = normalizedItems.filter((item) => documentMatchesLibrary(item, library));

    if (!matchedItems.length) {
      await removeLibraryKnowledgeFiles(library.key);
      removedLibraryCount += 1;
      continue;
    }

    await writeLibraryKnowledgeFiles(
      buildLibraryKnowledgeCompilation(library, matchedItems, changedItems, reason),
    );
    updatedLibraryCount += 1;
  }

  return { updatedLibraryCount, removedLibraryCount };
}

async function readLibraryKnowledgeCompilation(libraryKey: string) {
  try {
    const raw = await fs.readFile(resolveSummaryFile(libraryKey), 'utf8');
    const parsed = JSON.parse(raw) as LibraryKnowledgeCompilation;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function trimSummaryText(value: string, maxChars = MAX_CONTEXT_CHARS_PER_LIBRARY) {
  const text = normalizeText(value, maxChars);
  return text;
}

function buildSummarySection(summary: LibraryKnowledgeCompilation) {
  const lines = [
    `## ${summary.libraryLabel}`,
    summary.overview ? `Overview: ${trimSummaryText(summary.overview, 420)}` : '',
    summary.keyTopics.length ? `Key topics: ${summary.keyTopics.slice(0, 6).join(' | ')}` : '',
    summary.keyFacts.length ? `Key facts: ${summary.keyFacts.slice(0, 5).join(' | ')}` : '',
    summary.recentUpdates.length
      ? `Recent updates: ${summary.recentUpdates.slice(0, 3).map((item) => item.title).join(' | ')}`
      : '',
  ].filter(Boolean);
  const section = lines.join('\n');
  return trimSummaryText(section, MAX_CONTEXT_CHARS_PER_LIBRARY);
}

export async function buildLibraryKnowledgePagesContextBlock(libraries: Array<{ key: string; label: string }>) {
  const libraryMap = new Map(
    (await loadDocumentLibraries()).map((library) => [library.key, library] as const),
  );

  const candidates = libraries
    .map((library) => ({
      key: String(library.key || '').trim(),
      settings: libraryMap.get(String(library.key || '').trim()),
    }))
    .filter((entry) => entry.key && entry.settings && isLibraryKnowledgePagesEnabled(entry.settings))
    .slice(0, MAX_CONTEXT_LIBRARIES);

  if (!candidates.length) return '';

  const summaries = await Promise.all(
    candidates.map(async (item) => readLibraryKnowledgeCompilation(item.key)),
  );
  const visibleSections = summaries
    .filter((item): item is LibraryKnowledgeCompilation => Boolean(item))
    .map(buildSummarySection)
    .filter(Boolean);

  if (!visibleSections.length) return '';

  return [
    'Compiled library knowledge summary (derived cross-document layer; verify details against structured fields and raw evidence):',
    ...visibleSections,
  ].join('\n\n');
}
