import type { DocumentExtractionProfile } from './document-extraction-governance.js';
import type {
  TableDateSummary,
  TableDimensionSummary,
  TableMetricSummary,
  TableSummary,
} from './document-parser.js';

export type DerivedFieldDeps = {
  normalizeTableColumnKey: (value: string) => string;
  shouldForceExtraction: (
    profile: DocumentExtractionProfile | null | undefined,
    fieldSet: DocumentExtractionProfile['fieldSet'],
  ) => boolean;
};

export function findTableDateSummary(
  tableSummary: TableSummary | undefined,
  aliases: string[],
  { normalizeTableColumnKey }: DerivedFieldDeps,
) {
  const aliasSet = new Set(aliases.map(normalizeTableColumnKey));
  return (tableSummary?.insights?.dateColumns || []).find((entry) => aliasSet.has(normalizeTableColumnKey(entry.column)));
}

export function findTableMetricSummary(
  tableSummary: TableSummary | undefined,
  aliases: string[],
  { normalizeTableColumnKey }: DerivedFieldDeps,
) {
  const metrics = tableSummary?.insights?.metricColumns || [];
  for (const alias of aliases) {
    const normalizedAlias = normalizeTableColumnKey(alias);
    const matched = metrics.find((entry) => normalizeTableColumnKey(entry.column) === normalizedAlias);
    if (matched) return matched;
  }
  return undefined;
}

export function findTableDimensionSummary(
  tableSummary: TableSummary | undefined,
  aliases: string[],
  { normalizeTableColumnKey }: DerivedFieldDeps,
) {
  const dimensions = tableSummary?.insights?.dimensionColumns || [];
  for (const alias of aliases) {
    const normalizedAlias = normalizeTableColumnKey(alias);
    const matched = dimensions.find((entry) => normalizeTableColumnKey(entry.column) === normalizedAlias);
    if (matched) return matched;
  }
  return undefined;
}

export function formatMetricValue(value: number, kind: TableMetricSummary['kind']) {
  if (!Number.isFinite(value)) return '';
  if (kind === 'currency') return `￥${value.toFixed(2)}`;
  if (kind === 'percent') {
    const percent = Math.abs(value) <= 1.5 ? value * 100 : value;
    return `${percent.toFixed(2).replace(/\.00$/, '')}%`;
  }
  if (Number.isInteger(value)) return String(Math.round(value));
  return value.toFixed(2).replace(/\.00$/, '');
}

export function formatDateRange(dateSummary: TableDateSummary | undefined) {
  if (!dateSummary) return '';
  return dateSummary.min === dateSummary.max
    ? dateSummary.min
    : `${dateSummary.min} 至 ${dateSummary.max}`;
}
