import { normalizeString } from './document-extraction-governance-normalization.js';
import {
  type DocumentExtractionFieldConflictStrategy,
  type DocumentExtractionFieldKey,
  type DocumentExtractionGovernanceConfig,
  type DocumentExtractionProfile,
  type DocumentLibraryContext,
} from './document-extraction-governance-types.js';

export function buildDocumentLibraryContext(
  libraries: Array<{ key: string; label: string }>,
  libraryKeys: string[],
): DocumentLibraryContext | undefined {
  const keys = [...new Set((libraryKeys || []).map((item) => normalizeString(item)).filter(Boolean))];
  if (!keys.length) return undefined;

  const labels = [...new Set(
    keys
      .map((key) => libraries.find((library) => library.key === key)?.label || key)
      .map((item) => normalizeString(item))
      .filter(Boolean),
  )];

  return { keys, labels };
}

export function resolveDocumentExtractionProfile(
  config: DocumentExtractionGovernanceConfig,
  libraryContext?: DocumentLibraryContext,
) {
  if (!libraryContext || !config.profiles.length) return null;

  const keySet = new Set((libraryContext.keys || []).map((item) => normalizeString(item).toLowerCase()).filter(Boolean));
  const labelSet = new Set((libraryContext.labels || []).map((item) => normalizeString(item).toLowerCase()).filter(Boolean));

  return config.profiles.find((profile) =>
    profile.matchLibraryKeys.some((item) => keySet.has(item))
    || profile.matchLibraryLabels.some((item) => labelSet.has(item)),
  ) || null;
}

function normalizeFieldValueText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseFieldNormalizationRule(rule: string) {
  const text = normalizeString(rule);
  if (!text) return null;
  const arrowIndex = text.indexOf('=>');
  if (arrowIndex < 0) return null;
  const match = normalizeString(text.slice(0, arrowIndex));
  const normalized = normalizeString(text.slice(arrowIndex + 2));
  if (!match || !normalized) return null;
  return { match, normalized };
}

function applyFieldNormalizationRules(value: string, rules: string[]) {
  const text = normalizeFieldValueText(value);
  if (!text) return [];

  for (const rawRule of rules) {
    const parsedRule = parseFieldNormalizationRule(rawRule);
    if (!parsedRule) continue;
    if (text.localeCompare(parsedRule.match, 'zh-CN', { sensitivity: 'base' }) === 0) {
      return [parsedRule.normalized];
    }
  }

  return [text];
}

export function resolveDocumentExtractionFieldConflictStrategy(
  fieldKey: string,
  extractionProfile?: Pick<DocumentExtractionProfile, 'fieldConflictStrategies'>,
  fallback: DocumentExtractionFieldConflictStrategy = 'merge-distinct',
) {
  const configured = extractionProfile?.fieldConflictStrategies?.[fieldKey as DocumentExtractionFieldKey];
  return configured || fallback;
}

export function normalizeDocumentExtractionFieldValues(
  fieldKey: string,
  value: unknown,
  extractionProfile?: Pick<DocumentExtractionProfile, 'fieldNormalizationRules'>,
) {
  const rules = extractionProfile?.fieldNormalizationRules?.[fieldKey as DocumentExtractionFieldKey] || [];
  const values = Array.isArray(value) ? value : [value];
  const normalizedValues = values.flatMap((entry) => {
    const text = normalizeFieldValueText(entry);
    if (!text) return [];
    return rules.length ? applyFieldNormalizationRules(text, rules) : [text];
  });

  return [...new Set(normalizedValues.filter(Boolean))];
}

export function resolveDocumentExtractionConflictValues(
  fieldKey: string,
  values: string[],
  extractionProfile?: Pick<DocumentExtractionProfile, 'fieldConflictStrategies'>,
  fallback: DocumentExtractionFieldConflictStrategy = 'merge-distinct',
) {
  const normalizedValues = [...new Set((values || []).map((item) => normalizeFieldValueText(item)).filter(Boolean))];
  if (!normalizedValues.length) return [];

  const strategy = resolveDocumentExtractionFieldConflictStrategy(fieldKey, extractionProfile, fallback);
  if (strategy === 'keep-first') return [normalizedValues[0]];
  if (strategy === 'keep-last') return [normalizedValues[normalizedValues.length - 1]];
  return normalizedValues;
}

export function applyDocumentExtractionFieldGovernance<T extends Record<string, unknown>>(
  fields: T | undefined,
  extractionProfile?: Pick<DocumentExtractionProfile, 'fieldNormalizationRules' | 'fieldConflictStrategies'>,
) {
  if (!fields || typeof fields !== 'object') return fields;

  const nextEntries = Object.entries(fields).map(([fieldKey, rawValue]) => {
    if (Array.isArray(rawValue)) {
      const normalizedValues = normalizeDocumentExtractionFieldValues(fieldKey, rawValue, extractionProfile);
      return [
        fieldKey,
        resolveDocumentExtractionConflictValues(fieldKey, normalizedValues, extractionProfile, 'merge-distinct'),
      ] as const;
    }

    if (typeof rawValue === 'string') {
      const normalizedValues = normalizeDocumentExtractionFieldValues(fieldKey, rawValue, extractionProfile);
      const resolvedValues = resolveDocumentExtractionConflictValues(fieldKey, normalizedValues, extractionProfile, 'keep-last');
      return [fieldKey, resolvedValues[resolvedValues.length - 1] || ''] as const;
    }

    return [fieldKey, rawValue] as const;
  });

  return Object.fromEntries(nextEntries) as T;
}
