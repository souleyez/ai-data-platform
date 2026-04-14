import {
  loadDocumentExtractionGovernance,
  normalizeDocumentExtractionFieldValues,
  resolveDocumentExtractionConflictValues,
  resolveDocumentExtractionFieldConflictStrategy,
  resolveDocumentExtractionProfile,
} from './document-extraction-governance.js';
import { buildDocumentId } from './document-store.js';
import type { DocumentLibrary } from './document-libraries.js';
import type { ParsedDocument } from './document-parser.js';
import type {
  LibraryKnowledgeCompilation,
  LibraryKnowledgeFieldConflict,
  LibraryKnowledgeFocusedFieldCoverage,
  LibraryKnowledgePagesMode,
  LibraryKnowledgeRepresentativeDocument,
  LibraryKnowledgeUpdateEntry,
} from './library-knowledge-pages-types.js';

const LIBRARY_KNOWLEDGE_PILOT_KEYS = new Set(['xinshijie-ioa']);

export function normalizeText(value: unknown, maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength
    ? `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`
    : text;
}

export function normalizeMode(value: unknown): LibraryKnowledgePagesMode {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'topics' || normalized === 'overview' ? normalized : 'none';
}

export function isLibraryKnowledgePilotTarget(libraryKey: string) {
  return LIBRARY_KNOWLEDGE_PILOT_KEYS.has(String(libraryKey || '').trim().toLowerCase());
}

export function isLibraryKnowledgePagesEnabled(library: Pick<DocumentLibrary, 'knowledgePagesEnabled' | 'knowledgePagesMode'>) {
  return Boolean(library.knowledgePagesEnabled) && normalizeMode(library.knowledgePagesMode) !== 'none';
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

export function sortDocumentsByRecency(items: ParsedDocument[]) {
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

function toTextValueList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeText(entry, 160)).filter(Boolean);
  }
  const text = normalizeText(value, 160);
  return text ? [text] : [];
}

function extractDocumentFieldValues(item: ParsedDocument, key: string) {
  const profile = item.structuredProfile && typeof item.structuredProfile === 'object' && !Array.isArray(item.structuredProfile)
    ? item.structuredProfile as Record<string, unknown>
    : null;
  if (!profile) return [];

  const focusedEntries = Array.isArray(profile.focusedFieldEntries)
    ? profile.focusedFieldEntries
    : [];
  for (const entry of focusedEntries) {
    if (!entry || typeof entry !== 'object') continue;
    if (String((entry as Record<string, unknown>).key || '').trim() !== key) continue;
    const values = toTextValueList((entry as Record<string, unknown>).value);
    if (values.length) return values;
  }

  const fieldDetails = profile.fieldDetails && typeof profile.fieldDetails === 'object' && !Array.isArray(profile.fieldDetails)
    ? profile.fieldDetails as Record<string, unknown>
    : null;
  const detail = fieldDetails?.[key];
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const values = toTextValueList((detail as Record<string, unknown>).value);
    if (values.length) return values;
  }

  return toTextValueList(profile[key]);
}

function buildFocusedFieldCoverage(library: DocumentLibrary, items: ParsedDocument[]) {
  const profile = resolveDocumentExtractionProfile(
    loadDocumentExtractionGovernance(),
    { keys: [library.key], labels: [library.label] },
  );
  if (!profile?.preferredFieldKeys?.length) {
    return {
      fieldSet: '',
      coverage: [] as LibraryKnowledgeFocusedFieldCoverage[],
      conflicts: [] as LibraryKnowledgeFieldConflict[],
    };
  }

  const coverage = profile.preferredFieldKeys.map((fieldKey) => {
    const alias = normalizeText(profile.fieldAliases?.[fieldKey] || fieldKey, 64) || fieldKey;
    const prompt = normalizeText(profile.fieldPrompts?.[fieldKey], 120);
    const valuesByDocument = items.map((item) => {
      const rawValues = extractDocumentFieldValues(item, fieldKey);
      const normalizedValues = resolveDocumentExtractionConflictValues(
        fieldKey,
        normalizeDocumentExtractionFieldValues(fieldKey, rawValues, profile),
        profile,
        'merge-distinct',
      );
      return {
        title: normalizeText(item.title || item.name, 80) || 'Untitled document',
        values: normalizedValues,
      };
    }).filter((entry) => entry.values.length);

    const distinctValues = [...new Set(valuesByDocument.flatMap((entry) => entry.values))];
    return {
      key: fieldKey,
      alias,
      prompt,
      conflictStrategy: resolveDocumentExtractionFieldConflictStrategy(fieldKey, profile, 'merge-distinct'),
      populatedDocumentCount: valuesByDocument.length,
      totalDocumentCount: items.length,
      coverageRatio: items.length ? Number((valuesByDocument.length / items.length).toFixed(2)) : 0,
      resolvedValues: resolveDocumentExtractionConflictValues(fieldKey, distinctValues, profile, 'merge-distinct').slice(0, 4),
      sampleValues: distinctValues.slice(0, 4),
      sampleDocumentTitles: valuesByDocument.slice(0, 3).map((entry) => entry.title),
    };
  });

  const conflicts = coverage
    .filter((entry) => entry.sampleValues.length > 1)
    .slice(0, 6)
    .map((entry) => ({
      key: entry.key,
      alias: entry.alias,
      conflictStrategy: entry.conflictStrategy,
      values: entry.sampleValues,
      sampleDocumentTitles: (entry as typeof entry & { sampleDocumentTitles?: string[] }).sampleDocumentTitles || [],
    }));

  return {
    fieldSet: profile.fieldSet,
    coverage: coverage.map(({ sampleDocumentTitles: _sampleDocumentTitles, ...entry }) => entry),
    conflicts,
  };
}

function collectKeyFacts(items: ParsedDocument[], focusedFieldCoverage: LibraryKnowledgeFocusedFieldCoverage[] = []) {
  const facts = new Set<string>();

  for (const entry of focusedFieldCoverage) {
    if (!entry.resolvedValues.length) continue;
    facts.add(`${entry.alias}: ${entry.resolvedValues.join(' / ')}`);
    if (facts.size >= 8) return [...facts];
  }

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
  focusedFieldCoverage: LibraryKnowledgeFocusedFieldCoverage[];
  representativeDocuments: LibraryKnowledgeRepresentativeDocument[];
}) {
  const description = normalizeText(input.library.description, 180);
  const coverageSummary = input.focusedFieldCoverage
    .filter((entry) => entry.populatedDocumentCount > 0)
    .slice(0, 3)
    .map((entry) => `${entry.alias}${Math.round(entry.coverageRatio * 100)}%`)
    .join('、');
  const summaryParts = [
    description ? `${input.library.label} mainly covers ${description}.` : `${input.library.label} is a compiled knowledge view for this library.`,
    input.keyTopics.length
      ? `Key topics include ${input.keyTopics.slice(0, 4).map((entry) => entry.replace(/\s*\(\d+\)$/, '')).join(', ')}.`
      : '',
    input.keyFacts.length
      ? `The most reusable facts include ${input.keyFacts.slice(0, 3).join(' ; ')}.`
      : '',
    coverageSummary ? `Focused field coverage currently centers on ${coverageSummary}.` : '',
    input.representativeDocuments.length
      ? `Representative sources include ${input.representativeDocuments.slice(0, 3).map((item) => item.title).join(', ')}.`
      : '',
  ].filter(Boolean);
  return summaryParts.join(' ');
}

export function buildLibraryKnowledgeCompilation(
  library: DocumentLibrary,
  items: ParsedDocument[],
  changedItems: ParsedDocument[],
  reason: string,
): LibraryKnowledgeCompilation {
  const sortedItems = sortDocumentsByRecency(items);
  const focusedFieldSummary = buildFocusedFieldCoverage(library, sortedItems);
  const keyTopics = collectKeyTopics(sortedItems);
  const keyFacts = collectKeyFacts(sortedItems, focusedFieldSummary.coverage);
  const representativeDocuments = buildRepresentativeDocuments(sortedItems);
  const recentUpdates = buildRecentUpdates(sortedItems, changedItems);
  const sourceDocumentIds = representativeDocuments.map((item) => item.documentId).filter(Boolean);
  const sourceTitles = representativeDocuments.map((item) => item.title).filter(Boolean);
  const overview = buildOverviewText({
    library,
    keyTopics,
    keyFacts,
    focusedFieldCoverage: focusedFieldSummary.coverage,
    representativeDocuments,
  });

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
    focusedFieldSet: focusedFieldSummary.fieldSet || undefined,
    focusedFieldCoverage: focusedFieldSummary.coverage,
    fieldConflicts: focusedFieldSummary.conflicts,
    suggestedQuestions: deriveSuggestedQuestions(library, sortedItems),
    representativeDocuments,
    recentUpdates,
    sourceDocumentIds,
    sourceTitles,
    pilotValidated: isLibraryKnowledgePilotTarget(library.key),
  };
}

export function buildOverviewMarkdown(summary: LibraryKnowledgeCompilation) {
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
    '## Focused Field Coverage',
    ...(summary.focusedFieldCoverage?.length
      ? summary.focusedFieldCoverage.map((entry) => {
        const coverage = `${entry.populatedDocumentCount}/${entry.totalDocumentCount}`;
        const resolvedValues = entry.resolvedValues.length ? ` => ${entry.resolvedValues.join(' / ')}` : '';
        const prompt = entry.prompt ? ` [hint: ${entry.prompt}]` : '';
        return `- ${entry.alias} (${coverage}, ${Math.round(entry.coverageRatio * 100)}%, ${entry.conflictStrategy})${resolvedValues}${prompt}`;
      })
      : ['- No governed field coverage yet']),
    '',
    '## Field Conflicts',
    ...(summary.fieldConflicts?.length
      ? summary.fieldConflicts.map((entry) => `- ${entry.alias} (${entry.conflictStrategy}): ${entry.values.join(' / ')}`)
      : ['- No multi-value conflicts detected']),
    '',
    '## Representative Documents',
    ...(summary.representativeDocuments.length
      ? summary.representativeDocuments.map((item) => item.summary ? `- ${item.title}: ${item.summary}` : `- ${item.title}`)
      : ['- No representative documents yet']),
    '',
  ].filter(Boolean).join('\n');
}

export function buildUpdatesMarkdown(summary: LibraryKnowledgeCompilation) {
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
