import type { TableSheetSummary, TableSummary } from './document-parser.js';
import {
  buildTableSheetSummary,
  scoreTableSheetSummary,
} from './document-parser-table-sheet-summary.js';
export {
  flattenSpreadsheetRows,
  normalizeTableColumnKey,
  stripHtmlTags,
} from './document-parser-table-summary-utils.js';

export function buildWorkbookTableSummary(
  format: 'csv' | 'xlsx',
  sheets: Array<{ name: string; rows: unknown[][] }>,
): TableSummary | undefined {
  const sheetSummaries = sheets
    .map((sheet) => buildTableSheetSummary(sheet.name, sheet.rows))
    .filter((sheet): sheet is TableSheetSummary => Boolean(sheet));

  if (!sheetSummaries.length) return undefined;

  const [primarySheet] = [...sheetSummaries]
    .sort((left, right) => scoreTableSheetSummary(right) - scoreTableSheetSummary(left) || right.rowCount - left.rowCount || left.name.localeCompare(right.name, 'zh-CN'));
  return {
    format,
    rowCount: sheetSummaries.reduce((sum, sheet) => sum + sheet.rowCount, 0),
    columnCount: primarySheet.columnCount,
    columns: primarySheet.columns,
    sampleRows: primarySheet.sampleRows,
    sheetCount: sheetSummaries.length,
    primarySheetName: primarySheet.name,
    recordKeyField: primarySheet.recordKeyField,
    recordFieldRoles: primarySheet.recordFieldRoles,
    recordRows: primarySheet.recordRows,
    recordInsights: primarySheet.recordInsights,
    sheets: format === 'xlsx' && sheetSummaries.length > 1 ? sheetSummaries : undefined,
    insights: primarySheet.insights,
  };
}
