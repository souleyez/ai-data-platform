import type {
  TableRecordFieldRoles,
  TableStructuredRow,
} from './document-parser.js';
import type { TableRecordDeps } from './document-parser-table-record-types.js';

function findTableColumnByAliases(columns: string[], aliases: string[], deps: TableRecordDeps) {
  const aliasSet = new Set(aliases.map(deps.normalizeTableColumnKey));
  return columns.find((column) => aliasSet.has(deps.normalizeTableColumnKey(column)));
}

export function detectRecordKeyField(columns: string[], rows: string[][], deps: TableRecordDeps) {
  const preferredAliases = [
    'order_id',
    'sku',
    'product_id',
    'item_id',
    'inventory_id',
    'contract_no',
    'document_no',
    'id',
  ];

  for (const alias of preferredAliases) {
    const matched = columns.find((column) => deps.normalizeTableColumnKey(column) === alias);
    if (matched) return matched;
  }

  for (const column of columns) {
    const values = rows
      .map((row) => deps.normalizeTableCell(row[columns.indexOf(column)] || ''))
      .filter(Boolean);
    if (!values.length) continue;
    const uniqueCount = new Set(values).size;
    if (uniqueCount >= Math.max(2, Math.ceil(values.length * 0.9))) {
      return column;
    }
  }

  return undefined;
}

export function buildRecordFieldRoles(columns: string[], deps: TableRecordDeps) {
  const roles: TableRecordFieldRoles = {
    periodField: findTableColumnByAliases(columns, ['month', 'date', 'order_date', 'snapshot_date', 'period', '时间', '日期', '统计时间', '报表日期'], deps),
    platformField: findTableColumnByAliases(columns, ['platform', 'platform_focus', 'channel'], deps),
    categoryField: findTableColumnByAliases(columns, ['category', 'category_name', '类目', '品类'], deps),
    skuField: findTableColumnByAliases(columns, ['sku', 'sku_id', 'product_id', 'item_id'], deps),
    mallZoneField: findTableColumnByAliases(columns, [
      'mall_zone',
      'mall_area',
      'mall_partition',
      'shopping_zone',
      'business_zone',
      'mall_region',
      '商场分区',
      '商场区域',
      '商场片区',
      '商业分区',
      '区域',
      '分区',
      '片区',
    ], deps),
    floorZoneField: findTableColumnByAliases(columns, [
      'floor_zone',
      'floor_area',
      'floor_partition',
      'floor_region',
      '楼层分区',
      '楼层区域',
      '楼面分区',
      '楼层',
      '楼面',
      '楼层片区',
    ], deps),
    roomUnitField: findTableColumnByAliases(columns, [
      'room_unit',
      'room_no',
      'unit_no',
      'shop_unit',
      'shop_no',
      'store_unit',
      '单间',
      '铺位',
      '店铺',
      '商户',
      '位置',
      '点位',
      '铺位号',
      '门店',
    ], deps),
    footfallField: findTableColumnByAliases(columns, [
      'visitor_count',
      'visitors',
      'footfall',
      'traffic_count',
      'entry_count',
      'passenger_flow',
      '客流',
      '人流',
      '到访量',
      '进店客流',
      '进入人数',
      '进场人数',
      '入场人数',
      '进店人数',
      '进馆人数',
      '客流人数',
    ], deps),
    orderCountField: findTableColumnByAliases(columns, ['order_count', 'orders', 'units_sold'], deps),
    quantityField: findTableColumnByAliases(columns, ['quantity', 'qty', 'count'], deps),
    netSalesField: findTableColumnByAliases(columns, ['net_amount', 'net_sales', 'revenue', 'gmv'], deps),
    grossAmountField: findTableColumnByAliases(columns, ['gross_amount', 'sales_amount'], deps),
    refundAmountField: findTableColumnByAliases(columns, ['refund_amount', 'refund_total', 'refund'], deps),
    grossProfitField: findTableColumnByAliases(columns, ['gross_profit', 'profit'], deps),
    grossMarginField: findTableColumnByAliases(columns, ['gross_margin', 'margin', 'profit_rate'], deps),
    inventoryBeforeField: findTableColumnByAliases(columns, ['inventory_before', 'stock_before', 'opening_stock'], deps),
    inventoryAfterField: findTableColumnByAliases(columns, ['inventory_after', 'stock_after', 'closing_stock'], deps),
    inventoryRiskField: findTableColumnByAliases(columns, ['inventory_risk', 'risk_flag', 'inventory_status'], deps),
    recommendationField: findTableColumnByAliases(columns, ['recommendation', 'replenishment', 'action'], deps),
    replenishmentPriorityField: findTableColumnByAliases(columns, ['replenishment_priority', 'priority'], deps),
  };

  return Object.fromEntries(
    Object.entries(roles).filter(([, value]) => String(value || '').trim()),
  ) as TableRecordFieldRoles;
}

function deriveRecordBusinessFields(
  rowValues: Record<string, string>,
  roles: TableRecordFieldRoles,
  deps: TableRecordDeps,
) {
  const derivedFields: Record<string, string> = {};
  const readRole = (columnName?: string) => (columnName ? deps.normalizeTableCell(rowValues[columnName] || '') : '');
  const periodValue = readRole(roles.periodField);
  const parsedPeriod = deps.parseTableDateValue(periodValue);
  const platform = readRole(roles.platformField);
  const category = readRole(roles.categoryField);
  const sku = readRole(roles.skuField);
  const mallZone = readRole(roles.mallZoneField);
  const floorZone = readRole(roles.floorZoneField);
  const roomUnit = readRole(roles.roomUnitField);
  const footfall = readRole(roles.footfallField);
  const orderCount = readRole(roles.orderCountField) || readRole(roles.quantityField);
  const netSales = readRole(roles.netSalesField) || readRole(roles.grossAmountField);
  const grossMarginDirect = readRole(roles.grossMarginField);
  const grossProfit = readRole(roles.grossProfitField);
  const inventoryBefore = readRole(roles.inventoryBeforeField);
  const inventoryAfter = readRole(roles.inventoryAfterField);
  const inventoryStatus = readRole(roles.inventoryRiskField);
  const recommendation = readRole(roles.recommendationField);
  const replenishmentPriority = readRole(roles.replenishmentPriorityField);

  if (parsedPeriod?.normalized) derivedFields.period = parsedPeriod.normalized;
  else if (periodValue) derivedFields.period = periodValue;
  if (platform) derivedFields.platform = platform;
  if (category) derivedFields.category = category;
  if (sku) derivedFields.sku = sku;
  if (mallZone) derivedFields.mallZone = mallZone;
  if (floorZone) derivedFields.floorZone = floorZone;
  if (roomUnit) derivedFields.roomUnit = roomUnit;
  if (footfall) derivedFields.footfall = footfall;
  if (orderCount) derivedFields.orderCount = orderCount;
  if (netSales) derivedFields.netSales = netSales;
  if (grossMarginDirect) derivedFields.grossMargin = grossMarginDirect;
  else if (grossProfit && netSales) {
    const grossProfitValue = deps.parseTableNumericValue(grossProfit, 'currency');
    const netSalesValue = deps.parseTableNumericValue(netSales, /%/.test(netSales) ? 'percent' : 'currency');
    if (grossProfitValue && netSalesValue) {
      derivedFields.grossMargin = `${((grossProfitValue / netSalesValue) * 100).toFixed(2)}%`;
    }
  }
  if (inventoryBefore) derivedFields.inventoryBefore = inventoryBefore;
  if (inventoryAfter) derivedFields.inventoryAfter = inventoryAfter;
  if (inventoryStatus) derivedFields.inventoryStatus = inventoryStatus;
  if (recommendation) derivedFields.recommendation = recommendation;
  if (replenishmentPriority) derivedFields.replenishmentPriority = replenishmentPriority;

  return derivedFields;
}

export function mapRecordRows(
  columns: string[],
  rows: string[][],
  recordKeyField: string | undefined,
  recordFieldRoles: TableRecordFieldRoles = {},
  deps: TableRecordDeps,
) {
  const recordKeyIndex = recordKeyField ? columns.findIndex((column) => column === recordKeyField) : -1;
  return rows
    .slice(0, 20)
    .map((row, index) => {
      const values: Record<string, string> = {};
      columns.forEach((column, columnIndex) => {
        values[column] = deps.normalizeTableCell(row[columnIndex] || '');
      });

      const keyValue = recordKeyIndex >= 0 ? deps.normalizeTableCell(row[recordKeyIndex] || '') : '';
      const derivedFields = deriveRecordBusinessFields(values, recordFieldRoles, deps);
      return {
        rowNumber: index + 1,
        ...(keyValue ? { keyValue } : {}),
        values,
        ...(Object.keys(derivedFields).length ? { derivedFields } : {}),
      } satisfies TableStructuredRow;
    })
    .filter((row) => Object.values(row.values).some(Boolean));
}
