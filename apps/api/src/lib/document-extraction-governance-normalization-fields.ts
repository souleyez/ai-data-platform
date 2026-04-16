import {
  DOCUMENT_EXTRACTION_FIELD_KEYS_BY_SET,
  type DocumentExtractionFieldConflictStrategy,
  type DocumentExtractionFieldConflictStrategyMap,
  type DocumentExtractionFieldKey,
  type DocumentExtractionFieldNormalizationRules,
  type DocumentExtractionFieldPromptMap,
  type DocumentExtractionFieldSet,
} from './document-extraction-governance-types.js';
import {
  normalizeRuleList,
  normalizeString,
} from './document-extraction-governance-normalization-support.js';

export function normalizePreferredFieldKeys(fieldSet: DocumentExtractionFieldSet, value: unknown) {
  const allowed = new Set(DOCUMENT_EXTRACTION_FIELD_KEYS_BY_SET[fieldSet]);
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n]/)
      : [];

  return [...new Set(
    rawValues
      .map((item) => normalizeString(item))
      .filter(Boolean)
      .filter((item): item is DocumentExtractionFieldKey => allowed.has(item as DocumentExtractionFieldKey)),
  )];
}

export function normalizeRequiredFieldKeys(
  fieldSet: DocumentExtractionFieldSet,
  preferredFieldKeys: DocumentExtractionFieldKey[] | undefined,
  value: unknown,
) {
  const allowed = new Set(
    Array.isArray(preferredFieldKeys) && preferredFieldKeys.length
      ? preferredFieldKeys
      : DOCUMENT_EXTRACTION_FIELD_KEYS_BY_SET[fieldSet],
  );
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n]/)
      : [];

  return [...new Set(
    rawValues
      .map((item) => normalizeString(item))
      .filter(Boolean)
      .filter((item): item is DocumentExtractionFieldKey => allowed.has(item as DocumentExtractionFieldKey)),
  )];
}

export function normalizeFieldAliases(fieldSet: DocumentExtractionFieldSet, value: unknown) {
  const allowed = new Set(DOCUMENT_EXTRACTION_FIELD_KEYS_BY_SET[fieldSet]);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const aliases = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, alias]) => [normalizeString(key), normalizeString(alias)])
      .filter(([key, alias]) => key && alias && !/^[?？]+$/.test(alias))
      .filter(([key]) => allowed.has(key as DocumentExtractionFieldKey)),
  ) as Partial<Record<DocumentExtractionFieldKey, string>>;

  return Object.keys(aliases).length ? aliases : undefined;
}

export function normalizeFieldPrompts(fieldSet: DocumentExtractionFieldSet, value: unknown) {
  const allowed = new Set(DOCUMENT_EXTRACTION_FIELD_KEYS_BY_SET[fieldSet]);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const prompts = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, prompt]) => [normalizeString(key), normalizeString(prompt)])
      .filter(([key, prompt]) => key && prompt)
      .filter(([key]) => allowed.has(key as DocumentExtractionFieldKey)),
  ) as DocumentExtractionFieldPromptMap;

  return Object.keys(prompts).length ? prompts : undefined;
}

export function normalizeFieldNormalizationRules(fieldSet: DocumentExtractionFieldSet, value: unknown) {
  const allowed = new Set(DOCUMENT_EXTRACTION_FIELD_KEYS_BY_SET[fieldSet]);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const rules = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, ruleValue]) => [normalizeString(key), normalizeRuleList(ruleValue)] as const)
      .filter(([key, entries]) => key && entries.length > 0)
      .filter(([key]) => allowed.has(key as DocumentExtractionFieldKey)),
  ) as DocumentExtractionFieldNormalizationRules;

  return Object.keys(rules).length ? rules : undefined;
}

export function normalizeFieldConflictStrategy(value: unknown): DocumentExtractionFieldConflictStrategy | undefined {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === 'keep-first' || normalized === 'keep-last' || normalized === 'merge-distinct') {
    return normalized;
  }
  return undefined;
}

export function normalizeFieldConflictStrategies(fieldSet: DocumentExtractionFieldSet, value: unknown) {
  const allowed = new Set(DOCUMENT_EXTRACTION_FIELD_KEYS_BY_SET[fieldSet]);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const strategies = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, strategy]) => [normalizeString(key), normalizeFieldConflictStrategy(strategy)] as const)
      .filter(([key, strategy]) => key && strategy)
      .filter(([key]) => allowed.has(key as DocumentExtractionFieldKey)),
  ) as DocumentExtractionFieldConflictStrategyMap;

  return Object.keys(strategies).length ? strategies : undefined;
}
