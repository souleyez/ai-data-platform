import type {
  TableMallZoneBreakdown,
  TableRecordAlert,
  TableRecordFieldRoles,
  TableRecordInsightSummary,
  TableStructuredRow,
} from './document-parser.js';
import type { TableRecordDeps } from './document-parser-table-record-types.js';

function buildTopValueList(values: string[]) {
  const counts = new Map<string, number>();
  values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'))
    .slice(0, 3)
    .map(([value]) => value);
}

function buildTopValueCounts(values: string[]) {
  const counts = new Map<string, number>();
  values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'))
    .slice(0, 3)
    .map(([value]) => value);
}

function roundMetricValue(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

function parsePercentText(value: string, deps: TableRecordDeps) {
  const text = String(value || '').trim();
  if (!text) return undefined;
  const numeric = deps.parseTableNumericValue(text, 'percent');
  return typeof numeric === 'number' ? numeric : undefined;
}

function parseCurrencyText(value: string, deps: TableRecordDeps) {
  const text = String(value || '').trim();
  if (!text) return undefined;
  const numeric = deps.parseTableNumericValue(text, 'currency');
  return typeof numeric === 'number' ? numeric : undefined;
}

export function buildRecordInsights(recordRows: TableStructuredRow[], deps: TableRecordDeps) {
  if (!recordRows.length) return undefined;

  const alerts: TableRecordAlert[] = [];
  let lowMarginRowCount = 0;
  let highRefundRowCount = 0;
  let inventoryRiskRowCount = 0;
  let totalFootfall = 0;
  const riskSkuCandidates: string[] = [];
  const replenishmentCandidates: string[] = [];
  const refundHotspotCandidates: string[] = [];
  const platformSummary = new Map<string, { platform: string; rowCount: number; netSales: number; inventoryRiskRowCount: number }>();
  const categorySummary = new Map<string, { category: string; rowCount: number; netSales: number; inventoryRiskRowCount: number }>();
  const mallZoneSummary = new Map<string, {
    mallZone: string;
    rowCount: number;
    footfall: number;
    floorZones: Set<string>;
    roomUnits: Set<string>;
  }>();
  const skuNetSalesSummary = new Map<string, { sku: string; platform?: string; rowCount: number; netSales: number; inventoryStatus?: string }>();
  const inventoryRiskSummary = new Map<string, number>();

  for (const row of recordRows) {
    const derived = row.derivedFields || {};
    const grossMargin = parsePercentText(String(derived.grossMargin || ''), deps);
    const netSales = parseCurrencyText(String(derived.netSales || ''), deps);
    const grossAmount = parseCurrencyText(String(row.values?.gross_amount || ''), deps);
    const refundAmount = parseCurrencyText(String(row.values?.refund_amount || ''), deps);
    const inventoryStatus = String(derived.inventoryStatus || '').trim();
    const sku = String(derived.sku || row.keyValue || '').trim();
    const mallZone = String(derived.mallZone || '').trim();
    const floorZone = String(derived.floorZone || '').trim();
    const roomUnit = String(derived.roomUnit || '').trim();
    const footfall = deps.parseTableNumericValue(String(derived.footfall || ''), 'number');
    const platform = String(derived.platform || '').trim();
    const category = String(derived.category || '').trim();
    const recommendation = String(derived.recommendation || '').trim();
    const replenishmentPriority = String(derived.replenishmentPriority || '').trim();
    const hasInventoryRisk = Boolean(inventoryStatus && !/^healthy$/i.test(inventoryStatus));

    if (platform) {
      const current = platformSummary.get(platform) || { platform, rowCount: 0, netSales: 0, inventoryRiskRowCount: 0 };
      current.rowCount += 1;
      current.netSales += typeof netSales === 'number' ? netSales : 0;
      current.inventoryRiskRowCount += hasInventoryRisk ? 1 : 0;
      platformSummary.set(platform, current);
    }

    if (category) {
      const current = categorySummary.get(category) || { category, rowCount: 0, netSales: 0, inventoryRiskRowCount: 0 };
      current.rowCount += 1;
      current.netSales += typeof netSales === 'number' ? netSales : 0;
      current.inventoryRiskRowCount += hasInventoryRisk ? 1 : 0;
      categorySummary.set(category, current);
    }

    if (mallZone) {
      const current = mallZoneSummary.get(mallZone) || {
        mallZone,
        rowCount: 0,
        footfall: 0,
        floorZones: new Set<string>(),
        roomUnits: new Set<string>(),
      };
      current.rowCount += 1;
      current.footfall += typeof footfall === 'number' ? footfall : 0;
      if (floorZone) current.floorZones.add(floorZone);
      if (roomUnit) current.roomUnits.add(roomUnit);
      mallZoneSummary.set(mallZone, current);
      totalFootfall += typeof footfall === 'number' ? footfall : 0;
    }

    if (sku) {
      const skuKey = [sku, platform].filter(Boolean).join('||');
      const current = skuNetSalesSummary.get(skuKey) || {
        sku,
        ...(platform ? { platform } : {}),
        rowCount: 0,
        netSales: 0,
        ...(inventoryStatus ? { inventoryStatus } : {}),
      };
      current.rowCount += 1;
      current.netSales += typeof netSales === 'number' ? netSales : 0;
      if (inventoryStatus) current.inventoryStatus = inventoryStatus;
      skuNetSalesSummary.set(skuKey, current);
    }

    if (typeof grossMargin === 'number' && grossMargin <= 0.2) {
      lowMarginRowCount += 1;
      alerts.push({
        type: 'low_margin',
        rowNumber: row.rowNumber,
        ...(row.keyValue ? { keyValue: row.keyValue } : {}),
        severity: grossMargin <= 0.12 ? 'high' : 'medium',
        message: `毛利率偏低：${(grossMargin * 100).toFixed(2)}%`,
      });
    }

    if (
      typeof refundAmount === 'number'
      && (
        (typeof grossAmount === 'number' && grossAmount > 0 && refundAmount / grossAmount >= 0.2)
        || (typeof netSales === 'number' && netSales > 0 && refundAmount / netSales >= 0.25)
      )
    ) {
      highRefundRowCount += 1;
      if (platform || category) {
        refundHotspotCandidates.push([platform, category].filter(Boolean).join(' / '));
      }
      alerts.push({
        type: 'high_refund',
        rowNumber: row.rowNumber,
        ...(row.keyValue ? { keyValue: row.keyValue } : {}),
        severity: 'high',
        message: `退款金额偏高：${refundAmount.toFixed(2)}`,
      });
    }

    if (inventoryStatus) {
      inventoryRiskSummary.set(inventoryStatus, (inventoryRiskSummary.get(inventoryStatus) || 0) + 1);
    }

    if (hasInventoryRisk) {
      inventoryRiskRowCount += 1;
      if (sku) riskSkuCandidates.push(sku);
      alerts.push({
        type: 'inventory_risk',
        rowNumber: row.rowNumber,
        ...(row.keyValue ? { keyValue: row.keyValue } : {}),
        severity: /^understock|^overstock/i.test(inventoryStatus) ? 'high' : 'medium',
        message: `库存状态：${inventoryStatus}`,
      });
    }

    const shouldPrioritizeReplenishment = /^understock/i.test(inventoryStatus)
      || /^P0|^P1/i.test(replenishmentPriority)
      || /补货|replenish|restock/i.test(recommendation);
    if (shouldPrioritizeReplenishment && sku) {
      replenishmentCandidates.push(sku);
    }
  }

  const topPlatforms = buildTopValueList(recordRows.map((row) => String(row.derivedFields?.platform || '')));
  const topCategories = buildTopValueList(recordRows.map((row) => String(row.derivedFields?.category || '')));

  const summary: TableRecordInsightSummary = {};
  if (topPlatforms.length) summary.topPlatforms = topPlatforms;
  if (topCategories.length) summary.topCategories = topCategories;
  const mallZoneBreakdown = [...mallZoneSummary.values()]
    .sort((left, right) => right.footfall - left.footfall || right.rowCount - left.rowCount || left.mallZone.localeCompare(right.mallZone, 'zh-CN'))
    .slice(0, 6)
    .map((entry) => ({
      mallZone: entry.mallZone,
      rowCount: entry.rowCount,
      footfall: roundMetricValue(entry.footfall),
      floorZoneCount: entry.floorZones.size,
      roomUnitCount: entry.roomUnits.size,
    }));
  if (mallZoneBreakdown.length) {
    summary.mallZoneBreakdown = mallZoneBreakdown;
    summary.topMallZones = mallZoneBreakdown.slice(0, 3).map((entry) => entry.mallZone);
  }
  if (totalFootfall > 0) summary.totalFootfall = roundMetricValue(totalFootfall);
  if (lowMarginRowCount) summary.lowMarginRowCount = lowMarginRowCount;
  if (highRefundRowCount) summary.highRefundRowCount = highRefundRowCount;
  if (inventoryRiskRowCount) summary.inventoryRiskRowCount = inventoryRiskRowCount;
  const topRiskSkus = buildTopValueCounts(riskSkuCandidates);
  const priorityReplenishmentItems = buildTopValueCounts(replenishmentCandidates);
  const refundHotspots = buildTopValueCounts(refundHotspotCandidates);
  if (topRiskSkus.length) summary.topRiskSkus = topRiskSkus;
  if (priorityReplenishmentItems.length) summary.priorityReplenishmentItems = priorityReplenishmentItems;
  if (refundHotspots.length) summary.refundHotspots = refundHotspots;
  const platformBreakdown = [...platformSummary.values()]
    .sort((left, right) => right.netSales - left.netSales || right.rowCount - left.rowCount || left.platform.localeCompare(right.platform, 'zh-CN'))
    .slice(0, 5)
    .map((entry) => ({
      platform: entry.platform,
      rowCount: entry.rowCount,
      netSales: roundMetricValue(entry.netSales),
      inventoryRiskRowCount: entry.inventoryRiskRowCount,
    }));
  const categoryBreakdown = [...categorySummary.values()]
    .sort((left, right) => right.netSales - left.netSales || right.rowCount - left.rowCount || left.category.localeCompare(right.category, 'zh-CN'))
    .slice(0, 5)
    .map((entry) => ({
      category: entry.category,
      rowCount: entry.rowCount,
      netSales: roundMetricValue(entry.netSales),
      inventoryRiskRowCount: entry.inventoryRiskRowCount,
    }));
  const topSkuNetSales = [...skuNetSalesSummary.values()]
    .sort((left, right) => right.netSales - left.netSales || right.rowCount - left.rowCount || left.sku.localeCompare(right.sku, 'zh-CN'))
    .slice(0, 5)
    .map((entry) => ({
      sku: entry.sku,
      ...(entry.platform ? { platform: entry.platform } : {}),
      rowCount: entry.rowCount,
      netSales: roundMetricValue(entry.netSales),
      ...(entry.inventoryStatus ? { inventoryStatus: entry.inventoryStatus } : {}),
    }));
  const inventoryRiskBreakdown = [...inventoryRiskSummary.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'))
    .slice(0, 5)
    .map(([inventoryStatus, count]) => ({ inventoryStatus, count }));
  if (platformBreakdown.length) summary.platformBreakdown = platformBreakdown;
  if (categoryBreakdown.length) summary.categoryBreakdown = categoryBreakdown;
  if (topSkuNetSales.length) summary.topSkuNetSales = topSkuNetSales;
  if (inventoryRiskBreakdown.length) summary.inventoryRiskBreakdown = inventoryRiskBreakdown;
  if (alerts.length) summary.alerts = alerts.slice(0, 8);
  return Object.keys(summary).length ? summary : undefined;
}

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
