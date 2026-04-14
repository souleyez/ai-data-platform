import type {
  ResumeFields,
  EvidenceChunk,
  IntentSlots,
  ParsedDocument,
  StructuredClaim,
  StructuredEntity,
} from './document-parser.js';
import {
  DOCUMENT_IMAGE_EXTENSIONS,
  DOCUMENT_PRESENTATION_EXTENSIONS,
  deriveSchemaProfile,
  refreshDerivedSchemaProfile,
  renderPdfDocumentToImages,
  renderPresentationDocumentToImages,
} from './document-parser.js';
import {
  getParsedDocumentCanonicalSource,
  getParsedDocumentCanonicalText,
} from './document-canonical-text.js';
import { getDocumentAdvancedParseProviderMode, runDocumentAdvancedParse } from './document-advanced-parse-provider.js';
import {
  normalizeDocumentImageFieldCandidateKey,
  runDocumentImageVlm,
  type DocumentImageVlmFieldCandidate,
  type DocumentImageVlmPayload,
} from './document-image-vlm-provider.js';
import { mergeResumeFields } from './resume-canonicalizer.js';

type CloudEvidenceBlock = {
  title?: string;
  text?: string;
};

type CloudEntity = {
  text?: string;
  type?: StructuredEntity['type'];
  confidence?: number;
  evidenceText?: string;
};

type CloudClaim = {
  subject?: string;
  predicate?: string;
  object?: string;
  confidence?: number;
  evidenceText?: string;
};

function normalizeLegacyBizCategory(value: ParsedDocument['bizCategory'] | undefined): ParsedDocument['bizCategory'] {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'order' || normalized === 'inventory' || normalized === 'footfall') {
    return normalized as ParsedDocument['bizCategory'];
  }
  return 'general';
}

type CloudDocumentStructure = {
  summary?: string;
  topicTags?: string[];
  riskLevel?: ParsedDocument['riskLevel'];
  evidenceBlocks?: CloudEvidenceBlock[];
  entities?: CloudEntity[];
  claims?: CloudClaim[];
  intentSlots?: IntentSlots;
  resumeFields?: Partial<ResumeFields>;
};

export const CLOUD_ENRICH_ENABLED = process.env.ENABLE_OPENCLAW_DOCUMENT_STRUCTURING !== '0';
export const CLOUD_ENRICH_MAX_PER_BATCH = Math.max(0, Number(process.env.OPENCLAW_DOCUMENT_STRUCTURING_BATCH_LIMIT || 12));
export const CLOUD_ENRICH_CONCURRENCY = Math.max(1, Number(process.env.OPENCLAW_DOCUMENT_STRUCTURING_CONCURRENCY || 2));
const MAX_PROMPT_CHARS = Number(process.env.OPENCLAW_DOCUMENT_STRUCTURING_INPUT_LIMIT || 7000);
const IMAGE_EXTENSIONS = new Set<string>(DOCUMENT_IMAGE_EXTENSIONS);
const PRESENTATION_EXTENSIONS = new Set<string>(DOCUMENT_PRESENTATION_EXTENSIONS);
const PDF_EXTENSIONS = new Set<string>(['.pdf']);
const PRESENTATION_VLM_MAX_SLIDES = Math.max(1, Number(process.env.DOCUMENT_PRESENTATION_VLM_MAX_SLIDES || 12));
const PDF_VLM_MAX_PAGES = Math.max(1, Number(process.env.DOCUMENT_PDF_VLM_MAX_PAGES || 8));
const PDF_VLM_MIN_CANONICAL_CHARS = Math.max(0, Number(process.env.DOCUMENT_PDF_VLM_MIN_CANONICAL_CHARS || 600));

export type DocumentCloudEnhancementOptions = {
  runTextParse?: typeof runDocumentAdvancedParse;
  runImageParse?: typeof runDocumentImageVlm;
  renderPresentation?: typeof renderPresentationDocumentToImages;
  renderPdf?: typeof renderPdfDocumentToImages;
};

function uniqStrings(values?: Array<string | undefined>) {
  return [...new Set((values || []).map((item) => String(item || '').trim()).filter(Boolean))];
}

function clampConfidence(value: unknown, fallback = 0.66) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

function sanitizeText(value: unknown, maxLength = 800) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function hasStructuredValue(value: unknown) {
  if (Array.isArray(value)) return value.some((item) => String(item || '').trim());
  return String(value ?? '').trim().length > 0;
}

function extractJsonObject(raw: string) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as CloudDocumentStructure;
  } catch {
    return null;
  }
}

export function isImageDocument(item: ParsedDocument) {
  return IMAGE_EXTENSIONS.has(String(item.ext || '').toLowerCase());
}

export function isPresentationDocument(item: ParsedDocument) {
  return PRESENTATION_EXTENSIONS.has(String(item.ext || '').toLowerCase());
}

function isPdfDocument(item: ParsedDocument) {
  return PDF_EXTENSIONS.has(String(item.ext || '').toLowerCase());
}

export function shouldUsePdfVisualFallback(item: ParsedDocument) {
  if (!isPdfDocument(item) || !item.path) return false;
  if (item.parseStatus !== 'parsed') return true;
  if (String(item.markdownError || '').trim()) return true;
  if (/ocr/i.test(String(item.parseMethod || '')) && String(item.markdownMethod || '').trim() !== 'markitdown') {
    return true;
  }
  return getParsedDocumentCanonicalText(item).length < PDF_VLM_MIN_CANONICAL_CHARS;
}

export function shouldAttemptVisualFallback(item: ParsedDocument) {
  if (isImageDocument(item) || isPresentationDocument(item)) {
    return Boolean(item.path);
  }
  return shouldUsePdfVisualFallback(item);
}

export function shouldAttemptTextStructuring(item: ParsedDocument, providerMode = getDocumentAdvancedParseProviderMode()) {
  if (providerMode === 'disabled') return false;
  if (item.parseStatus !== 'parsed') return false;
  if (!getParsedDocumentCanonicalText(item)) return false;
  const canonicalSource = getParsedDocumentCanonicalSource(item);
  if (
    canonicalSource === 'vlm-image'
    || canonicalSource === 'vlm-pdf'
    || canonicalSource === 'vlm-presentation'
  ) {
    return false;
  }
  return true;
}

function buildDocumentContext(item: ParsedDocument) {
  const evidence = (item.evidenceChunks || [])
    .slice(0, 6)
    .map((chunk, index) => `Evidence ${index + 1}: ${sanitizeText(chunk.text, 800)}`)
    .join('\n');
  const fullText = sanitizeText(getParsedDocumentCanonicalText(item), Math.max(1200, MAX_PROMPT_CHARS));

  const existingResumeFields = item.resumeFields && Object.values(item.resumeFields).some((value) => Array.isArray(value) ? value.length : Boolean(value))
    ? `Existing resume fields: ${sanitizeText(JSON.stringify(item.resumeFields), 800)}`
    : '';

  return [
    `Title: ${item.title || item.name}`,
    `Category: ${item.category}`,
    `Existing summary: ${sanitizeText(item.summary, 500)}`,
    `Existing tags: ${(item.topicTags || []).join(', ') || 'none'}`,
    existingResumeFields,
    `Excerpt: ${sanitizeText(item.excerpt, 1000)}`,
    evidence ? `Existing evidence blocks:\n${evidence}` : '',
    fullText ? `Source text excerpt:\n${fullText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, MAX_PROMPT_CHARS);
}

function extractImageFieldAliases(item: ParsedDocument) {
  const template = item.structuredProfile && typeof item.structuredProfile === 'object' && !Array.isArray(item.structuredProfile)
    ? item.structuredProfile.fieldTemplate as Record<string, unknown> | undefined
    : undefined;
  if (!template?.fieldAliases || typeof template.fieldAliases !== 'object' || Array.isArray(template.fieldAliases)) {
    return {};
  }
  return template.fieldAliases as Record<string, string>;
}

function mergeEvidenceChunks(existing: EvidenceChunk[] | undefined, incoming: CloudEvidenceBlock[] | undefined) {
  const merged: EvidenceChunk[] = [];
  const seen = new Set<string>();

  for (const block of incoming || []) {
    const text = sanitizeText(block.text, 1000);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      id: `cloud-${merged.length + 1}`,
      order: merged.length,
      title: sanitizeText(block.title, 120) || undefined,
      text,
      charLength: text.length,
    });
  }

  for (const chunk of existing || []) {
    const text = sanitizeText(chunk.text, 1000);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      ...chunk,
      text,
      charLength: text.length,
      order: merged.length,
    });
  }

  return merged.slice(0, 12);
}

function findEvidenceChunkIdByText(evidenceChunks: EvidenceChunk[] | undefined, evidenceText?: string) {
  const normalized = sanitizeText(evidenceText, 500).toLowerCase();
  if (!normalized || !evidenceChunks?.length) return undefined;
  return evidenceChunks.find((chunk) => chunk.text.toLowerCase().includes(normalized))?.id;
}

function mergeEntities(
  existing: StructuredEntity[] | undefined,
  incoming: CloudEntity[] | undefined,
  evidenceChunks: EvidenceChunk[] | undefined,
) {
  const merged = new Map<string, StructuredEntity>();

  for (const entity of existing || []) {
    merged.set(`${entity.type}:${entity.text.toLowerCase()}`, entity);
  }

  for (const entity of incoming || []) {
    const type = entity.type;
    const text = sanitizeText(entity.text, 120);
    if (!type || !text) continue;
    const key = `${type}:${text.toLowerCase()}`;
    if (merged.has(key)) continue;
    merged.set(key, {
      text,
      type,
      source: 'rule',
      confidence: clampConfidence(entity.confidence),
      evidenceChunkId: findEvidenceChunkIdByText(evidenceChunks, entity.evidenceText),
    });
  }

  return [...merged.values()].slice(0, 40);
}

function mergeClaims(
  existing: StructuredClaim[] | undefined,
  incoming: CloudClaim[] | undefined,
  evidenceChunks: EvidenceChunk[] | undefined,
) {
  const merged = new Map<string, StructuredClaim>();

  for (const claim of existing || []) {
    merged.set(`${claim.subject}|${claim.predicate}|${claim.object}`.toLowerCase(), claim);
  }

  for (const claim of incoming || []) {
    const subject = sanitizeText(claim.subject, 160);
    const predicate = sanitizeText(claim.predicate, 120);
    const object = sanitizeText(claim.object, 240);
    if (!subject || !predicate || !object) continue;
    const key = `${subject}|${predicate}|${object}`.toLowerCase();
    if (merged.has(key)) continue;
    merged.set(key, {
      subject,
      predicate,
      object,
      confidence: clampConfidence(claim.confidence),
      evidenceChunkId: findEvidenceChunkIdByText(evidenceChunks, claim.evidenceText),
    });
  }

  return [...merged.values()].slice(0, 24);
}

function mergeIntentSlots(existing: IntentSlots | undefined, incoming: IntentSlots | undefined): IntentSlots {
  return {
    audiences: uniqStrings([...(existing?.audiences || []), ...(incoming?.audiences || [])]),
    ingredients: uniqStrings([...(existing?.ingredients || []), ...(incoming?.ingredients || [])]),
    strains: uniqStrings([...(existing?.strains || []), ...(incoming?.strains || [])]),
    benefits: uniqStrings([...(existing?.benefits || []), ...(incoming?.benefits || [])]),
    doses: uniqStrings([...(existing?.doses || []), ...(incoming?.doses || [])]),
    organizations: uniqStrings([...(existing?.organizations || []), ...(incoming?.organizations || [])]),
    metrics: uniqStrings([...(existing?.metrics || []), ...(incoming?.metrics || [])]),
  };
}

function normalizeImageFieldCandidateValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  const text = String(value ?? '').trim();
  return text || '';
}

function normalizeImageFieldCandidates(item: ParsedDocument, incoming: DocumentImageVlmFieldCandidate[] | undefined) {
  const aliases = extractImageFieldAliases(item);
  const normalized: Array<{
    key: string;
    value: string | string[];
    confidence: number;
    source: 'vlm';
    evidenceText: string;
  }> = [];

  for (const entry of incoming || []) {
    const key = normalizeDocumentImageFieldCandidateKey(entry?.key, aliases);
    if (!key) continue;
    const value = normalizeImageFieldCandidateValue(entry?.value);
    if (!hasStructuredValue(value)) continue;
    normalized.push({
      key,
      value,
      confidence: clampConfidence(entry?.confidence, 0.72),
      source: 'vlm',
      evidenceText: sanitizeText(entry?.evidenceText, 500),
    });
  }

  return normalized;
}

function mergeStringArray(current: string[] | undefined, incoming: unknown) {
  const next = Array.isArray(incoming)
    ? incoming.map((item) => String(item || '').trim()).filter(Boolean)
    : String(incoming || '').split(/[,\n/|；;、]/).map((item) => item.trim()).filter(Boolean);
  return [...new Set([...(current || []), ...next])];
}

function assignCandidateFields(item: ParsedDocument, candidates: Array<{
  key: string;
  value: unknown;
}>) {
  const next = {
    ...item,
    contractFields: { ...(item.contractFields || {}) },
    enterpriseGuidanceFields: { ...(item.enterpriseGuidanceFields || {}) },
    orderFields: { ...(item.orderFields || {}) },
    resumeFields: { ...(item.resumeFields || {}) },
  };

  for (const candidate of candidates) {
    const key = candidate.key;
    const value = candidate.value;
    if (!hasStructuredValue(value)) continue;
    if (['contractNo', 'partyA', 'partyB', 'amount', 'signDate', 'effectiveDate', 'paymentTerms', 'duration'].includes(key)) {
      if (!hasStructuredValue((next.contractFields as Record<string, unknown>)[key])) {
        (next.contractFields as Record<string, unknown>)[key] = value;
      }
      continue;
    }
    if (['businessSystem', 'documentKind', 'applicableScope', 'operationEntry'].includes(key)) {
      if (!hasStructuredValue((next.enterpriseGuidanceFields as Record<string, unknown>)[key])) {
        (next.enterpriseGuidanceFields as Record<string, unknown>)[key] = value;
      }
      continue;
    }
    if (['approvalLevels', 'policyFocus', 'contacts'].includes(key)) {
      const current = (next.enterpriseGuidanceFields as Record<string, unknown>)[key];
      (next.enterpriseGuidanceFields as Record<string, unknown>)[key] = mergeStringArray(Array.isArray(current) ? current.map((entry) => String(entry || '')) : [], value);
      continue;
    }
    if (['period', 'platform', 'orderCount', 'netSales', 'grossMargin', 'topCategory', 'inventoryStatus', 'replenishmentAction'].includes(key)) {
      if (!hasStructuredValue((next.orderFields as Record<string, unknown>)[key])) {
        (next.orderFields as Record<string, unknown>)[key] = value;
      }
      continue;
    }
    if (['candidateName', 'targetRole', 'currentRole', 'yearsOfExperience', 'education', 'major', 'expectedCity', 'expectedSalary', 'latestCompany'].includes(key)) {
      if (!hasStructuredValue((next.resumeFields as Record<string, unknown>)[key])) {
        (next.resumeFields as Record<string, unknown>)[key] = value;
      }
      continue;
    }
    if (['companies', 'skills', 'highlights', 'projectHighlights', 'itProjectHighlights'].includes(key)) {
      const current = (next.resumeFields as Record<string, unknown>)[key];
      (next.resumeFields as Record<string, unknown>)[key] = mergeStringArray(Array.isArray(current) ? current.map((entry) => String(entry || '')) : [], value);
    }
  }

  return next;
}

function buildImageStructuredFieldDetails(
  item: ParsedDocument,
  candidates: Array<{
    key: string;
    value: unknown;
    confidence: number;
    source: 'vlm';
    evidenceText: string;
  }>,
  evidenceChunks: EvidenceChunk[] | undefined,
) {
  const existing = item.structuredProfile && typeof item.structuredProfile === 'object' && !Array.isArray(item.structuredProfile)
    ? (item.structuredProfile.fieldDetails as Record<string, unknown> | undefined)
    : undefined;
  const next: Record<string, unknown> = { ...(existing || {}) };

  for (const candidate of candidates) {
    if (!candidate.key || !hasStructuredValue(candidate.value)) continue;
    if (next[candidate.key]) continue;
    next[candidate.key] = {
      value: candidate.value,
      confidence: candidate.confidence,
      source: candidate.source,
      evidenceChunkId: findEvidenceChunkIdByText(evidenceChunks, candidate.evidenceText),
    };
  }

  return next;
}

function buildImageStructuredTopLevelFields(
  currentProfile: Record<string, unknown>,
  candidates: Array<{
    key: string;
    value: unknown;
  }>,
) {
  const next: Record<string, unknown> = {};
  for (const candidate of candidates) {
    if (!candidate.key || !hasStructuredValue(candidate.value)) continue;
    if (hasStructuredValue(currentProfile[candidate.key])) continue;
    next[candidate.key] = candidate.value;
  }
  return next;
}

function buildImageUnderstandingPayload(
  structured: DocumentImageVlmPayload,
  candidates: Array<{
    key: string;
    value: unknown;
    confidence: number;
    source: 'vlm';
    evidenceText: string;
  }>,
) {
  return {
    documentKind: sanitizeText(structured.documentKind, 120),
    layoutType: sanitizeText(structured.layoutType, 120),
    visualSummary: sanitizeText(structured.visualSummary || structured.summary, 600),
    chartOrTableDetected: Boolean(structured.chartOrTableDetected),
    tableLikeSignals: uniqStrings((structured.tableLikeSignals || []).map((entry) => sanitizeText(entry, 120))),
    extractedFields: Object.fromEntries(
      candidates
        .filter((entry) => entry.key && hasStructuredValue(entry.value))
        .map((entry) => [entry.key, entry.value]),
    ),
  };
}

function buildImageFullText(item: ParsedDocument, structured: DocumentImageVlmPayload) {
  const transcribedText = sanitizeText(structured.transcribedText, 6000);
  const visualSummary = sanitizeText(structured.visualSummary, 1000);
  const blocks = [
    `Image file: ${item.name}`,
    visualSummary ? `Visual summary:\n${visualSummary}` : '',
    transcribedText ? `Visual transcription:\n${transcribedText}` : '',
  ].filter(Boolean);
  return blocks.join('\n\n');
}

type RenderedPageResult = {
  pageNumber: number;
  model: string;
  payload: DocumentImageVlmPayload;
};

function buildRenderedPageBlock(input: {
  pageNumber: number;
  pageLabel: string;
  payload: DocumentImageVlmPayload;
}) {
  const visualSummary = sanitizeText(input.payload.visualSummary || input.payload.summary, 1200);
  const transcribedText = sanitizeText(input.payload.transcribedText, 6000);
  return [
    `# ${input.pageLabel} ${input.pageNumber}`,
    visualSummary ? `Visual summary:\n${visualSummary}` : '',
    transcribedText ? `Visual transcription:\n${transcribedText}` : '',
  ].filter(Boolean).join('\n\n');
}

function applyRenderedPageCollection(
  item: ParsedDocument,
  pageResults: RenderedPageResult[],
  options: {
    pageLabel: string;
    markerLabel: string;
    parseMethodSuffix: string;
    understandingKey: 'presentationUnderstanding' | 'pdfUnderstanding';
    countKey: 'slideCount' | 'pageCount';
    itemsKey: 'slides' | 'pages';
  },
) {
  const evidenceBlocks = pageResults.flatMap(({ pageNumber, payload }) => (payload.evidenceBlocks || []).map((block) => ({
    title: sanitizeText(block.title, 120) ? `${options.pageLabel} ${pageNumber} · ${sanitizeText(block.title, 120)}` : `${options.pageLabel} ${pageNumber}`,
    text: sanitizeText(block.text, 1000),
  })));
  const evidenceChunks = mergeEvidenceChunks(item.evidenceChunks, evidenceBlocks);
  const incomingEntities = pageResults.flatMap(({ payload }) => (payload.entities as CloudEntity[] | undefined) || []);
  const incomingClaims = pageResults.flatMap(({ payload }) => (payload.claims as CloudClaim[] | undefined) || []);
  const entities = mergeEntities(item.entities, incomingEntities, evidenceChunks);
  const claims = mergeClaims(item.claims, incomingClaims, evidenceChunks);
  const topicTags = uniqStrings([
    ...(item.topicTags || []),
    ...pageResults.flatMap(({ payload }) => payload.topicTags || []),
  ]).slice(0, 16);
  const firstSummary = pageResults
    .map(({ payload }) => sanitizeText(payload.summary || payload.visualSummary, 500))
    .find(Boolean);
  const summary = firstSummary || item.summary;
  const fieldCandidates = normalizeImageFieldCandidates(
    item,
    pageResults.flatMap(({ payload }) => payload.fieldCandidates || []),
  );
  const visualFullText = [
    item.fullText || '',
    `[${options.markerLabel}]`,
    ...pageResults.map(({ pageNumber, payload }) => buildRenderedPageBlock({
      pageNumber,
      pageLabel: options.pageLabel,
      payload,
    })),
  ].filter(Boolean).join('\n\n');
  const withCandidateFields = assignCandidateFields({
    ...item,
    parseStatus: 'parsed',
    canonicalParseStatus: 'ready',
    parseMethod: item.parseMethod?.includes(options.parseMethodSuffix)
      ? item.parseMethod
      : `${item.parseMethod || options.pageLabel.toLowerCase()}+${options.parseMethodSuffix}`,
    parseStage: 'detailed',
    detailParseStatus: 'succeeded',
    detailParsedAt: new Date().toISOString(),
    detailParseAttempts: Math.max(1, Number(item.detailParseAttempts || 0)),
    detailParseError: undefined,
    summary,
    excerpt: summary || item.excerpt,
    fullText: visualFullText,
    extractedChars: sanitizeText(visualFullText, 20000).length,
    topicTags,
    evidenceChunks,
    entities,
    claims,
    riskLevel: pageResults.map(({ payload }) => payload.riskLevel).find(Boolean) || item.riskLevel,
    cloudStructuredAt: new Date().toISOString(),
    cloudStructuredModel: uniqStrings(pageResults.map(({ model }) => model)).join(', '),
  }, fieldCandidates);

  const refreshed = refreshDerivedSchemaProfile(withCandidateFields);
  const currentProfile = refreshed.structuredProfile && typeof refreshed.structuredProfile === 'object' && !Array.isArray(refreshed.structuredProfile)
    ? refreshed.structuredProfile as Record<string, unknown>
    : {};

  return {
    ...refreshed,
    structuredProfile: {
      ...currentProfile,
      ...buildImageStructuredTopLevelFields(currentProfile, fieldCandidates),
      fieldDetails: buildImageStructuredFieldDetails(refreshed, fieldCandidates, evidenceChunks),
      [options.understandingKey]: {
        [options.countKey]: pageResults.length,
        [options.itemsKey]: pageResults.map(({ pageNumber, payload }) => ({
          pageNumber,
          documentKind: sanitizeText(payload.documentKind, 120),
          layoutType: sanitizeText(payload.layoutType, 120),
          visualSummary: sanitizeText(payload.visualSummary || payload.summary, 600),
          transcribedText: sanitizeText(payload.transcribedText, 2000),
        })),
      },
    },
  };
}

export async function enrichTextOne(
  item: ParsedDocument,
  runTextParse = runDocumentAdvancedParse,
): Promise<ParsedDocument> {
  const canonicalText = getParsedDocumentCanonicalText(item);
  if (item.parseStatus !== 'parsed' || !canonicalText || item.extractedChars < 80) {
    return item;
  }

  const result = await runTextParse({
    prompt: buildDocumentContext(item),
  });
  if (!result) return item;
  const structured = extractJsonObject(result.content);
  if (!structured) return item;

  const evidenceChunks = mergeEvidenceChunks(item.evidenceChunks, structured.evidenceBlocks);
  const entities = mergeEntities(item.entities, structured.entities, evidenceChunks);
  const claims = mergeClaims(item.claims, structured.claims, evidenceChunks);
  const topicTags = uniqStrings([...(item.topicTags || []), ...(structured.topicTags || [])]).slice(0, 16);
  const intentSlots = mergeIntentSlots(item.intentSlots, structured.intentSlots);
  const summary = sanitizeText(structured.summary, 500) || item.summary;
  const resumeFields = mergeResumeFields(
    [structured.resumeFields as ResumeFields | undefined, item.resumeFields as ResumeFields | undefined],
    {
      title: item.title || item.name,
      sourceName: item.name,
      summary,
      excerpt: item.excerpt,
      fullText: canonicalText,
    },
  );
  const schemaDerived = deriveSchemaProfile({
    category: item.category,
    bizCategory: normalizeLegacyBizCategory(item.bizCategory),
    title: item.title || item.name,
    topicTags,
    summary,
    contractFields: item.contractFields,
    resumeFields,
  });

  return refreshDerivedSchemaProfile({
    ...item,
    parseMethod: item.parseMethod?.includes('openclaw') ? item.parseMethod : `${item.parseMethod || 'parsed'}+openclaw`,
    parseStage: 'detailed',
    summary,
    excerpt: item.excerpt || summary,
    topicTags,
    evidenceChunks,
    entities,
    claims,
    intentSlots,
    resumeFields,
    riskLevel: structured.riskLevel || item.riskLevel,
    schemaType: schemaDerived.schemaType,
    structuredProfile: schemaDerived.structuredProfile,
    cloudStructuredAt: new Date().toISOString(),
    cloudStructuredModel: result.model,
  });
}

export async function enrichImageOne(
  item: ParsedDocument,
  runImageParse = runDocumentImageVlm,
): Promise<ParsedDocument> {
  const result = await runImageParse({ item, imagePath: item.path });
  if (!result?.parsed) return item;

  const structured = result.parsed;
  const evidenceChunks = mergeEvidenceChunks(item.evidenceChunks, structured.evidenceBlocks);
  const entities = mergeEntities(item.entities, structured.entities as CloudEntity[] | undefined, evidenceChunks);
  const claims = mergeClaims(item.claims, structured.claims as CloudClaim[] | undefined, evidenceChunks);
  const topicTags = uniqStrings([...(item.topicTags || []), ...(structured.topicTags || [])]).slice(0, 16);
  const summary = sanitizeText(structured.summary || structured.visualSummary, 500) || item.summary;
  const fieldCandidates = normalizeImageFieldCandidates(item, structured.fieldCandidates);
  const withCandidateFields = assignCandidateFields({
    ...item,
    parseStatus: 'parsed',
    canonicalParseStatus: 'ready',
    parseMethod: item.parseMethod?.includes('image-ocr')
      ? 'image-ocr+vlm'
      : 'image-vlm',
    parseStage: 'detailed',
    detailParseStatus: 'succeeded',
    detailParsedAt: new Date().toISOString(),
    detailParseAttempts: Math.max(1, Number(item.detailParseAttempts || 0)),
    detailParseError: undefined,
    summary,
    excerpt: summary || item.excerpt,
    fullText: buildImageFullText(item, structured),
    extractedChars: sanitizeText(structured.transcribedText || structured.visualSummary, 8000).length,
    topicTags,
    evidenceChunks,
    entities,
    claims,
    riskLevel: structured.riskLevel || item.riskLevel,
    cloudStructuredAt: new Date().toISOString(),
    cloudStructuredModel: result.model,
  }, fieldCandidates);

  const refreshed = refreshDerivedSchemaProfile(withCandidateFields);
  const currentProfile = refreshed.structuredProfile && typeof refreshed.structuredProfile === 'object' && !Array.isArray(refreshed.structuredProfile)
    ? refreshed.structuredProfile as Record<string, unknown>
    : {};

  return {
    ...refreshed,
    structuredProfile: {
      ...currentProfile,
      ...buildImageStructuredTopLevelFields(currentProfile, fieldCandidates),
      fieldDetails: buildImageStructuredFieldDetails(refreshed, fieldCandidates, evidenceChunks),
      imageUnderstanding: buildImageUnderstandingPayload(structured, fieldCandidates),
    },
  };
}

export async function enrichPresentationOne(
  item: ParsedDocument,
  runImageParse = runDocumentImageVlm,
  runTextParse = runDocumentAdvancedParse,
  renderPresentation = renderPresentationDocumentToImages,
): Promise<ParsedDocument> {
  const rendered = await renderPresentation(item.path, { maxSlides: PRESENTATION_VLM_MAX_SLIDES });
  if (!rendered?.images?.length) {
    return enrichTextOne(item, runTextParse);
  }

  try {
    const slideResults: RenderedPageResult[] = [];

    for (const image of rendered.images) {
      const slideItem: ParsedDocument = {
        ...item,
        title: `${item.title || item.name} - Slide ${image.pageNumber}`,
      };
      const result = await runImageParse({ item: slideItem, imagePath: image.imagePath });
      if (result?.parsed) {
        slideResults.push({
          pageNumber: image.pageNumber,
          model: result.model,
          payload: result.parsed,
        });
      }
    }

    if (!slideResults.length) {
      return enrichTextOne(item, runTextParse);
    }
    return applyRenderedPageCollection(item, slideResults, {
      pageLabel: 'Slide',
      markerLabel: 'Presentation VLM understanding',
      parseMethodSuffix: 'presentation-vlm',
      understandingKey: 'presentationUnderstanding',
      countKey: 'slideCount',
      itemsKey: 'slides',
    });
  } finally {
    await rendered.cleanup().catch(() => undefined);
  }
}

export async function enrichPdfOne(
  item: ParsedDocument,
  runImageParse = runDocumentImageVlm,
  runTextParse = runDocumentAdvancedParse,
  renderPdf = renderPdfDocumentToImages,
): Promise<ParsedDocument> {
  const rendered = await renderPdf(item.path, { maxPages: PDF_VLM_MAX_PAGES });
  if (!rendered?.images?.length) {
    return enrichTextOne(item, runTextParse);
  }

  try {
    const pageResults: RenderedPageResult[] = [];

    for (const image of rendered.images) {
      const pageItem: ParsedDocument = {
        ...item,
        title: `${item.title || item.name} - Page ${image.pageNumber}`,
      };
      const result = await runImageParse({ item: pageItem, imagePath: image.imagePath });
      if (result?.parsed) {
        pageResults.push({
          pageNumber: image.pageNumber,
          model: result.model,
          payload: result.parsed,
        });
      }
    }

    if (!pageResults.length) {
      return enrichTextOne(item, runTextParse);
    }

    return applyRenderedPageCollection(item, pageResults, {
      pageLabel: 'Page',
      markerLabel: 'PDF VLM understanding',
      parseMethodSuffix: 'pdf-vlm',
      understandingKey: 'pdfUnderstanding',
      countKey: 'pageCount',
      itemsKey: 'pages',
    });
  } finally {
    await rendered.cleanup().catch(() => undefined);
  }
}
