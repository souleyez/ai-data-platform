import path from 'node:path';
import { filterDocumentsForBot } from './bot-visibility.js';
import type { BotDefinition } from './bot-definitions.js';
import { getParsedDocumentCanonicalText } from './document-canonical-text.js';
import { documentMatchesLibrary, loadDocumentLibraries } from './document-libraries.js';
import type { ParsedDocument } from './document-parser.js';
import { loadParsedDocuments } from './document-store.js';
import type { KnowledgeLibraryRef } from './knowledge-supply.js';

const UPLOADED_DOCUMENT_CHAT_CONTEXT_CHAR_LIMIT = 5000;
const MATCHED_DOCUMENT_SUPPLY_CHAR_LIMIT = 5000;
const MATCHED_DOCUMENT_SUPPLY_DOC_LIMIT = 3;
const UPLOADED_DOCUMENT_FULL_TEXT_HINT_PATTERNS = [
  /这份(?:文档|文件|材料)?/,
  /这个(?:文档|文件|材料)?/,
  /该(?:文档|文件|材料)?/,
  /刚上传(?:的)?(?:文档|文件|材料)?/,
  /上传(?:的)?(?:文档|文件|材料)?/,
  /基于(?:这份|这个|该|刚上传的|上传的)/,
  /根据(?:这份|这个|该|刚上传的|上传的)/,
  /围绕(?:这份|这个|该|刚上传的|上传的)/,
  /uploaded (?:document|file)/i,
  /just uploaded/i,
  /this (?:document|file)/i,
  /based on (?:the )?(?:uploaded|this) (?:document|file)/i,
];

function trimUploadedDocumentContextText(text: string, maxChars = UPLOADED_DOCUMENT_CHAT_CONTEXT_CHAR_LIMIT) {
  const normalized = String(text || '').trim();
  if (!normalized) return '';
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function extractDocumentTimestamp(item: Pick<ParsedDocument, 'path' | 'detailParsedAt' | 'cloudStructuredAt' | 'retainedAt'>) {
  const candidates = [
    Date.parse(String(item.detailParsedAt || '')),
    Date.parse(String(item.cloudStructuredAt || '')),
    Date.parse(String(item.retainedAt || '')),
  ].filter((value) => Number.isFinite(value) && value > 0);

  const match = String(item.path || '').match(/(?:^|[\\/])(\d{13})(?:[-_.]|$)/);
  if (match) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) {
      candidates.push(value);
    }
  }

  return candidates.length ? Math.max(...candidates) : 0;
}

function isDetailedFullTextDocument(item: ParsedDocument) {
  return item.parseStatus === 'parsed'
    && Boolean(getParsedDocumentCanonicalText(item))
    && (
      item.parseStage === 'detailed'
      || item.detailParseStatus === 'succeeded'
      || Boolean(item.detailParsedAt)
    );
}

function isGeneratedReportLibraryDocument(item: Pick<ParsedDocument, 'path'>) {
  return /[\\/]generated-report-library[\\/]/i.test(String(item.path || ''));
}

export function selectLatestDetailedFullTextDocument(documents: ParsedDocument[], preferredPath?: string) {
  const detailedDocuments = [...(documents || [])].filter(isDetailedFullTextDocument);
  const normalizedPreferredPath = String(preferredPath || '').trim().toLowerCase();
  if (normalizedPreferredPath) {
    const preferredDocument = detailedDocuments.find((item) => String(item.path || '').trim().toLowerCase() === normalizedPreferredPath);
    if (preferredDocument) return preferredDocument;
  }
  const preferredDocuments = detailedDocuments.filter((item) => !isGeneratedReportLibraryDocument(item));
  const candidates = preferredDocuments.length ? preferredDocuments : detailedDocuments;

  return candidates
    .sort((left, right) => {
      const leftDetailed = left.parseStage === 'detailed' || left.detailParseStatus === 'succeeded' ? 1 : 0;
      const rightDetailed = right.parseStage === 'detailed' || right.detailParseStatus === 'succeeded' ? 1 : 0;
      if (rightDetailed !== leftDetailed) return rightDetailed - leftDetailed;
      return extractDocumentTimestamp(right) - extractDocumentTimestamp(left);
    })[0] || null;
}

export function buildLatestParsedDocumentFullTextContextBlock(document?: Pick<
  ParsedDocument,
  'title' | 'name' | 'path' | 'schemaType' | 'parseStage' | 'detailParseStatus' | 'fullText' | 'markdownText'
> | null) {
  const fullText = trimUploadedDocumentContextText(getParsedDocumentCanonicalText(document));
  if (!fullText) return '';

  return [
    'Latest parsed document full text:',
    `Title: ${String(document?.title || document?.name || 'Untitled document').trim()}`,
    `Path: ${String(document?.path || '').trim()}`,
    `Type: ${String(document?.schemaType || '').trim() || 'generic'}`,
    `Parse stage: ${String(document?.parseStage || '').trim() || '-'}`,
    `Detail parse status: ${String(document?.detailParseStatus || '').trim() || '-'}`,
    `Full text:\n${fullText}`,
  ].join('\n\n');
}

export function buildMatchedDocumentFullTextContextBlocks(input: {
  documents: ParsedDocument[];
  preferredDocumentPath?: string;
}) {
  const normalizedPreferredPath = String(input.preferredDocumentPath || '').trim().toLowerCase();
  const matchedDocuments = [...(input.documents || [])]
    .filter((item) => Boolean(getParsedDocumentCanonicalText(item)))
    .sort((left, right) => {
      const leftPreferred = normalizedPreferredPath && String(left.path || '').trim().toLowerCase() === normalizedPreferredPath ? 1 : 0;
      const rightPreferred = normalizedPreferredPath && String(right.path || '').trim().toLowerCase() === normalizedPreferredPath ? 1 : 0;
      if (rightPreferred !== leftPreferred) return rightPreferred - leftPreferred;
      return extractDocumentTimestamp(right) - extractDocumentTimestamp(left);
    })
    .slice(0, MATCHED_DOCUMENT_SUPPLY_DOC_LIMIT);

  return matchedDocuments.map((document, index) => [
    `Matched document full text ${index + 1}:`,
    `Title: ${String(document.title || document.name || 'Untitled document').trim()}`,
    `Path: ${String(document.path || '').trim()}`,
    `Type: ${String(document.schemaType || '').trim() || 'generic'}`,
    `Parse stage: ${String(document.parseStage || '').trim() || '-'}`,
    `Detail parse status: ${String(document.detailParseStatus || '').trim() || '-'}`,
    `Full text:\n${trimUploadedDocumentContextText(getParsedDocumentCanonicalText(document), MATCHED_DOCUMENT_SUPPLY_CHAR_LIMIT)}`,
  ].join('\n\n'));
}

function requestExplicitlyTargetsUploadedDocument(requestText?: string | null) {
  const source = String(requestText || '').trim();
  if (!source) return false;
  return UPLOADED_DOCUMENT_FULL_TEXT_HINT_PATTERNS.some((pattern) => pattern.test(source));
}

export function shouldIncludeUploadedDocumentFullText(
  requestText?: string | null,
  preferredDocumentPath?: string | null,
) {
  if (!String(preferredDocumentPath || '').trim()) return false;
  return requestExplicitlyTargetsUploadedDocument(requestText);
}

export async function loadLatestVisibleDetailedDocumentContext(input: {
  botDefinition?: BotDefinition | null;
  effectiveVisibleLibraryKeys?: string[];
  preferredDocumentPath?: string;
}) {
  const [documentLibraries, documentState] = await Promise.all([
    loadDocumentLibraries(),
    loadParsedDocuments(240, false),
  ]);

  const baseVisibleItems = input.botDefinition
    ? filterDocumentsForBot(input.botDefinition, documentState.items, documentLibraries)
    : documentState.items;
  const effectiveVisibleLibrarySet = Array.isArray(input.effectiveVisibleLibraryKeys)
    ? new Set(input.effectiveVisibleLibraryKeys.map((item) => String(item || '').trim()).filter(Boolean))
    : null;
  const visibleItems = effectiveVisibleLibrarySet
    ? baseVisibleItems.filter((item) => documentLibraries.some((library) => (
      effectiveVisibleLibrarySet.has(library.key) && documentMatchesLibrary(item, library)
    )))
    : baseVisibleItems;

  const normalizedPreferredPath = String(input.preferredDocumentPath || '').trim().toLowerCase();
  const preferredDocument = normalizedPreferredPath
    ? visibleItems.find((item) => String(item.path || '').trim().toLowerCase() === normalizedPreferredPath) || null
    : null;
  const preferredLibraries = preferredDocument
    ? documentLibraries
      .filter((library) => (
        (!effectiveVisibleLibrarySet || effectiveVisibleLibrarySet.has(library.key))
        && documentMatchesLibrary(preferredDocument, library)
      ))
      .map((library): KnowledgeLibraryRef => ({
        key: library.key,
        label: library.label,
      }))
    : [];

  let document = preferredDocument;
  let libraries = preferredLibraries;
  if (normalizedPreferredPath && preferredDocument && !isDetailedFullTextDocument(preferredDocument)) {
    document = null;
  } else if (normalizedPreferredPath && !preferredDocument) {
    document = null;
    libraries = [];
  } else if (!normalizedPreferredPath) {
    document = selectLatestDetailedFullTextDocument(visibleItems, input.preferredDocumentPath);
    const latestVisibleDocument = document;
    libraries = latestVisibleDocument
      ? documentLibraries
        .filter((library) => (
          (!effectiveVisibleLibrarySet || effectiveVisibleLibrarySet.has(library.key))
          && documentMatchesLibrary(latestVisibleDocument, library)
        ))
        .map((library): KnowledgeLibraryRef => ({
          key: library.key,
          label: library.label,
        }))
      : [];
  }

  return {
    document,
    libraries,
    preferredDocument,
    preferredDocumentReady: Boolean(preferredDocument && isDetailedFullTextDocument(preferredDocument)),
  };
}
