import type {
  TableSheetSummary,
} from './document-parser.js';
import {
  buildRecordFieldRoles,
  buildRecordInsights,
  buildWideFootfallSheetSummary,
  detectRecordKeyField,
  mapRecordRows,
} from './document-parser-table-records.js';
import {
  buildTableColumns,
  buildTableInsights,
  looksLikeHeaderRow,
  normalizeTableCell,
  normalizeTableColumnKey,
  normalizeTableRows,
  parseTableDateValue,
  parseTableNumericValue,
} from './document-parser-table-summary-utils.js';

function mapSampleRows(columns: string[], rows: string[][]) {
  return rows.slice(0, 5).map((row) => {
    const record: Record<string, string> = {};
    columns.forEach((column, index) => {
      record[column] = normalizeTableCell(row[index] || '');
    });
    return record;
  });
}

export function buildTableSheetSummary(
  name: string,
  rows: unknown[][],
): TableSheetSummary | undefined {
  const normalizedRows = normalizeTableRows(rows);
  if (!normalizedRows.length) return undefined;

  const headerLike = looksLikeHeaderRow(normalizedRows[0] || []);
  const dataRows = headerLike ? normalizedRows.slice(1) : normalizedRows;
  const columnCount = Math.max(
    ...(headerLike ? [normalizedRows[0]?.length || 0] : dataRows.map((row) => row.length)),
    0,
  );

  if (!columnCount) return undefined;

  const columns = headerLike
    ? buildTableColumns(normalizedRows[0] || [], columnCount)
    : buildTableColumns([], columnCount);
  const insights = buildTableInsights(columns, dataRows);
  const recordDeps = {
    normalizeTableCell,
    normalizeTableColumnKey,
    parseTableDateValue,
    parseTableNumericValue,
  };
  const recordKeyField = detectRecordKeyField(columns, dataRows, recordDeps);
  const wideFootfallSummary = buildWideFootfallSheetSummary(columns, dataRows, recordDeps);
  const recordFieldRoles = {
    ...buildRecordFieldRoles(columns, recordDeps),
    ...(wideFootfallSummary?.recordFieldRoles || {}),
  };
  const recordRows = mapRecordRows(columns, dataRows, recordKeyField, recordFieldRoles, recordDeps);
  const parsedRecordInsights = buildRecordInsights(recordRows, recordDeps);
  const recordInsights = parsedRecordInsights || wideFootfallSummary?.recordInsights
    ? {
        ...(parsedRecordInsights || {}),
        ...(wideFootfallSummary?.recordInsights || {}),
      }
    : undefined;

  return {
    name,
    rowCount: dataRows.length,
    columnCount,
    columns,
    sampleRows: mapSampleRows(columns, dataRows),
    ...(recordKeyField ? { recordKeyField } : {}),
    ...(Object.keys(recordFieldRoles).length ? { recordFieldRoles } : {}),
    ...(recordRows.length ? { recordRows } : {}),
    ...(recordInsights ? { recordInsights } : {}),
    insights,
  };
}

export function scoreTableSheetSummary(sheet: TableSheetSummary) {
  const roles = sheet.recordFieldRoles || {};
  const insights = sheet.recordInsights || {};
  const mallZoneBreakdownCount = (insights.mallZoneBreakdown || []).length;
  let score = 0;

  if (roles.mallZoneField && roles.footfallField) score += 80;
  if (roles.netSalesField || roles.orderCountField || roles.skuField) score += 60;
  if (roles.periodField) score += 15;
  if (mallZoneBreakdownCount) score += 60 + mallZoneBreakdownCount * 25;
  if ((insights.platformBreakdown || []).length || (insights.categoryBreakdown || []).length) score += 40;
  if ((sheet.recordRows || []).length) score += Math.min(20, Math.ceil((sheet.recordRows || []).length / 5));
  if (/(汇总|总表|summary|总览)/i.test(sheet.name)) {
    score += mallZoneBreakdownCount > 1 ? 90 : 15;
  }
  score += Math.min(10, Math.ceil(sheet.rowCount / 20));

  return score;
}
