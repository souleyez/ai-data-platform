import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildDocumentId, loadParsedDocuments } from './document-store.js';
import { loadDocumentLibraries, documentMatchesLibrary, type DocumentLibrary } from './document-libraries.js';
import type { ParsedDocument } from './document-parser.js';
import {
  buildSharedTemplateEnvelope,
  loadReportCenterStateWithOptions,
  type ReportOutputRecord,
  type SharedReportTemplate,
} from './report-center.js';
import {
  MEMORY_ROOT,
  STORAGE_CONFIG_DIR,
} from './paths.js';
import {
  diffOpenClawMemoryState,
  OPENCLAW_MEMORY_STATE_VERSION,
  type OpenClawMemoryChange,
  type OpenClawMemoryDocumentState,
  type OpenClawMemoryState,
} from './openclaw-memory-changes.js';

const CATALOG_ROOT = path.join(MEMORY_ROOT, 'catalog');
const LIBRARIES_DIR = path.join(CATALOG_ROOT, 'libraries');
const DOCUMENTS_DIR = path.join(CATALOG_ROOT, 'documents');
const TEMPLATES_DIR = path.join(CATALOG_ROOT, 'templates');
const REPORTS_DIR = path.join(CATALOG_ROOT, 'reports');
const CHANGES_DIR = path.join(CATALOG_ROOT, 'changes');
const ARCHIVE_DIR = path.join(CHANGES_DIR, 'archive');
const STATE_FILE = path.join(STORAGE_CONFIG_DIR, 'openclaw-memory-catalog.json');
const CATALOG_DOCUMENT_LIMIT = Math.max(1000, Number(process.env.OPENCLAW_MEMORY_CATALOG_DOCUMENT_LIMIT || 20000));
const SMALL_LIBRARY_DETAIL_LIMIT = Math.max(3, Number(process.env.OPENCLAW_MEMORY_SMALL_LIBRARY_DETAIL_LIMIT || 20));
const MEDIUM_LIBRARY_DETAIL_LIMIT = Math.max(SMALL_LIBRARY_DETAIL_LIMIT + 1, Number(process.env.OPENCLAW_MEMORY_MEDIUM_LIBRARY_DETAIL_LIMIT || 80));

export type CatalogMemoryDetailLevel = 'shallow' | 'medium' | 'deep';

export type OpenClawMemoryLibrarySnapshot = {
  key: string;
  label: string;
  description: string;
  documentCount: number;
  availableCount: number;
  auditExcludedCount: number;
  structuredOnlyCount: number;
  unsupportedCount: number;
  latestUpdateAt: string;
  representativeDocumentTitles: string[];
  suggestedQuestionTypes: string[];
  memoryDetailLevel: CatalogMemoryDetailLevel;
};

export type OpenClawMemoryCatalogSnapshot = {
  version: number;
  generatedAt: string;
  libraryCount: number;
  documentCount: number;
  templateCount: number;
  outputCount: number;
  libraries: OpenClawMemoryLibrarySnapshot[];
  documents: CatalogDocumentCard[];
  templates: OpenClawMemoryTemplateSnapshot[];
  outputs: OpenClawMemoryReportOutputSnapshot[];
};

type CatalogDocumentCard = OpenClawMemoryDocumentState & {
  path: string;
  title: string;
  name: string;
  bizCategory: string;
  schemaType: string;
  parseStatus: string;
  parseStage: string;
  detailParseStatus: string;
  topicTags: string[];
  detailLevel: CatalogMemoryDetailLevel;
  keyFacts: string[];
  evidenceHighlights: string[];
};

export type OpenClawMemoryTemplateSnapshot = {
  key: string;
  label: string;
  type: SharedReportTemplate['type'];
  description: string;
  origin: string;
  isDefault: boolean;
  supported: boolean;
  groupKeys: string[];
  groupLabels: string[];
  outputHint: string;
  fixedStructure: string[];
  variableZones: string[];
  pageSections: string[];
  tableColumns: string[];
  referenceNames: string[];
};

export type OpenClawMemoryReportOutputSnapshot = {
  id: string;
  title: string;
  kind: string;
  templateLabel: string;
  summary: string;
  libraryLabels: string[];
  triggerSource: 'report-center' | 'chat';
  createdAt: string;
  updatedAt: string;
  reusable: boolean;
};

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

function slugifyKey(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'default';
}

function formatIsoDateTime(value: string) {
  const text = String(value || '').trim();
  if (!text) return '-';
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function extractDocumentUpdatedAt(item: ParsedDocument) {
  const candidates = [
    item.detailParsedAt,
    item.cloudStructuredAt,
    item.retainedAt,
    item.originalDeletedAt,
    item.categoryConfirmedAt,
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
  if (item.bizCategory && item.bizCategory !== 'general') return false;
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
  if (item.category === 'contract' || item.bizCategory === 'contract') {
    return hasMeaningfulContractSignals(item);
  }
  return item.schemaType === 'contract' && hasMeaningfulContractSignals(item);
}

function humanizeStructuredProfileKey(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
}

function resolveStructuredProfileKeys(item: ParsedDocument) {
  if (shouldIncludeResumeMemoryFacts(item)) {
    return ['companies', 'skills', 'highlights', 'projectHighlights', 'itProjectHighlights'];
  }
  if (item.bizCategory === 'order' || item.bizCategory === 'inventory') {
    return [
      'platforms',
      'platformSignals',
      'categorySignals',
      'metricSignals',
      'replenishmentSignals',
      'anomalySignals',
      'highlights',
      'organizations',
    ];
  }
  if (shouldIncludeContractMemoryFacts(item)) {
    return ['organizations', 'metrics', 'highlights'];
  }
  if (item.schemaType === 'report') {
    return ['platforms', 'categorySignals', 'metricSignals', 'anomalySignals', 'highlights', 'organizations'];
  }
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
  if (chunks.length) {
    return sanitizeList(chunks.map((chunk) => chunk.text), 140, limit);
  }
  const excerpt = sanitizeText(item.excerpt || item.summary || '', 180);
  return excerpt ? [excerpt] : [];
}

export function buildCatalogMemoryDetail(item: ParsedDocument, detailLevel: CatalogMemoryDetailLevel) {
  const topicTags = sanitizeList(item.topicTags || [], 40, detailLevel === 'deep' ? 8 : 4);
  const typedFacts = [
    ...(shouldIncludeResumeMemoryFacts(item) ? buildResumeMemoryFacts(item) : []),
    ...(shouldIncludeContractMemoryFacts(item) ? buildContractMemoryFacts(item) : []),
  ];
  const allFacts = sanitizeList([
    ...typedFacts,
    ...buildStructuredProfileFacts(item),
  ], 180, detailLevel === 'deep' ? 8 : detailLevel === 'medium' ? 4 : 0);
  const evidenceHighlights = detailLevel === 'shallow'
    ? []
    : buildEvidenceHighlights(item, detailLevel === 'deep' ? 3 : 1);

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
  return JSON.stringify({
    libraryKeys: card.libraryKeys,
    title: card.title,
    summary: card.summary,
    availability: card.availability,
    updatedAt: card.updatedAt,
    parseStatus: card.parseStatus,
    parseStage: card.parseStage,
    detailParseStatus: card.detailParseStatus,
    topicTags: card.topicTags,
    keyFacts: card.keyFacts,
    evidenceHighlights: card.evidenceHighlights,
    detailLevel: card.detailLevel,
  });
}

function resolveDocumentLibraryKeys(item: ParsedDocument, libraries: DocumentLibrary[]) {
  const matchedLibraries = libraries
    .filter((library) => documentMatchesLibrary(item, library))
    .map((library) => library.key);
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

function buildDocumentCard(
  item: ParsedDocument,
  libraryKeys: string[],
  libraryDocumentCounts: Map<string, number>,
): CatalogDocumentCard {
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
    bizCategory: sanitizeText(item.bizCategory, 40),
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

function sortDocumentCards(cards: CatalogDocumentCard[]) {
  return [...cards].sort((left, right) => (
    Date.parse(right.updatedAt || '') - Date.parse(left.updatedAt || '')
    || left.title.localeCompare(right.title, 'zh-CN')
  ));
}

function buildLibrarySnapshot(library: DocumentLibrary, cards: CatalogDocumentCard[]): OpenClawMemoryLibrarySnapshot {
  const availableCount = cards.filter((item) => item.availability === 'available').length;
  const auditExcludedCount = cards.filter((item) => item.availability === 'audit-excluded').length;
  const structuredOnlyCount = cards.filter((item) => item.availability === 'structured-only').length;
  const unsupportedCount = cards.filter((item) => item.availability === 'unsupported' || item.availability === 'parse-error').length;
  const latestUpdateAt = cards
    .map((item) => item.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1) || '';

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

function buildTemplateSnapshots(input: Awaited<ReturnType<typeof loadReportCenterStateWithOptions>>) {
  const groupMap = new Map<string, { keys: Set<string>; labels: Set<string> }>();
  for (const group of input.groups) {
    for (const template of group.templates) {
      const entry = groupMap.get(template.key) || { keys: new Set<string>(), labels: new Set<string>() };
      entry.keys.add(group.key);
      entry.labels.add(group.label);
      groupMap.set(template.key, entry);
    }
  }

  return input.templates
    .filter((template) => template.supported)
    .map((template) => {
      const envelope = buildSharedTemplateEnvelope(template);
      const groups = groupMap.get(template.key);
      return {
        key: template.key,
        label: sanitizeText(template.label, 120),
        type: template.type,
        description: sanitizeText(template.description, 200),
        origin: sanitizeText(template.origin, 32) || 'system',
        isDefault: Boolean(template.isDefault),
        supported: Boolean(template.supported),
        groupKeys: groups ? [...groups.keys] : [],
        groupLabels: groups ? [...groups.labels] : [],
        outputHint: sanitizeText(envelope.outputHint, 180),
        fixedStructure: sanitizeList(envelope.fixedStructure || [], 90, 8),
        variableZones: sanitizeList(envelope.variableZones || [], 90, 8),
        pageSections: sanitizeList(envelope.pageSections || [], 80, 8),
        tableColumns: sanitizeList(envelope.tableColumns || [], 60, 8),
        referenceNames: sanitizeList(
          (template.referenceImages || []).map((item) => item.originalName),
          80,
          6,
        ),
      } satisfies OpenClawMemoryTemplateSnapshot;
    })
    .sort((left, right) => (
      Number(right.isDefault) - Number(left.isDefault)
      || left.label.localeCompare(right.label, 'zh-CN')
    ));
}

function resolveReportOutputUpdatedAt(item: ReportOutputRecord) {
  const candidates = [
    item.dynamicSource?.lastRenderedAt,
    item.dynamicSource?.updatedAt,
    item.dynamicSource?.lastRenderedAt,
    item.createdAt,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  const latest = candidates.length ? Math.max(...candidates) : 0;
  return latest > 0 ? new Date(latest).toISOString() : '';
}

export function buildReportOutputMemorySnapshots(outputs: ReportOutputRecord[]) {
  return [...(outputs || [])]
    .filter((item) => String(item.status || '').trim() === 'ready')
    .sort((left, right) => (
      Date.parse(String(right.createdAt || '')) - Date.parse(String(left.createdAt || ''))
    ))
    .slice(0, 40)
    .map((item) => ({
      id: sanitizeText(item.id, 80),
      title: sanitizeText(item.title, 120),
      kind: sanitizeText(item.kind || item.outputType, 32) || 'page',
      templateLabel: sanitizeText(item.templateLabel, 80),
      summary: sanitizeText(item.summary || item.content || item.page?.summary || '', 220),
      libraryLabels: sanitizeList(
        (item.libraries || []).map((entry) => entry.label || entry.key),
        60,
        6,
      ),
      triggerSource: item.triggerSource === 'report-center' ? 'report-center' : 'chat',
      createdAt: String(item.createdAt || '').trim(),
      updatedAt: resolveReportOutputUpdatedAt(item),
      reusable: Boolean(item.kind === 'page' || item.kind === 'table' || item.kind === 'pdf'),
    } satisfies OpenClawMemoryReportOutputSnapshot));
}

export async function buildOpenClawMemoryCatalogSnapshot(): Promise<OpenClawMemoryCatalogSnapshot> {
  const [libraries, loadedDocuments, reportCenterState] = await Promise.all([
    loadDocumentLibraries(),
    loadParsedDocuments(CATALOG_DOCUMENT_LIMIT, false, undefined, {
      skipBackgroundTasks: true,
    }),
    loadReportCenterStateWithOptions({
      refreshDynamicPages: false,
      persistFixups: false,
    }),
  ]);

  const resolvedDocuments = loadedDocuments.items.map((item) => ({
    item,
    libraryKeys: resolveDocumentLibraryKeys(item, libraries),
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
  const librarySnapshots = libraries.map((library) => buildLibrarySnapshot(
    library,
    cards.filter((item) => item.libraryKeys.includes(library.key)),
  ));
  const templateSnapshots = buildTemplateSnapshots(reportCenterState);
  const outputSnapshots = buildReportOutputMemorySnapshots(reportCenterState.outputs);

  return {
    version: OPENCLAW_MEMORY_STATE_VERSION,
    generatedAt: new Date().toISOString(),
    libraryCount: librarySnapshots.length,
    documentCount: cards.length,
    templateCount: templateSnapshots.length,
    outputCount: outputSnapshots.length,
    libraries: librarySnapshots.sort((left, right) => (
      right.documentCount - left.documentCount || left.label.localeCompare(right.label, 'zh-CN')
    )),
    documents: cards,
    templates: templateSnapshots,
    outputs: outputSnapshots,
  };
}

async function ensureCatalogDirs() {
  await fs.mkdir(LIBRARIES_DIR, { recursive: true });
  await fs.mkdir(DOCUMENTS_DIR, { recursive: true });
  await fs.mkdir(TEMPLATES_DIR, { recursive: true });
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });
  await fs.mkdir(STORAGE_CONFIG_DIR, { recursive: true });
}

async function readPreviousState(): Promise<OpenClawMemoryState | null> {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8');
    return JSON.parse(raw) as OpenClawMemoryState;
  } catch {
    return null;
  }
}

async function writeState(state: OpenClawMemoryState) {
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function renderIndex(snapshot: OpenClawMemoryCatalogSnapshot, recentChanges: OpenClawMemoryChange[]) {
  const topLibraries = snapshot.libraries
    .slice(0, 10)
    .map((library) => `- ${library.label} (${library.documentCount} docs, ${library.availableCount} available)`)
    .join('\n');
  const topChanges = recentChanges
    .slice(0, 20)
    .map((item) => `- ${item.happenedAt} | ${item.type} | ${item.title}`)
    .join('\n');

  return [
    '# OpenClaw Knowledge Catalog',
    '',
    `- Last sync: ${formatIsoDateTime(snapshot.generatedAt)}`,
    `- Libraries: ${snapshot.libraryCount}`,
    `- Documents: ${snapshot.documentCount}`,
    `- Templates: ${snapshot.templateCount}`,
    `- Saved outputs: ${snapshot.outputCount}`,
    '',
    '## Libraries',
    topLibraries || '- None',
    '',
    '## Recent Changes',
    topChanges || '- None',
    '',
  ].join('\n');
}

function renderLibraryFile(library: OpenClawMemoryLibrarySnapshot) {
  return [
    `# Library: ${library.label}`,
    '',
    `- Key: ${library.key}`,
    `- Description: ${library.description || '-'}`,
    `- Documents: ${library.documentCount}`,
    `- Available: ${library.availableCount}`,
    `- Audit excluded: ${library.auditExcludedCount}`,
    `- Structured only: ${library.structuredOnlyCount}`,
    `- Unsupported or parse error: ${library.unsupportedCount}`,
    `- Latest update: ${formatIsoDateTime(library.latestUpdateAt)}`,
    `- Memory detail level: ${library.memoryDetailLevel}`,
    '',
    '## Representative Documents',
    ...(library.representativeDocumentTitles.length
      ? library.representativeDocumentTitles.map((item) => `- ${item}`)
      : ['- None']),
    '',
    '## Suggested Question Types',
    ...(library.suggestedQuestionTypes.length
      ? library.suggestedQuestionTypes.map((item) => `- ${item}`)
      : ['- None']),
    '',
  ].join('\n');
}

function renderDocumentsFile(library: OpenClawMemoryLibrarySnapshot, cards: CatalogDocumentCard[]) {
  const sections = cards.map((item) => [
    `## ${item.title}`,
    `- Document ID: ${item.id}`,
    `- Name: ${item.name}`,
    `- Availability: ${item.availability}`,
    `- Updated at: ${formatIsoDateTime(item.updatedAt)}`,
    `- Schema: ${item.schemaType || '-'}`,
    `- Business category: ${item.bizCategory || '-'}`,
    `- Parse status: ${item.parseStatus || '-'}`,
    `- Parse stage: ${item.parseStage || '-'}`,
    `- Detail parse status: ${item.detailParseStatus || '-'}`,
    `- Memory detail level: ${item.detailLevel}`,
    `- Summary: ${item.summary || '-'}`,
    ...(item.topicTags.length
      ? [`- Topic tags: ${item.topicTags.join(', ')}`]
      : []),
    ...(item.keyFacts.length
      ? ['- Key facts:', ...item.keyFacts.map((fact) => `  - ${fact}`)]
      : []),
    ...(item.evidenceHighlights.length
      ? ['- Evidence hints:', ...item.evidenceHighlights.map((fact) => `  - ${fact}`)]
      : []),
    '',
  ].join('\n'));

  return [
    `# Documents: ${library.label}`,
    '',
    `- Key: ${library.key}`,
    `- Card count: ${cards.length}`,
    '',
    ...(sections.length ? sections : ['No documents.']),
    '',
  ].join('\n');
}

function renderRecentChanges(changes: OpenClawMemoryChange[]) {
  return [
    '# Recent Catalog Changes',
    '',
    ...(changes.length
      ? changes.map((item) => `- ${item.happenedAt} | ${item.type} | ${item.title} | ${item.note}`)
      : ['- None']),
    '',
  ].join('\n');
}

function renderTemplatesFile(templates: OpenClawMemoryTemplateSnapshot[]) {
  return [
    '# Shared Template Catalog',
    '',
    'Reusable page, table, and document results can be published into the local report center for preview, revision, and reopening.',
    'The templates below are optional publishing skeletons and reference layouts, not mandatory routing rules.',
    '',
    ...(templates.length
      ? templates.map((template) => [
        `## ${template.label}`,
        `- Template key: ${template.key}`,
        `- Type: ${template.type}`,
        `- Origin: ${template.origin}${template.isDefault ? ' | default' : ''}`,
        `- Description: ${template.description || '-'}`,
        `- Matched libraries: ${template.groupLabels.join(' | ') || '-'}`,
        `- Output hint: ${template.outputHint || '-'}`,
        ...(template.pageSections.length ? [`- Page sections: ${template.pageSections.join(' | ')}`] : []),
        ...(template.tableColumns.length ? [`- Table columns: ${template.tableColumns.join(' | ')}`] : []),
        ...(template.fixedStructure.length ? [`- Fixed structure: ${template.fixedStructure.join(' | ')}`] : []),
        ...(template.variableZones.length ? [`- Variable zones: ${template.variableZones.join(' | ')}`] : []),
        ...(template.referenceNames.length ? [`- Reference files: ${template.referenceNames.join(' | ')}`] : []),
        '',
      ].join('\n'))
      : ['- None', '']),
  ].join('\n');
}

function renderOutputsFile(outputs: OpenClawMemoryReportOutputSnapshot[]) {
  return [
    '# Saved Report Outputs',
    '',
    'These are reusable outputs already published into the local report center. They can be reopened, revised, and reused.',
    '',
    ...(outputs.length
      ? outputs.map((item) => [
        `## ${item.title || item.id}`,
        `- Output id: ${item.id}`,
        `- Kind: ${item.kind}`,
        `- Template: ${item.templateLabel || '-'}`,
        `- Libraries: ${item.libraryLabels.join(' | ') || '-'}`,
        `- Trigger source: ${item.triggerSource}`,
        `- Created at: ${formatIsoDateTime(item.createdAt)}`,
        `- Updated at: ${formatIsoDateTime(item.updatedAt)}`,
        `- Reusable: ${item.reusable ? 'yes' : 'no'}`,
        `- Summary: ${item.summary || '-'}`,
        '',
      ].join('\n'))
      : ['- None', '']),
  ].join('\n');
}

async function writeCatalogFiles(
  snapshot: OpenClawMemoryCatalogSnapshot,
  state: OpenClawMemoryState,
) {
  const cards = sortDocumentCards(snapshot.documents);
  await fs.rm(CATALOG_ROOT, { recursive: true, force: true });
  await ensureCatalogDirs();

  await fs.writeFile(path.join(CATALOG_ROOT, 'index.md'), renderIndex(snapshot, state.recentChanges), 'utf8');
  await fs.writeFile(path.join(CHANGES_DIR, 'recent.md'), renderRecentChanges(state.recentChanges), 'utf8');
  await fs.writeFile(path.join(TEMPLATES_DIR, 'index.md'), renderTemplatesFile(snapshot.templates), 'utf8');
  await fs.writeFile(path.join(REPORTS_DIR, 'index.md'), renderOutputsFile(snapshot.outputs), 'utf8');

  for (const library of snapshot.libraries) {
    const fileKey = slugifyKey(library.key);
    await fs.writeFile(path.join(LIBRARIES_DIR, `${fileKey}.md`), renderLibraryFile(library), 'utf8');
    const libraryCards = cards.filter((item) => item.libraryKeys.includes(library.key));
    await fs.writeFile(
      path.join(DOCUMENTS_DIR, `${fileKey}.md`),
      renderDocumentsFile(library, libraryCards),
      'utf8',
    );
  }
}

export async function refreshOpenClawMemoryCatalog() {
  await ensureCatalogDirs();
  const snapshot = await buildOpenClawMemoryCatalogSnapshot();
  const previousState = await readPreviousState();
  const nextState = diffOpenClawMemoryState({
    previous: previousState,
    nextDocuments: snapshot.documents.map((item) => ({
      id: item.id,
      libraryKeys: item.libraryKeys,
      title: item.title,
      summary: item.summary,
      availability: item.availability,
      updatedAt: item.updatedAt,
      parseStatus: item.parseStatus,
      parseStage: item.parseStage,
      detailParseStatus: item.detailParseStatus,
      fingerprint: item.fingerprint,
    })),
    generatedAt: snapshot.generatedAt,
  });
  await writeCatalogFiles(snapshot, nextState);
  await writeState(nextState);
  return {
    generatedAt: snapshot.generatedAt,
    libraryCount: snapshot.libraryCount,
    documentCount: snapshot.documentCount,
    templateCount: snapshot.templateCount,
    outputCount: snapshot.outputCount,
    changeCount: nextState.recentChanges.length,
    changedThisRun: nextState.recentChanges.filter((item) => item.happenedAt === snapshot.generatedAt).length,
    memoryRoot: CATALOG_ROOT,
  };
}
