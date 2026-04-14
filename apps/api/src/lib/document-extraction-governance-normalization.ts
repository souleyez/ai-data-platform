import {
  DOCUMENT_EXTRACTION_FIELD_KEYS_BY_SET,
  type DocumentExtractionFieldConflictStrategy,
  type DocumentExtractionFieldConflictStrategyMap,
  type DocumentExtractionFieldKey,
  type DocumentExtractionFieldNormalizationRules,
  type DocumentExtractionFieldPromptMap,
  type DocumentExtractionFieldSet,
  type DocumentExtractionGovernanceConfig,
  type DocumentExtractionProfile,
  type DocumentGovernedSchemaType,
} from './document-extraction-governance-types.js';

export function normalizeString(value: unknown) {
  return String(value ?? '').trim();
}

export function normalizeStringList(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => normalizeString(item).toLowerCase()).filter(Boolean))]
    : [];
}

export function normalizeRuleList(value: unknown) {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n]/)
      : [];

  return [...new Set(
    rawValues
      .map((item) => normalizeString(item))
      .filter(Boolean)
      .filter((item) => !/^[?？]+$/.test(item)),
  )];
}

export function normalizeFieldSet(value: unknown) {
  const normalized = normalizeString(value);
  return normalized === 'contract'
    || normalized === 'resume'
    || normalized === 'enterprise-guidance'
    || normalized === 'order'
    ? normalized
    : null;
}

export function normalizeSchemaType(value: unknown) {
  const normalized = normalizeString(value);
  return normalized === 'contract'
    || normalized === 'resume'
    || normalized === 'technical'
    || normalized === 'order'
    ? normalized
    : undefined;
}

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

function hasOwnProperty(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function shouldPreserveDefaultPreferredFieldKeys(
  existing: DocumentExtractionProfile,
  incoming: DocumentExtractionProfile,
) {
  return !incoming.id.startsWith('library-')
    && Array.isArray(existing.preferredFieldKeys)
    && existing.preferredFieldKeys.length > 0
    && Array.isArray(incoming.preferredFieldKeys)
    && incoming.preferredFieldKeys.length === 0;
}

export function shouldPreserveDefaultRequiredFieldKeys(
  existing: DocumentExtractionProfile,
  incoming: DocumentExtractionProfile,
) {
  return !incoming.id.startsWith('library-')
    && Array.isArray(existing.requiredFieldKeys)
    && existing.requiredFieldKeys.length > 0
    && Array.isArray(incoming.requiredFieldKeys)
    && incoming.requiredFieldKeys.length === 0;
}

export function shouldPreserveDefaultFieldAliases(
  existing: DocumentExtractionProfile,
  incoming: DocumentExtractionProfile,
) {
  return !incoming.id.startsWith('library-')
    && existing.fieldAliases
    && Object.keys(existing.fieldAliases).length > 0
    && incoming.fieldAliases
    && Object.keys(incoming.fieldAliases).length === 0;
}

export function shouldPreserveDefaultFieldPrompts(
  existing: DocumentExtractionProfile,
  incoming: DocumentExtractionProfile,
) {
  return !incoming.id.startsWith('library-')
    && existing.fieldPrompts
    && Object.keys(existing.fieldPrompts).length > 0
    && incoming.fieldPrompts
    && Object.keys(incoming.fieldPrompts).length === 0;
}

export function shouldPreserveDefaultFieldNormalizationRules(
  existing: DocumentExtractionProfile,
  incoming: DocumentExtractionProfile,
) {
  return !incoming.id.startsWith('library-')
    && existing.fieldNormalizationRules
    && Object.keys(existing.fieldNormalizationRules).length > 0
    && incoming.fieldNormalizationRules
    && Object.keys(incoming.fieldNormalizationRules).length === 0;
}

export function shouldPreserveDefaultFieldConflictStrategies(
  existing: DocumentExtractionProfile,
  incoming: DocumentExtractionProfile,
) {
  return !incoming.id.startsWith('library-')
    && existing.fieldConflictStrategies
    && Object.keys(existing.fieldConflictStrategies).length > 0
    && incoming.fieldConflictStrategies
    && Object.keys(incoming.fieldConflictStrategies).length === 0;
}

export function normalizeDocumentExtractionProfile(input: unknown): DocumentExtractionProfile | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const id = normalizeString(value.id);
  const fieldSet = normalizeFieldSet(value.fieldSet);
  if (!id || !fieldSet) return null;
  const preferredFieldKeys = hasOwnProperty(value, 'preferredFieldKeys')
    ? normalizePreferredFieldKeys(fieldSet, value.preferredFieldKeys)
    : undefined;

  return {
    id,
    label: normalizeString(value.label) || id,
    matchLibraryKeys: normalizeStringList(value.matchLibraryKeys),
    matchLibraryLabels: normalizeStringList(value.matchLibraryLabels),
    fieldSet,
    fallbackSchemaType: normalizeSchemaType(value.fallbackSchemaType),
    preferredFieldKeys,
    requiredFieldKeys: hasOwnProperty(value, 'requiredFieldKeys')
      ? normalizeRequiredFieldKeys(fieldSet, preferredFieldKeys, value.requiredFieldKeys)
      : undefined,
    fieldAliases: hasOwnProperty(value, 'fieldAliases')
      ? normalizeFieldAliases(fieldSet, value.fieldAliases)
      : undefined,
    fieldPrompts: hasOwnProperty(value, 'fieldPrompts')
      ? normalizeFieldPrompts(fieldSet, value.fieldPrompts)
      : undefined,
    fieldNormalizationRules: hasOwnProperty(value, 'fieldNormalizationRules')
      ? normalizeFieldNormalizationRules(fieldSet, value.fieldNormalizationRules)
      : undefined,
    fieldConflictStrategies: hasOwnProperty(value, 'fieldConflictStrategies')
      ? normalizeFieldConflictStrategies(fieldSet, value.fieldConflictStrategies)
      : undefined,
  };
}

export function normalizeDocumentExtractionGovernance(input: unknown): DocumentExtractionGovernanceConfig {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const profiles = Array.isArray(value.profiles)
    ? value.profiles.map(normalizeDocumentExtractionProfile).filter(Boolean) as DocumentExtractionProfile[]
    : [];

  return {
    version: Number(value.version) || 1,
    updatedAt: normalizeString(value.updatedAt) || new Date().toISOString(),
    profiles,
  };
}

export function normalizeLibraryOverrideProfileId(libraryKey: string) {
  return `library-${normalizeString(libraryKey).toLowerCase()}`;
}

export function normalizeOptionalFieldSet(value: unknown) {
  const normalized = normalizeString(value);
  if (!normalized || normalized === 'auto') return undefined;
  return normalizeFieldSet(normalized) || undefined;
}

export function normalizeOptionalSchemaType(value: unknown) {
  const normalized = normalizeString(value);
  if (!normalized || normalized === 'auto') return undefined;
  return normalizeSchemaType(normalized);
}

export function inferFieldSetFromSchemaType(
  schemaType?: DocumentGovernedSchemaType,
): DocumentExtractionFieldSet | undefined {
  if (schemaType === 'contract') return 'contract';
  if (schemaType === 'resume') return 'resume';
  if (schemaType === 'technical') return 'enterprise-guidance';
  if (schemaType === 'order') return 'order';
  return undefined;
}
