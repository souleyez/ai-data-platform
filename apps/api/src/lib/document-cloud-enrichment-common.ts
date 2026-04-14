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
} from './document-parser.js';
import {
  getParsedDocumentCanonicalSource,
  getParsedDocumentCanonicalText,
} from './document-canonical-text.js';
import { getDocumentAdvancedParseProviderMode } from './document-advanced-parse-provider.js';

export type CloudEvidenceBlock = {
  title?: string;
  text?: string;
};

export type CloudEntity = {
  text?: string;
  type?: StructuredEntity['type'];
  confidence?: number;
  evidenceText?: string;
};

export type CloudClaim = {
  subject?: string;
  predicate?: string;
  object?: string;
  confidence?: number;
  evidenceText?: string;
};

export type CloudDocumentStructure = {
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
export const MAX_PROMPT_CHARS = Number(process.env.OPENCLAW_DOCUMENT_STRUCTURING_INPUT_LIMIT || 7000);
const IMAGE_EXTENSIONS = new Set<string>(DOCUMENT_IMAGE_EXTENSIONS);
const PRESENTATION_EXTENSIONS = new Set<string>(DOCUMENT_PRESENTATION_EXTENSIONS);
const PDF_EXTENSIONS = new Set<string>(['.pdf']);
export const PRESENTATION_VLM_MAX_SLIDES = Math.max(1, Number(process.env.DOCUMENT_PRESENTATION_VLM_MAX_SLIDES || 12));
export const PDF_VLM_MAX_PAGES = Math.max(1, Number(process.env.DOCUMENT_PDF_VLM_MAX_PAGES || 8));
const PDF_VLM_MIN_CANONICAL_CHARS = Math.max(0, Number(process.env.DOCUMENT_PDF_VLM_MIN_CANONICAL_CHARS || 600));

export function normalizeLegacyBizCategory(value: ParsedDocument['bizCategory'] | undefined): ParsedDocument['bizCategory'] {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'order' || normalized === 'inventory' || normalized === 'footfall') {
    return normalized as ParsedDocument['bizCategory'];
  }
  return 'general';
}

export function uniqStrings(values?: Array<string | undefined>) {
  return [...new Set((values || []).map((item) => String(item || '').trim()).filter(Boolean))];
}

export function clampConfidence(value: unknown, fallback = 0.66) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

export function sanitizeText(value: unknown, maxLength = 800) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

export function hasStructuredValue(value: unknown) {
  if (Array.isArray(value)) return value.some((item) => String(item || '').trim());
  return String(value ?? '').trim().length > 0;
}

export function extractJsonObject(raw: string) {
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

export function buildDocumentContext(item: ParsedDocument) {
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

export function mergeEvidenceChunks(existing: EvidenceChunk[] | undefined, incoming: CloudEvidenceBlock[] | undefined) {
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

export function findEvidenceChunkIdByText(evidenceChunks: EvidenceChunk[] | undefined, evidenceText?: string) {
  const normalized = sanitizeText(evidenceText, 500).toLowerCase();
  if (!normalized || !evidenceChunks?.length) return undefined;
  return evidenceChunks.find((chunk) => chunk.text.toLowerCase().includes(normalized))?.id;
}

export function mergeEntities(
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

export function mergeClaims(
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

export function mergeIntentSlots(existing: IntentSlots | undefined, incoming: IntentSlots | undefined): IntentSlots {
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
