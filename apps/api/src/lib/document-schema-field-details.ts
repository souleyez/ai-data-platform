import type { EvidenceChunk } from './document-parser.js';
import type { DocumentExtractionProfile } from './document-extraction-governance.js';

export type StructuredFieldSource = 'rule' | 'derived' | 'manual' | 'ocr' | 'vlm';

export type StructuredFieldDetail = {
  value: unknown;
  confidence: number;
  source: StructuredFieldSource;
  evidenceChunkId?: string;
};

function clampConfidence(value: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, Number(numeric.toFixed(2))));
}

function hasStructuredValue(value: unknown) {
  if (Array.isArray(value)) return value.some((item) => String(item || '').trim());
  return String(value ?? '').trim().length > 0;
}

function normalizeStructuredValue(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }
  return String(value ?? '').trim();
}

function findEvidenceChunkId(evidenceChunks: EvidenceChunk[] | undefined, value: unknown) {
  if (!Array.isArray(evidenceChunks) || !evidenceChunks.length || !hasStructuredValue(value)) {
    return undefined;
  }

  const candidates = Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter((item) => item.length >= 2)
    : [String(value || '').trim()].filter((item) => item.length >= 2);

  for (const candidate of candidates) {
    const matched = evidenceChunks.find((chunk) => String(chunk.text || '').includes(candidate));
    if (matched?.id) return matched.id;
  }

  return undefined;
}

export function createFieldDetail(
  value: unknown,
  confidence: number,
  source: StructuredFieldSource,
  evidenceChunks?: EvidenceChunk[],
) {
  if (!hasStructuredValue(value)) return null;
  return {
    value: normalizeStructuredValue(value),
    confidence: clampConfidence(confidence),
    source,
    evidenceChunkId: findEvidenceChunkId(evidenceChunks, value),
  } satisfies StructuredFieldDetail;
}

export function buildCommonFieldDetails(input: {
  title: string;
  topicTags: string[];
  summary: string;
  evidenceChunks?: EvidenceChunk[];
}) {
  const details: Record<string, StructuredFieldDetail> = {};
  const titleDetail = createFieldDetail(input.title, 0.98, 'rule', input.evidenceChunks);
  const summaryDetail = createFieldDetail(input.summary, 0.82, 'derived', input.evidenceChunks);
  const topicTagsDetail = createFieldDetail(input.topicTags, 0.76, 'rule', input.evidenceChunks);

  if (titleDetail) details.title = titleDetail;
  if (summaryDetail) details.summary = summaryDetail;
  if (topicTagsDetail) details.topicTags = topicTagsDetail;

  return details;
}

export function buildFocusedFieldPayload(
  fieldDetails: Record<string, StructuredFieldDetail>,
  extractionProfile?: Pick<
    DocumentExtractionProfile,
    | 'fieldSet'
    | 'preferredFieldKeys'
    | 'requiredFieldKeys'
    | 'fieldAliases'
    | 'fieldPrompts'
    | 'fieldNormalizationRules'
    | 'fieldConflictStrategies'
  >,
) {
  const preferredFieldKeys = Array.isArray(extractionProfile?.preferredFieldKeys)
    ? extractionProfile.preferredFieldKeys.filter(Boolean)
    : [];
  if (!preferredFieldKeys.length) return {};
  const preferredFieldKeySet = new Set<string>(preferredFieldKeys);
  const requiredFieldKeys = Array.isArray(extractionProfile?.requiredFieldKeys)
    ? extractionProfile.requiredFieldKeys.filter((key) => preferredFieldKeySet.has(key))
    : [];
  const fieldAliases = extractionProfile?.fieldAliases && typeof extractionProfile.fieldAliases === 'object'
    ? Object.fromEntries(
        Object.entries(extractionProfile.fieldAliases)
          .filter(([key, value]) => preferredFieldKeySet.has(key) && String(value || '').trim()),
      )
    : undefined;

  const focusedFieldDetails = Object.fromEntries(
    preferredFieldKeys
      .map((key) => [key, fieldDetails[key]])
      .filter((entry) => entry[1]),
  ) as Record<string, StructuredFieldDetail>;

  const focusedFields = Object.fromEntries(
    Object.entries(focusedFieldDetails).map(([key, value]) => [key, value.value]),
  );

  const focusedFieldEntries = preferredFieldKeys.map((key) => {
    const detail = focusedFieldDetails[key];
    return {
      key,
      alias: fieldAliases?.[key] || '',
      required: requiredFieldKeys.includes(key),
      value: detail?.value,
      confidence: detail?.confidence ?? null,
      source: detail?.source || '',
      evidenceChunkId: detail?.evidenceChunkId || '',
    };
  });

  const aliasFieldEntries = new Map<string, {
    key: string;
    alias: string;
    required: boolean;
    value: unknown;
    confidence: number | null;
    source: string;
    evidenceChunkId: string;
  }>();
  const orderedAliasKeys = [...preferredFieldKeys, ...Object.keys(fieldAliases || {})];

  for (const key of orderedAliasKeys) {
    if (!preferredFieldKeySet.has(key) && !(fieldAliases && key in fieldAliases)) continue;
    const alias = String(fieldAliases?.[key] || '').trim();
    const detail = fieldDetails[key];
    const isRequired = requiredFieldKeys.includes(key as (typeof requiredFieldKeys)[number]);
    if (!alias || !detail || alias === key || aliasFieldEntries.has(alias)) continue;
    aliasFieldEntries.set(alias, {
      key,
      alias,
      required: isRequired,
      value: detail.value,
      confidence: detail.confidence ?? null,
      source: detail.source || '',
      evidenceChunkId: detail.evidenceChunkId || '',
    });
  }

  const aliasFieldDetails = Object.fromEntries(
    [...aliasFieldEntries.entries()].map(([alias, entry]) => [
      alias,
      {
        value: entry.value,
        confidence: entry.confidence ?? 0,
        source: entry.source as StructuredFieldSource,
        evidenceChunkId: entry.evidenceChunkId || undefined,
      } satisfies StructuredFieldDetail,
    ]),
  ) as Record<string, StructuredFieldDetail>;

  const aliasFields = Object.fromEntries(
    [...aliasFieldEntries.entries()].map(([alias, entry]) => [alias, entry.value]),
  );

  const focusedAliasFieldDetails = Object.fromEntries(
    [...aliasFieldEntries.entries()]
      .filter(([, entry]) => preferredFieldKeySet.has(entry.key))
      .map(([alias]) => [alias, aliasFieldDetails[alias]])
      .filter((entry) => entry[1]),
  ) as Record<string, StructuredFieldDetail>;

  const focusedAliasFields = Object.fromEntries(
    Object.entries(focusedAliasFieldDetails).map(([alias, detail]) => [alias, detail.value]),
  );

  return {
    fieldTemplate: {
      fieldSet: extractionProfile?.fieldSet,
      preferredFieldKeys,
      requiredFieldKeys,
      fieldAliases,
      fieldPrompts: extractionProfile?.fieldPrompts,
      fieldNormalizationRules: extractionProfile?.fieldNormalizationRules,
      fieldConflictStrategies: extractionProfile?.fieldConflictStrategies,
    },
    aliasFieldDetails,
    aliasFields,
    focusedFieldDetails,
    focusedFields,
    focusedAliasFieldDetails,
    focusedAliasFields,
    focusedFieldEntries,
  };
}
