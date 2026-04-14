import type { TableMetricSummary } from './document-parser.js';

export type TableRecordDeps = {
  normalizeTableCell: (value: unknown) => string;
  normalizeTableColumnKey: (value: string) => string;
  parseTableDateValue: (value: string) => { normalized: string; granularity: 'month' | 'date' | 'datetime' } | undefined;
  parseTableNumericValue: (value: string, kind: TableMetricSummary['kind']) => number | undefined;
};
