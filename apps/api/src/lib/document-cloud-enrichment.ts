import type {
  ResumeFields,
  EvidenceChunk,
  IntentSlots,
  ParsedDocument,
  StructuredClaim,
  StructuredEntity,
} from './document-parser.js';
import { deriveSchemaProfile, refreshDerivedSchemaProfile } from './document-parser.js';
import { getDocumentAdvancedParseProviderMode, runDocumentAdvancedParse } from './document-advanced-parse-provider.js';

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

type CloudDocumentStructure = {
  summary?: string;
  topicTags?: string[];
  riskLevel?: ParsedDocument['riskLevel'];
  evidenceBlocks?: CloudEvidenceBlock[];
  entities?: CloudEntity[];
  claims?: CloudClaim[];
  intentSlots?: IntentSlots;
};

const CLOUD_ENRICH_ENABLED = process.env.ENABLE_OPENCLAW_DOCUMENT_STRUCTURING !== '0';
const CLOUD_ENRICH_MAX_PER_BATCH = Math.max(0, Number(process.env.OPENCLAW_DOCUMENT_STRUCTURING_BATCH_LIMIT || 12));
const CLOUD_ENRICH_CONCURRENCY = Math.max(1, Number(process.env.OPENCLAW_DOCUMENT_STRUCTURING_CONCURRENCY || 2));
const MAX_PROMPT_CHARS = Number(process.env.OPENCLAW_DOCUMENT_STRUCTURING_INPUT_LIMIT || 7000);

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

function buildDocumentContext(item: ParsedDocument) {
  const evidence = (item.evidenceChunks || [])
    .slice(0, 6)
    .map((chunk, index) => `Evidence ${index + 1}: ${sanitizeText(chunk.text, 800)}`)
    .join('\n');
  const fullText = sanitizeText(item.fullText || '', Math.max(1200, MAX_PROMPT_CHARS));

  return [
    `Title: ${item.title || item.name}`,
    `Category: ${item.category}`,
    `Business category: ${item.bizCategory}`,
    `Existing summary: ${sanitizeText(item.summary, 500)}`,
    `Existing tags: ${(item.topicTags || []).join(', ') || 'none'}`,
    `Excerpt: ${sanitizeText(item.excerpt, 1000)}`,
    evidence ? `Existing evidence blocks:\n${evidence}` : '',
    fullText ? `Source text excerpt:\n${fullText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, MAX_PROMPT_CHARS);
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

async function enrichOne(item: ParsedDocument): Promise<ParsedDocument> {
  if (item.parseStatus !== 'parsed' || !item.fullText || item.extractedChars < 80) {
    return item;
  }

  const result = await runDocumentAdvancedParse({
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
  const schemaDerived = deriveSchemaProfile({
    category: item.category,
    bizCategory: item.bizCategory,
    title: item.title || item.name,
    topicTags,
    summary,
    contractFields: item.contractFields,
    resumeFields: item.resumeFields as ResumeFields | undefined,
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
    riskLevel: structured.riskLevel || item.riskLevel,
    schemaType: schemaDerived.schemaType,
    structuredProfile: schemaDerived.structuredProfile,
    cloudStructuredAt: new Date().toISOString(),
    cloudStructuredModel: result.model,
  });
}

export async function enhanceParsedDocumentsWithCloud(items: ParsedDocument[]) {
  const providerMode = getDocumentAdvancedParseProviderMode();
  if (
    !CLOUD_ENRICH_ENABLED
    || CLOUD_ENRICH_MAX_PER_BATCH <= 0
    || providerMode === 'disabled'
  ) {
    return items;
  }

  const candidateIndexes = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.parseStatus === 'parsed' && Boolean(item.fullText))
    .slice(0, CLOUD_ENRICH_MAX_PER_BATCH);

  if (!candidateIndexes.length) {
    return items;
  }

  const output = [...items];
  let cursor = 0;

  async function worker() {
    while (cursor < candidateIndexes.length) {
      const current = candidateIndexes[cursor];
      cursor += 1;
      try {
        output[current.index] = await enrichOne(current.item);
      } catch {
        output[current.index] = current.item;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CLOUD_ENRICH_CONCURRENCY, candidateIndexes.length) }, () => worker()),
  );

  return output;
}
