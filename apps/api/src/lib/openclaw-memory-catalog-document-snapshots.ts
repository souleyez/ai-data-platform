import { buildDocumentId } from './document-store.js';
import { documentMatchesLibrary, type DocumentLibrary } from './document-libraries.js';
import type { ParsedDocument } from './document-parser.js';
import type { OpenClawMemoryDocumentCard, OpenClawMemoryLibrarySnapshot } from './openclaw-memory-catalog-types.js';
import { buildCatalogMemoryDetail } from './openclaw-memory-catalog-document-facts.js';
import {
  buildDocumentFingerprint,
  deriveSuggestedQuestionTypes,
  extractDocumentUpdatedAt,
  resolveAvailability,
  resolveCatalogMemoryDetailLevel,
  sanitizeText,
  selectCatalogMemoryTitle,
  sortDocumentCards,
} from './openclaw-memory-catalog-document-support.js';

function resolveDocumentLibraryKeys(item: ParsedDocument, libraries: DocumentLibrary[]) {
  const matchedLibraries = libraries.filter((library) => documentMatchesLibrary(item, library)).map((library) => library.key);
  return matchedLibraries.length
    ? matchedLibraries
    : [...new Set((item.confirmedGroups?.length ? item.confirmedGroups : item.groups || []).filter(Boolean))];
}

function resolveLibraryScopedDetailLevel(libraryKeys: string[], libraryDocumentCounts: Map<string, number>) {
  const scopedCounts = libraryKeys
    .map((key) => libraryDocumentCounts.get(key))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
  if (!scopedCounts.length) return 'shallow' as const;
  return resolveCatalogMemoryDetailLevel(Math.min(...scopedCounts));
}

function buildDocumentCard(item: ParsedDocument, libraryKeys: string[], libraryDocumentCounts: Map<string, number>): OpenClawMemoryDocumentCard {
  const title = selectCatalogMemoryTitle(item);
  const summary = sanitizeText(item.summary || item.excerpt || '', 280);
  const availability = resolveAvailability(item);
  const updatedAt = extractDocumentUpdatedAt(item);
  const parseStatus = sanitizeText(item.parseStatus, 40);
  const parseStage = sanitizeText(item.parseStage, 40);
  const detailParseStatus = sanitizeText(item.detailParseStatus, 40);
  const detailLevel = resolveLibraryScopedDetailLevel(libraryKeys, libraryDocumentCounts);
  const detail = buildCatalogMemoryDetail(item, detailLevel);

  return {
    id: buildDocumentId(item.path),
    path: item.path,
    title,
    name: sanitizeText(item.name || item.path.split(/[\\/]/).at(-1), 160),
    schemaType: sanitizeText(item.schemaType, 40),
    libraryKeys,
    summary,
    availability,
    updatedAt,
    parseStatus,
    parseStage,
    detailParseStatus,
    topicTags: detail.topicTags,
    detailLevel,
    keyFacts: detail.keyFacts,
    evidenceHighlights: detail.evidenceHighlights,
    fingerprint: buildDocumentFingerprint({
      libraryKeys,
      title,
      summary,
      availability,
      updatedAt,
      parseStatus,
      parseStage,
      detailParseStatus,
      topicTags: detail.topicTags,
      keyFacts: detail.keyFacts,
      evidenceHighlights: detail.evidenceHighlights,
      detailLevel,
    }),
  };
}

function buildLibrarySnapshot(library: DocumentLibrary, cards: OpenClawMemoryDocumentCard[]): OpenClawMemoryLibrarySnapshot {
  const availableCount = cards.filter((item) => item.availability === 'available').length;
  const auditExcludedCount = cards.filter((item) => item.availability === 'audit-excluded').length;
  const structuredOnlyCount = cards.filter((item) => item.availability === 'structured-only').length;
  const unsupportedCount = cards.filter((item) => item.availability === 'unsupported' || item.availability === 'parse-error').length;
  const latestUpdateAt = cards.map((item) => item.updatedAt).filter(Boolean).sort().at(-1) || '';

  return {
    key: library.key,
    label: library.label,
    description: sanitizeText(library.description, 200),
    documentCount: cards.length,
    availableCount,
    auditExcludedCount,
    structuredOnlyCount,
    unsupportedCount,
    latestUpdateAt,
    representativeDocumentTitles: cards.slice(0, 5).map((item) => item.title),
    suggestedQuestionTypes: deriveSuggestedQuestionTypes(library),
    memoryDetailLevel: resolveCatalogMemoryDetailLevel(cards.length),
  };
}

export function buildCatalogDocumentSnapshots(input: {
  libraries: DocumentLibrary[];
  documents: ParsedDocument[];
}) {
  const resolvedDocuments = input.documents.map((item) => ({
    item,
    libraryKeys: resolveDocumentLibraryKeys(item, input.libraries),
  }));
  const libraryDocumentCounts = new Map<string, number>();
  for (const document of resolvedDocuments) {
    for (const key of document.libraryKeys) {
      libraryDocumentCounts.set(key, (libraryDocumentCounts.get(key) || 0) + 1);
    }
  }

  const cards = sortDocumentCards(
    resolvedDocuments.map(({ item, libraryKeys }) => buildDocumentCard(item, libraryKeys, libraryDocumentCounts)),
  );
  const librarySnapshots = input.libraries.map((library) => (
    buildLibrarySnapshot(library, cards.filter((item) => item.libraryKeys.includes(library.key)))
  ));

  return { cards, librarySnapshots };
}
