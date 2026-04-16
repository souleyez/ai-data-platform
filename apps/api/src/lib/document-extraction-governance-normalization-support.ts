import {
  type DocumentExtractionFieldSet,
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

export function hasOwnProperty(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}
