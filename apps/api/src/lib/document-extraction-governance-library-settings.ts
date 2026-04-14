import {
  inferFieldSetFromSchemaType,
  normalizeFieldAliases,
  normalizeFieldConflictStrategies,
  normalizeFieldPrompts,
  normalizeFieldNormalizationRules,
  normalizeLibraryOverrideProfileId,
  normalizeOptionalFieldSet,
  normalizeOptionalSchemaType,
  normalizePreferredFieldKeys,
  normalizeRequiredFieldKeys,
  normalizeString,
} from './document-extraction-governance-normalization.js';
import { loadDocumentExtractionGovernance, writeDocumentExtractionGovernance } from './document-extraction-governance-store.js';
import {
  type DocumentExtractionGovernanceConfig,
  type DocumentLibraryExtractionSettings,
} from './document-extraction-governance-types.js';

export function getDocumentLibraryExtractionSettings(
  config: DocumentExtractionGovernanceConfig,
  library: { key: string; label: string },
) {
  const overrideId = normalizeLibraryOverrideProfileId(library.key);
  const override = config.profiles.find((profile) => profile.id === overrideId)
    || config.profiles.find((profile) => profile.matchLibraryKeys.includes(normalizeString(library.key).toLowerCase()));

  if (!override) return {} satisfies DocumentLibraryExtractionSettings;
  return {
    profileId: override.id,
    fieldSet: override.fieldSet,
    fallbackSchemaType: override.fallbackSchemaType,
    preferredFieldKeys: override.preferredFieldKeys,
    requiredFieldKeys: override.requiredFieldKeys,
    fieldAliases: override.fieldAliases,
    fieldPrompts: override.fieldPrompts,
    fieldNormalizationRules: override.fieldNormalizationRules,
    fieldConflictStrategies: override.fieldConflictStrategies,
  } satisfies DocumentLibraryExtractionSettings;
}

export function attachDocumentExtractionSettings<T extends { key: string; label: string }>(
  libraries: T[],
  config = loadDocumentExtractionGovernance(),
) {
  return libraries.map((library) => ({
    ...library,
    extractionSettings: getDocumentLibraryExtractionSettings(config, library),
  }));
}

export async function updateLibraryDocumentExtractionSettings(
  input: {
    key: string;
    label: string;
    fieldSet?: string;
    fallbackSchemaType?: string;
    preferredFieldKeys?: string[];
    requiredFieldKeys?: string[];
    fieldAliases?: Record<string, string>;
    fieldPrompts?: Record<string, string>;
    fieldNormalizationRules?: Record<string, string[] | string>;
    fieldConflictStrategies?: Record<string, string>;
  },
) {
  const key = normalizeString(input.key);
  const label = normalizeString(input.label);
  if (!key || !label) {
    throw new Error('library key and label are required');
  }

  const current = loadDocumentExtractionGovernance();
  const overrideId = normalizeLibraryOverrideProfileId(key);
  const existingOverride = current.profiles.find((profile) => profile.id === overrideId);
  const fieldSet = normalizeOptionalFieldSet(input.fieldSet);
  const fallbackSchemaType = normalizeOptionalSchemaType(input.fallbackSchemaType);
  const requestedPreferredFieldKeys = Array.isArray(input.preferredFieldKeys)
    ? input.preferredFieldKeys.map((item) => normalizeString(item)).filter(Boolean)
    : [];
  const requestedRequiredFieldKeys = Array.isArray(input.requiredFieldKeys)
    ? input.requiredFieldKeys.map((item) => normalizeString(item)).filter(Boolean)
    : [];
  const requestedFieldAliases = input.fieldAliases && typeof input.fieldAliases === 'object'
    ? input.fieldAliases
    : {};
  const requestedFieldPrompts = input.fieldPrompts && typeof input.fieldPrompts === 'object'
    ? input.fieldPrompts
    : {};
  const requestedFieldNormalizationRules = input.fieldNormalizationRules && typeof input.fieldNormalizationRules === 'object'
    ? input.fieldNormalizationRules
    : {};
  const requestedFieldConflictStrategies = input.fieldConflictStrategies && typeof input.fieldConflictStrategies === 'object'
    ? input.fieldConflictStrategies
    : {};
  const requestedReset = normalizeString(input.fieldSet).toLowerCase() === 'auto'
    && normalizeString(input.fallbackSchemaType).toLowerCase() === 'auto';
  const nextProfiles = current.profiles.filter((profile) => profile.id !== overrideId);
  const nextFieldSet = requestedReset
    ? undefined
    : (fieldSet || existingOverride?.fieldSet || inferFieldSetFromSchemaType(fallbackSchemaType));
  const nextPreferredFieldKeys = nextFieldSet
    ? normalizePreferredFieldKeys(
        nextFieldSet,
        requestedPreferredFieldKeys.length
          ? requestedPreferredFieldKeys
          : (existingOverride?.preferredFieldKeys || []),
      )
    : [];
  const nextRequiredFieldKeys = nextFieldSet
    ? normalizeRequiredFieldKeys(
        nextFieldSet,
        nextPreferredFieldKeys,
        requestedRequiredFieldKeys.length
          ? requestedRequiredFieldKeys
          : (existingOverride?.requiredFieldKeys || []),
      )
    : [];
  const nextFieldAliases = nextFieldSet
    ? normalizeFieldAliases(
        nextFieldSet,
        Object.keys(requestedFieldAliases).length
          ? requestedFieldAliases
          : (existingOverride?.fieldAliases || {}),
      )
    : undefined;
  const nextFieldPrompts = nextFieldSet
    ? normalizeFieldPrompts(
        nextFieldSet,
        Object.keys(requestedFieldPrompts).length
          ? requestedFieldPrompts
          : (existingOverride?.fieldPrompts || {}),
      )
    : undefined;
  const nextFieldNormalizationRules = nextFieldSet
    ? normalizeFieldNormalizationRules(
        nextFieldSet,
        Object.keys(requestedFieldNormalizationRules).length
          ? requestedFieldNormalizationRules
          : (existingOverride?.fieldNormalizationRules || {}),
      )
    : undefined;
  const nextFieldConflictStrategies = nextFieldSet
    ? normalizeFieldConflictStrategies(
        nextFieldSet,
        Object.keys(requestedFieldConflictStrategies).length
          ? requestedFieldConflictStrategies
          : (existingOverride?.fieldConflictStrategies || {}),
      )
    : undefined;

  if (nextFieldSet || fallbackSchemaType) {
    nextProfiles.push({
      id: overrideId,
      label: `${label} 提取模板`,
      matchLibraryKeys: [key.toLowerCase()],
      matchLibraryLabels: [label.toLowerCase()],
      fieldSet: nextFieldSet || 'contract',
      fallbackSchemaType,
      preferredFieldKeys: nextPreferredFieldKeys,
      requiredFieldKeys: nextRequiredFieldKeys,
      fieldAliases: nextFieldAliases,
      fieldPrompts: nextFieldPrompts,
      fieldNormalizationRules: nextFieldNormalizationRules,
      fieldConflictStrategies: nextFieldConflictStrategies,
    });
  }

  const nextConfig = {
    version: current.version || 1,
    updatedAt: new Date().toISOString(),
    profiles: nextProfiles,
  } satisfies DocumentExtractionGovernanceConfig;

  await writeDocumentExtractionGovernance(nextConfig);
  return nextConfig;
}

export async function deleteLibraryDocumentExtractionSettings(libraryKey: string) {
  const key = normalizeString(libraryKey);
  if (!key) return;

  const current = loadDocumentExtractionGovernance();
  const overrideId = normalizeLibraryOverrideProfileId(key);
  const nextProfiles = current.profiles.filter((profile) => profile.id !== overrideId);
  if (nextProfiles.length === current.profiles.length) return;

  await writeDocumentExtractionGovernance({
    version: current.version || 1,
    updatedAt: new Date().toISOString(),
    profiles: nextProfiles,
  });
}
