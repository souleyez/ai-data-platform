import type { DocumentExtractionProfile } from './document-extraction-governance-types.js';

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
