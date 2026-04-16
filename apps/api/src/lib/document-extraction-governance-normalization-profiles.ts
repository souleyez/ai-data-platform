import type {
  DocumentExtractionGovernanceConfig,
  DocumentExtractionProfile,
} from './document-extraction-governance-types.js';
import {
  normalizeFieldAliases,
  normalizeFieldConflictStrategies,
  normalizeFieldNormalizationRules,
  normalizeFieldPrompts,
  normalizePreferredFieldKeys,
  normalizeRequiredFieldKeys,
} from './document-extraction-governance-normalization-fields.js';
import {
  hasOwnProperty,
  normalizeFieldSet,
  normalizeSchemaType,
  normalizeString,
  normalizeStringList,
} from './document-extraction-governance-normalization-support.js';

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
