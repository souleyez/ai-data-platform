import type { ParsedDocument } from './document-parser.js';
import type { KnowledgeContextOptions } from './knowledge-evidence-types.js';

export function toText(value: unknown) {
  return String(value || '').trim();
}

export function clampPositiveInt(value: number | undefined, fallback: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(1, Math.min(Math.floor(numeric), max));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatAliasFieldObject(value: unknown, label: string, maxEntries: number) {
  if (!isObject(value)) return [];
  const compact = Object.entries(value)
    .map(([entryKey, entryValue]) => `${entryKey}=${String(entryValue || '').trim()}`)
    .filter((entry) => !entry.endsWith('='))
    .slice(0, maxEntries);
  return compact.length ? [`${label}: ${compact.join('; ')}`] : [];
}

function formatFieldTemplate(value: unknown) {
  if (!isObject(value)) return [];
  const fieldSet = toText(value.fieldSet);
  const preferred = Array.isArray(value.preferredFieldKeys)
    ? value.preferredFieldKeys.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 8)
    : [];
  const required = Array.isArray(value.requiredFieldKeys)
    ? value.requiredFieldKeys.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 8)
    : [];
  const aliases = isObject(value.fieldAliases)
    ? Object.entries(value.fieldAliases)
      .map(([field, alias]) => `${field}->${String(alias || '').trim()}`)
      .filter((entry) => !entry.endsWith('->'))
      .slice(0, 8)
    : [];
  const prompts = isObject(value.fieldPrompts)
    ? Object.entries(value.fieldPrompts)
      .map(([field, prompt]) => `${field}:${String(prompt || '').trim()}`)
      .filter((entry) => !entry.endsWith(':'))
      .slice(0, 6)
    : [];
  const normalizationRules = isObject(value.fieldNormalizationRules)
    ? Object.entries(value.fieldNormalizationRules)
      .map(([field, entries]) => {
        const rules = Array.isArray(entries)
          ? entries.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 3)
          : [];
        return rules.length ? `${field}=${rules.join(' ; ')}` : '';
      })
      .filter(Boolean)
      .slice(0, 6)
    : [];
  const conflicts = isObject(value.fieldConflictStrategies)
    ? Object.entries(value.fieldConflictStrategies)
      .map(([field, strategy]) => `${field}:${String(strategy || '').trim()}`)
      .filter((entry) => !entry.endsWith(':'))
      .slice(0, 6)
    : [];
  const parts = [
    fieldSet ? `fieldSet=${fieldSet}` : '',
    preferred.length ? `preferred=${preferred.join(', ')}` : '',
    required.length ? `required=${required.join(', ')}` : '',
    aliases.length ? `aliases=${aliases.join('; ')}` : '',
    prompts.length ? `prompts=${prompts.join(' | ')}` : '',
    normalizationRules.length ? `normalization=${normalizationRules.join(' | ')}` : '',
    conflicts.length ? `conflicts=${conflicts.join(' | ')}` : '',
  ].filter(Boolean);
  return parts.length ? [`fieldTemplate: ${parts.join(' | ')}`] : [];
}

export function formatStructuredProfile(
  profile: ParsedDocument['structuredProfile'],
  options?: KnowledgeContextOptions,
) {
  if (!profile || typeof profile !== 'object') return '';

  const maxEntries = clampPositiveInt(options?.maxStructuredProfileEntries, 8, 16);
  const maxArrayValues = clampPositiveInt(options?.maxStructuredArrayValues, 5, 8);
  const maxObjectEntries = clampPositiveInt(options?.maxStructuredObjectEntries, 4, 8);
  const reservedKeys = new Set([
    'fieldTemplate',
    'fieldDetails',
    'focusedFieldDetails',
    'aliasFieldDetails',
    'focusedFieldEntries',
    'aliasFields',
    'focusedAliasFields',
    'focusedAliasFieldDetails',
  ]);

  const rows = [
    ...formatFieldTemplate((profile as Record<string, unknown>).fieldTemplate),
    ...formatAliasFieldObject((profile as Record<string, unknown>).focusedAliasFields, 'focusedAliases', maxObjectEntries),
    ...formatAliasFieldObject((profile as Record<string, unknown>).aliasFields, 'aliasValues', maxObjectEntries),
    ...Object.entries(profile).flatMap(([key, value]) => {
      if (reservedKeys.has(key)) return [];
      if (Array.isArray(value)) {
        const compact = value
          .map((entry) => String(entry || '').trim())
          .filter(Boolean)
          .slice(0, maxArrayValues);
        return compact.length ? [`${key}: ${compact.join('; ')}`] : [];
      }
      if (isObject(value)) {
        const compact = Object.entries(value)
          .map(([entryKey, entryValue]) => `${entryKey}:${String(entryValue || '').trim()}`)
          .filter((entry) => !entry.endsWith(':'))
          .slice(0, maxObjectEntries);
        return compact.length ? [`${key}: ${compact.join('; ')}`] : [];
      }
      const text = String(value || '').trim();
      return text ? [`${key}: ${text}`] : [];
    }),
  ];

  return rows.slice(0, maxEntries).join('\n');
}
