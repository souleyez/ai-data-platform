import type {
  TableMallZoneBreakdown,
  TableRecordFieldRoles,
  TableRecordInsightSummary,
} from './document-parser.js';
import type { TableRecordDeps } from './document-parser-table-record-types.js';
import { roundMetricValue } from './document-parser-table-record-insight-support.js';

function looksLikeWideFootfallZoneColumn(column: string, deps: TableRecordDeps) {
  const normalized = deps.normalizeTableColumnKey(column);
  if (!normalized) return false;
  if (/^(date|month|time|period|时间|日期|统计时间|报表日期|合计|总计|total|sum)$/i.test(normalized)) return false;
  if (/(mall|zone|area|region|partition|商场|区域|分区|片区|停车|楼外|楼层|楼面|电玩|中庭|广场)/i.test(normalized)) return true;
  return /^[\u4e00-\u9fff]{1,6}$/.test(column.trim());
}

function isWideFootfallTotalColumn(column: string, deps: TableRecordDeps) {
  const normalized = deps.normalizeTableColumnKey(column);
  return /^(total|sum|合计|总计|总客流|总人流)$/i.test(normalized);
}

export function buildWideFootfallSheetSummary(columns: string[], rows: string[][], deps: TableRecordDeps) {
  if (columns.length < 3 || !rows.length) return undefined;

  const firstColumn = columns[0];
  const firstColumnValues = rows
    .map((row) => deps.normalizeTableCell(row[0] || ''))
    .filter(Boolean);
  const dateLikeCount = firstColumnValues
    .map((value) => deps.parseTableDateValue(value))
    .filter(Boolean).length;
  if (dateLikeCount < Math.max(1, Math.ceil(firstColumnValues.length * 0.6))) return undefined;

  const numericColumns = columns.slice(1).filter((column, offset) => {
    const values = rows
      .map((row) => deps.normalizeTableCell(row[offset + 1] || ''))
      .filter(Boolean);
    if (!values.length) return false;
    const numericValues = values
      .map((value) => deps.parseTableNumericValue(value, 'number'))
      .filter((value): value is number => Number.isFinite(value));
    return numericValues.length >= Math.max(1, Math.ceil(values.length * 0.7));
  });
  const totalColumn = numericColumns.find((column) => isWideFootfallTotalColumn(column, deps));
  const mallZoneColumns = numericColumns.filter((column) => !isWideFootfallTotalColumn(column, deps) && looksLikeWideFootfallZoneColumn(column, deps));
  if (!totalColumn && mallZoneColumns.length < 2) return undefined;

  const mallZoneBreakdown = mallZoneColumns
    .map((column) => {
      const columnIndex = columns.indexOf(column);
      const footfall = rows.reduce((sum, row) => {
        const numeric = deps.parseTableNumericValue(deps.normalizeTableCell(row[columnIndex] || ''), 'number');
        return sum + (typeof numeric === 'number' ? numeric : 0);
      }, 0);
      return {
        mallZone: column,
        rowCount: rows.length,
        footfall: roundMetricValue(footfall),
        floorZoneCount: 0,
        roomUnitCount: 0,
      } satisfies TableMallZoneBreakdown;
    })
    .filter((entry) => entry.footfall > 0)
    .sort((left, right) => right.footfall - left.footfall || left.mallZone.localeCompare(right.mallZone, 'zh-CN'))
    .slice(0, 8);
  if (!mallZoneBreakdown.length) return undefined;

  const totalFootfall = totalColumn
    ? roundMetricValue(rows.reduce((sum, row) => {
      const numeric = deps.parseTableNumericValue(deps.normalizeTableCell(row[columns.indexOf(totalColumn)] || ''), 'number');
      return sum + (typeof numeric === 'number' ? numeric : 0);
    }, 0))
    : roundMetricValue(mallZoneBreakdown.reduce((sum, entry) => sum + entry.footfall, 0));

  return {
    recordFieldRoles: {
      periodField: firstColumn,
      ...(totalColumn ? { footfallField: totalColumn } : {}),
    } satisfies TableRecordFieldRoles,
    recordInsights: {
      totalFootfall,
      topMallZones: mallZoneBreakdown.slice(0, 3).map((entry) => entry.mallZone),
      mallZoneBreakdown,
    } satisfies TableRecordInsightSummary,
  };
}
