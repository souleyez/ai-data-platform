import { buildDocumentId } from './document-store.js';
import type { DocumentLibrary } from './document-libraries.js';
import type { ParsedDocument } from './document-parser.js';
import type {
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

export function extractDocumentTimestamp(item: ParsedDocument) {
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

export function deriveSuggestedQuestions(library: DocumentLibrary, items: ParsedDocument[]) {
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

export function collectKeyTopics(items: ParsedDocument[]) {
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

export function buildRepresentativeDocuments(items: ParsedDocument[]): LibraryKnowledgeRepresentativeDocument[] {
  return sortDocumentsByRecency(items)
    .slice(0, 6)
    .map((item) => ({
      documentId: buildDocumentId(item.path),
      title: normalizeText(item.title || item.name, 100) || 'Untitled document',
      summary: normalizeText(item.summary, 180),
    }));
}

export function buildRecentUpdates(items: ParsedDocument[], changedItems: ParsedDocument[]): LibraryKnowledgeUpdateEntry[] {
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

export function buildOverviewText(input: {
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
