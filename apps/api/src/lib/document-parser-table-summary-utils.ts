import type {
  TableDateSummary,
  TableDimensionSummary,
  TableInsightSummary,
  TableMetricSummary,
} from './document-parser.js';

export function stripHtmlTags(text: string) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

export function flattenSpreadsheetRows(rows: unknown[][]) {
  return rows
    .map((row) => row.map((cell) => String(cell ?? '').trim()).filter(Boolean).join(' | '))
    .filter(Boolean)
    .join('\n');
}

export function normalizeTableCell(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function trimTrailingEmptyCells(row: string[]) {
  const next = row.slice();
  while (next.length && !next[next.length - 1]) {
    next.pop();
  }
  return next;
}

export function normalizeTableRows(rows: unknown[][]) {
  return rows
    .map((row) => trimTrailingEmptyCells((Array.isArray(row) ? row : []).map(normalizeTableCell)))
    .filter((row) => row.some(Boolean));
}

export function looksLikeHeaderRow(row: string[]) {
  const cells = row.filter(Boolean);
  if (!cells.length) return false;
  const textLikeCount = cells.filter((cell) => /[A-Za-z_\u4e00-\u9fff]/.test(cell)).length;
  const numericLikeCount = cells.filter((cell) => /^[0-9.,%:/-]+$/.test(cell)).length;
  const uniqueCount = new Set(cells.map((cell) => cell.toLowerCase())).size;
  return textLikeCount >= Math.max(1, Math.ceil(cells.length / 2))
    && numericLikeCount < Math.ceil(cells.length / 2)
    && uniqueCount >= Math.max(1, cells.length - 1);
}

export function buildTableColumns(headerRow: string[], columnCount: number) {
  const seen = new Map<string, number>();
  const columns: string[] = [];
  for (let index = 0; index < columnCount; index += 1) {
    const raw = normalizeTableCell(headerRow[index] || '');
    const base = raw || `column_${index + 1}`;
    const duplicateCount = seen.get(base) || 0;
    seen.set(base, duplicateCount + 1);
    columns.push(duplicateCount ? `${base}_${duplicateCount + 1}` : base);
  }
  return columns;
}

export function normalizeTableColumnKey(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function parseTableDateValue(value: string): { normalized: string; granularity: 'month' | 'date' | 'datetime' } | undefined {
  const text = String(value || '').trim();
  if (!text) return undefined;

  let matched = text.match(/^(\d{4})[/-](\d{1,2})$/);
  if (matched) {
    const [, year, month] = matched;
    return {
      normalized: `${year}-${month.padStart(2, '0')}`,
      granularity: 'month',
    };
  }

  matched = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (matched) {
    const [, year, month, day] = matched;
    return {
      normalized: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
      granularity: 'date',
    };
  }

  matched = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (matched) {
    const [, month, day, yearToken] = matched;
    const normalizedYear = yearToken.length === 2 ? `20${yearToken}` : yearToken;
    return {
      normalized: `${normalizedYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
      granularity: 'date',
    };
  }

  matched = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (matched) {
    const [, year, month, day, hour, minute, second = '00'] = matched;
    return {
      normalized: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${hour.padStart(2, '0')}:${minute}:${second}`,
      granularity: 'datetime',
    };
  }

  return undefined;
}

function detectMetricKind(column: string, values: string[]) {
  const key = normalizeTableColumnKey(column);
  if (values.some((value) => /[%％]$/.test(value)) || /(margin|ratio|rate|percent|pct|毛利率|占比|比率|比例)/i.test(key)) {
    return 'percent' as const;
  }
  if (values.some((value) => /[￥¥$]/.test(value)) || /(amount|sales|revenue|gmv|profit|price|金额|销售额|收入|利润|单价)/i.test(key)) {
    return 'currency' as const;
  }
  return 'number' as const;
}

export function parseTableNumericValue(value: string, kind: TableMetricSummary['kind']) {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const cleaned = raw.replace(/[%％￥¥$,，]/g, '').trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return undefined;
  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric)) return undefined;
  if (kind === 'percent' && /[%％]$/.test(raw)) {
    return numeric / 100;
  }
  return numeric;
}

export function buildTableInsights(columns: string[], rows: string[][]): TableInsightSummary | undefined {
  if (!columns.length || !rows.length) return undefined;

  const dateColumns: TableDateSummary[] = [];
  const metricColumns: TableMetricSummary[] = [];
  const dimensionColumns: TableDimensionSummary[] = [];

  columns.forEach((column, index) => {
    const values = rows
      .map((row) => normalizeTableCell(row[index] || ''))
      .filter(Boolean);
    if (!values.length) return;

    const dateValues = values
      .map((value) => parseTableDateValue(value))
      .filter((value): value is { normalized: string; granularity: 'month' | 'date' | 'datetime' } => Boolean(value));
    if (dateValues.length >= Math.max(2, Math.ceil(values.length * 0.6))) {
      const normalizedDates = [...new Set(dateValues.map((entry) => entry.normalized))].sort();
      const granularity = dateValues.every((entry) => entry.granularity === 'month')
        ? 'month'
        : dateValues.some((entry) => entry.granularity === 'datetime')
          ? 'datetime'
          : 'date';
      dateColumns.push({
        column,
        min: normalizedDates[0],
        max: normalizedDates[normalizedDates.length - 1],
        distinctCount: normalizedDates.length,
        granularity,
      });
      return;
    }

    const metricKind = detectMetricKind(column, values);
    const numericValues = values
      .map((value) => parseTableNumericValue(value, metricKind))
      .filter((value): value is number => Number.isFinite(value));
    if (numericValues.length >= Math.max(2, Math.ceil(values.length * 0.7))) {
      const sum = numericValues.reduce((accumulator, value) => accumulator + value, 0);
      metricColumns.push({
        column,
        kind: metricKind,
        nonEmptyCount: numericValues.length,
        min: Number(Math.min(...numericValues).toFixed(4)),
        max: Number(Math.max(...numericValues).toFixed(4)),
        sum: Number(sum.toFixed(4)),
        avg: Number((sum / numericValues.length).toFixed(4)),
      });
      return;
    }

    const counts = new Map<string, number>();
    values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    const distinctCount = counts.size;
    const key = normalizeTableColumnKey(column);
    const isKnownDimension = /(platform|platform_focus|channel|category|类目|品类|warehouse|仓|risk|priority|recommendation|region|mall_zone|mall_area|mall_partition|shopping_zone|business_zone|floor_zone|floor_area|floor_partition|room_unit|shop_unit|shop_no|商场分区|商场区域|楼层分区|楼层区域|楼层|单间|铺位|店铺|区域|分区|片区|位置|点位)/i.test(key);
    if (
      distinctCount >= 2
      && (distinctCount <= Math.min(12, Math.max(4, Math.ceil(values.length * 0.25))) || isKnownDimension)
    ) {
      const topValues = [...counts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'))
        .slice(0, 5)
        .map(([entryValue, count]) => ({ value: entryValue, count }));
      dimensionColumns.push({
        column,
        distinctCount,
        topValues,
      });
    }
  });

  const insights: TableInsightSummary = {};
  if (dateColumns.length) insights.dateColumns = dateColumns;
  if (metricColumns.length) insights.metricColumns = metricColumns;
  if (dimensionColumns.length) insights.dimensionColumns = dimensionColumns;
  return Object.keys(insights).length ? insights : undefined;
}
