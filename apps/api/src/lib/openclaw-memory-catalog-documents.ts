import path from 'node:path';
import { buildDocumentId } from './document-store.js';
import {
  isContractDocumentSignal,
  isFootfallDocumentSignal,
  isInventoryDocumentSignal,
  isIotDocumentSignal,
  isOrderDocumentSignal,
  isPaperDocumentSignal,
} from './document-domain-signals.js';
import { documentMatchesLibrary, type DocumentLibrary } from './document-libraries.js';
import type { ParsedDocument } from './document-parser.js';
import type {
  CatalogMemoryDetailLevel,
  OpenClawMemoryDocumentCard,
  OpenClawMemoryLibrarySnapshot,
} from './openclaw-memory-catalog-types.js';

const SMALL_LIBRARY_DETAIL_LIMIT = Math.max(3, Number(process.env.OPENCLAW_MEMORY_SMALL_LIBRARY_DETAIL_LIMIT || 20));
const MEDIUM_LIBRARY_DETAIL_LIMIT = Math.max(
  SMALL_LIBRARY_DETAIL_LIMIT + 1,
  Number(process.env.OPENCLAW_MEMORY_MEDIUM_LIBRARY_DETAIL_LIMIT || 80),
);

function sanitizeText(value: unknown, maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...` : text;
}

function sanitizeList(values: unknown[], maxLength = 80, limit = 6) {
  return [...new Set(values.map((item) => sanitizeText(item, maxLength)).filter(Boolean))].slice(0, limit);
}

function sanitizeFact(value: unknown, maxLength = 160) {
  return sanitizeText(value, maxLength).replace(/^[-:：\s]+/, '').trim();
}

function extractDocumentUpdatedAt(item: ParsedDocument) {
  const candidates = [
    item.detailParsedAt,
    item.cloudStructuredAt,
    item.retainedAt,
    item.originalDeletedAt,
    item.groupConfirmedAt,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  const base = candidates.length ? Math.max(...candidates) : 0;
  return base > 0 ? new Date(base).toISOString() : '';
}

function resolveAvailability(item: ParsedDocument) {
  if (item.ignored) return 'audit-excluded';
  if (item.retentionStatus === 'structured-only') return 'structured-only';
  if (item.parseStatus === 'error') return 'parse-error';
  if (item.parseStatus === 'unsupported') return 'unsupported';
  return 'available';
}

function deriveSuggestedQuestionTypes(library: DocumentLibrary) {
  const haystack = `${library.key} ${library.label} ${library.description || ''}`.toLowerCase();
  if (/resume|简历|人才|候选/.test(haystack)) return ['latest resumes', 'candidate comparison', 'role matching'];
  if (/order|订单|inventory|库存|sku|erp/.test(haystack)) return ['order summary', 'inventory health', 'channel or sku comparison'];
  if (/bid|招标|投标|标书|tender/.test(haystack)) return ['qualification risk', 'bid comparison', 'evidence summary'];
  if (/iot|物联网|设备|网关/.test(haystack)) return ['solution overview', 'capability comparison', 'component summary'];
  return ['catalog lookup', 'detail answer', 'structured output'];
}

export function resolveCatalogMemoryDetailLevel(documentCount: number): CatalogMemoryDetailLevel {
  if (documentCount <= SMALL_LIBRARY_DETAIL_LIMIT) return 'deep';
  if (documentCount <= MEDIUM_LIBRARY_DETAIL_LIMIT) return 'medium';
  return 'shallow';
}

function looksLikeDelimitedLine(value: string) {
  const text = sanitizeText(value, 240);
  if (!text) return false;
  return ((text.match(/,/g) || []).length >= 4) || ((text.match(/\|/g) || []).length >= 4);
}

export function selectCatalogMemoryTitle(item: Pick<ParsedDocument, 'title' | 'name' | 'path'>) {
  const title = sanitizeText(item.title || '', 160);
  if (title && !looksLikeDelimitedLine(title)) return title;
  const fromName = sanitizeText(path.parse(item.name || path.basename(item.path)).name, 160);
  if (fromName) return fromName;
  return sanitizeText(path.basename(item.path), 160);
}

function buildResumeMemoryFacts(item: ParsedDocument) {
  const fields = item.resumeFields || {};
  const facts = [
    fields.candidateName ? `Candidate: ${sanitizeFact(fields.candidateName)}` : '',
    fields.targetRole ? `Target role: ${sanitizeFact(fields.targetRole)}` : '',
    fields.currentRole ? `Current role: ${sanitizeFact(fields.currentRole)}` : '',
    fields.latestCompany ? `Latest company: ${sanitizeFact(fields.latestCompany)}` : '',
    fields.yearsOfExperience ? `Experience: ${sanitizeFact(fields.yearsOfExperience)}` : '',
    fields.education ? `Education: ${sanitizeFact(fields.education)}` : '',
    fields.skills?.length ? `Skills: ${sanitizeList(fields.skills, 40, 5).join(', ')}` : '',
    fields.projectHighlights?.length ? `Projects: ${sanitizeList(fields.projectHighlights, 60, 3).join(' | ')}` : '',
  ];
  return facts.filter(Boolean);
}

function hasMeaningfulResumeSignals(item: ParsedDocument) {
  const fields = item.resumeFields || {};
  return Boolean(
    sanitizeFact(fields.candidateName)
    || sanitizeFact(fields.targetRole)
    || sanitizeFact(fields.currentRole)
    || sanitizeFact(fields.latestCompany)
    || sanitizeFact(fields.yearsOfExperience)
    || sanitizeFact(fields.education)
    || sanitizeList(fields.skills || [], 40, 3).length
    || sanitizeList(fields.projectHighlights || [], 60, 2).length
    || sanitizeList(fields.itProjectHighlights || [], 60, 2).length
  );
}

function shouldIncludeResumeMemoryFacts(item: ParsedDocument) {
  if (item.category === 'resume') return hasMeaningfulResumeSignals(item);
  if (
    isOrderDocumentSignal(item)
    || isInventoryDocumentSignal(item)
    || isFootfallDocumentSignal(item)
    || isContractDocumentSignal(item)
    || isPaperDocumentSignal(item)
    || isIotDocumentSignal(item)
    || (item.category && item.category !== 'general')
  ) return false;
  return item.schemaType === 'resume' && hasMeaningfulResumeSignals(item);
}

function buildContractMemoryFacts(item: ParsedDocument) {
  const fields = item.contractFields || {};
  const facts = [
    fields.contractNo ? `Contract no: ${sanitizeFact(fields.contractNo)}` : '',
    fields.amount ? `Amount: ${sanitizeFact(fields.amount)}` : '',
    fields.paymentTerms ? `Payment terms: ${sanitizeFact(fields.paymentTerms)}` : '',
    fields.duration ? `Duration: ${sanitizeFact(fields.duration)}` : '',
  ];
  return facts.filter(Boolean);
}

function hasMeaningfulContractSignals(item: ParsedDocument) {
  const fields = item.contractFields || {};
  return Boolean(
    sanitizeFact(fields.contractNo)
    || sanitizeFact(fields.amount)
    || sanitizeFact(fields.paymentTerms)
    || sanitizeFact(fields.duration)
  );
}

function shouldIncludeContractMemoryFacts(item: ParsedDocument) {
  if (isContractDocumentSignal(item)) return hasMeaningfulContractSignals(item);
  return item.schemaType === 'contract' && hasMeaningfulContractSignals(item);
}

function humanizeStructuredProfileKey(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
}

function resolveStructuredProfileKeys(item: ParsedDocument) {
  if (shouldIncludeResumeMemoryFacts(item)) return ['companies', 'skills', 'highlights', 'projectHighlights', 'itProjectHighlights'];
  if (isOrderDocumentSignal(item) || isInventoryDocumentSignal(item)) {
    return ['platforms', 'platformSignals', 'categorySignals', 'metricSignals', 'replenishmentSignals', 'anomalySignals', 'highlights', 'organizations'];
  }
  if (shouldIncludeContractMemoryFacts(item)) return ['organizations', 'metrics', 'highlights'];
  if (item.schemaType === 'report') return ['platforms', 'categorySignals', 'metricSignals', 'anomalySignals', 'highlights', 'organizations'];
  return [
    'platforms',
    'platformSignals',
    'categorySignals',
    'metricSignals',
    'replenishmentSignals',
    'anomalySignals',
    'companies',
    'skills',
    'highlights',
    'projectHighlights',
    'itProjectHighlights',
    'benefits',
    'ingredients',
    'audiences',
    'organizations',
  ];
}

function buildStructuredProfileFacts(item: ParsedDocument) {
  const profile = item.structuredProfile;
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return [];
  const preferredKeys = resolveStructuredProfileKeys(item);
  const facts: string[] = [];
  const focusedAliasFields = (
    (profile as Record<string, unknown>).focusedAliasFields
    && typeof (profile as Record<string, unknown>).focusedAliasFields === 'object'
    && !Array.isArray((profile as Record<string, unknown>).focusedAliasFields)
      ? (profile as Record<string, unknown>).focusedAliasFields as Record<string, unknown>
      : null
  ) || (
    (profile as Record<string, unknown>).aliasFields
    && typeof (profile as Record<string, unknown>).aliasFields === 'object'
    && !Array.isArray((profile as Record<string, unknown>).aliasFields)
      ? (profile as Record<string, unknown>).aliasFields as Record<string, unknown>
      : null
  );

  if (focusedAliasFields) {
    for (const [alias, raw] of Object.entries(focusedAliasFields)) {
      if (facts.length >= 6) break;
      if (Array.isArray(raw)) {
        const values = sanitizeList(raw, 40, 4);
        if (values.length) facts.push(`${sanitizeFact(alias, 40)}: ${values.join(', ')}`);
        continue;
      }
      const text = sanitizeFact(raw, 120);
      if (text) facts.push(`${sanitizeFact(alias, 40)}: ${text}`);
    }
  }

  for (const key of preferredKeys) {
    const raw = (profile as Record<string, unknown>)[key];
    if (Array.isArray(raw)) {
      const values = sanitizeList(raw, 40, 5);
      if (values.length) facts.push(`${humanizeStructuredProfileKey(key)}: ${values.join(', ')}`);
      continue;
    }
    const text = sanitizeFact(raw, 120);
    if (text) facts.push(`${humanizeStructuredProfileKey(key)}: ${text}`);
  }
  return facts;
}

function buildEvidenceHighlights(item: ParsedDocument, limit = 3) {
  const chunks = Array.isArray(item.evidenceChunks) ? item.evidenceChunks : [];
  if (chunks.length) return sanitizeList(chunks.map((chunk) => chunk.text), 140, limit);
  const excerpt = sanitizeText(item.excerpt || item.summary || '', 180);
  return excerpt ? [excerpt] : [];
}

export function buildCatalogMemoryDetail(item: ParsedDocument, detailLevel: CatalogMemoryDetailLevel) {
  const topicTags = sanitizeList(item.topicTags || [], 40, detailLevel === 'deep' ? 8 : 4);
  const typedFacts = [
    ...(shouldIncludeResumeMemoryFacts(item) ? buildResumeMemoryFacts(item) : []),
    ...(shouldIncludeContractMemoryFacts(item) ? buildContractMemoryFacts(item) : []),
  ];
  const allFacts = sanitizeList([...typedFacts, ...buildStructuredProfileFacts(item)], 180, detailLevel === 'deep' ? 8 : detailLevel === 'medium' ? 4 : 0);
  const evidenceHighlights = detailLevel === 'shallow' ? [] : buildEvidenceHighlights(item, detailLevel === 'deep' ? 3 : 1);

  return {
    topicTags,
    keyFacts: allFacts,
    evidenceHighlights,
  };
}

function buildDocumentFingerprint(card: {
  libraryKeys: string[];
  title: string;
  summary: string;
  availability: string;
  updatedAt: string;
  parseStatus: string;
  parseStage: string;
  detailParseStatus: string;
  topicTags: string[];
  keyFacts: string[];
  evidenceHighlights: string[];
  detailLevel: CatalogMemoryDetailLevel;
}) {
  return JSON.stringify(card);
}

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
    name: sanitizeText(item.name || path.basename(item.path), 160),
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

function sortDocumentCards(cards: OpenClawMemoryDocumentCard[]) {
  return [...cards].sort((left, right) => (
    Date.parse(right.updatedAt || '') - Date.parse(left.updatedAt || '')
    || left.title.localeCompare(right.title, 'zh-CN')
  ));
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
