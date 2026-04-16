import {
  normalizeLibraryOverrideProfileId,
  normalizeString,
} from './document-extraction-governance-normalization.js';
import { loadDocumentExtractionGovernance } from './document-extraction-governance-store.js';
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
