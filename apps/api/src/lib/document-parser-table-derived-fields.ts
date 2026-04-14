import type { DocumentExtractionProfile } from './document-extraction-governance.js';
import type {
  ParsedDocument,
  TableDateSummary,
  TableDimensionSummary,
  TableMetricSummary,
  TableRecordInsightSummary,
  TableSummary,
} from './document-parser.js';

type DerivedFieldDeps = {
  normalizeTableColumnKey: (value: string) => string;
  shouldForceExtraction: (
    profile: DocumentExtractionProfile | null | undefined,
    fieldSet: DocumentExtractionProfile['fieldSet'],
  ) => boolean;
};

function findTableDateSummary(
  tableSummary: TableSummary | undefined,
  aliases: string[],
  { normalizeTableColumnKey }: DerivedFieldDeps,
) {
  const aliasSet = new Set(aliases.map(normalizeTableColumnKey));
  return (tableSummary?.insights?.dateColumns || []).find((entry) => aliasSet.has(normalizeTableColumnKey(entry.column)));
}

function findTableMetricSummary(
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

function findTableDimensionSummary(
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

function formatMetricValue(value: number, kind: TableMetricSummary['kind']) {
  if (!Number.isFinite(value)) return '';
  if (kind === 'currency') return `￥${value.toFixed(2)}`;
  if (kind === 'percent') {
    const percent = Math.abs(value) <= 1.5 ? value * 100 : value;
    return `${percent.toFixed(2).replace(/\.00$/, '')}%`;
  }
  if (Number.isInteger(value)) return String(Math.round(value));
  return value.toFixed(2).replace(/\.00$/, '');
}

function formatDateRange(dateSummary: TableDateSummary | undefined) {
  if (!dateSummary) return '';
  return dateSummary.min === dateSummary.max
    ? dateSummary.min
    : `${dateSummary.min} 至 ${dateSummary.max}`;
}

function derivePlatformFromTableSummary(tableSummary: TableSummary | undefined, deps: DerivedFieldDeps) {
  const platformSummary = findTableDimensionSummary(tableSummary, ['platform', 'platform_focus', 'channel'], deps);
  if (!platformSummary?.topValues?.length) return '';
  return platformSummary.topValues.slice(0, 3).map((entry) => entry.value).join(' / ');
}

function deriveTopCategoryFromTableSummary(tableSummary: TableSummary | undefined, deps: DerivedFieldDeps) {
  const categorySummary = findTableDimensionSummary(tableSummary, ['category', 'category_name', '类目', '品类'], deps);
  return categorySummary?.topValues?.[0]?.value || '';
}

function deriveInventoryStatusFromTableSummary(tableSummary: TableSummary | undefined, deps: DerivedFieldDeps) {
  const riskSummary = findTableDimensionSummary(tableSummary, ['risk_flag', 'inventory_risk'], deps);
  if (riskSummary?.topValues?.length) {
    return riskSummary.topValues[0].value;
  }

  const inventoryIndex = findTableMetricSummary(tableSummary, ['inventory_index'], deps);
  if (inventoryIndex) {
    if (inventoryIndex.avg >= 1.3) return 'overstock_risk';
    if (inventoryIndex.avg <= 0.8) return 'understock_risk';
    return 'healthy';
  }

  const daysOfCover = findTableMetricSummary(tableSummary, ['days_of_cover'], deps);
  if (daysOfCover) {
    if (daysOfCover.avg >= 90) return 'overstock_risk';
    if (daysOfCover.avg <= 20) return 'understock_risk';
    return 'healthy';
  }

  return '';
}

function deriveReplenishmentActionFromTableSummary(
  tableSummary: TableSummary | undefined,
  inventoryStatus: string,
  deps: DerivedFieldDeps,
) {
  const recommendation = findTableDimensionSummary(tableSummary, ['recommendation', 'replenishment'], deps);
  if (recommendation?.topValues?.length) {
    return recommendation.topValues[0].value;
  }

  const priority = findTableDimensionSummary(tableSummary, ['replenishment_priority'], deps);
  const topPriority = priority?.topValues?.[0]?.value || '';
  if (/^P0|^P1/i.test(topPriority)) return '优先补货';
  if (inventoryStatus === 'overstock_risk') return '放缓补货';
  if (inventoryStatus === 'understock_risk') return '加速补货';
  return '';
}

export function extractOrderFields(
  text: string,
  title: string,
  bizCategory: ParsedDocument['bizCategory'],
  topicTags: string[],
  profile: DocumentExtractionProfile | null | undefined,
  tableSummary: TableSummary | undefined,
  deps: DerivedFieldDeps,
): ParsedDocument['orderFields'] | undefined {
  if (bizCategory !== 'order' && !deps.shouldForceExtraction(profile, 'order')) return undefined;

  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const evidence = `${title} ${normalized} ${(topicTags || []).join(' ')}`.toLowerCase();

  const textPlatform = [
    /(tmall|天猫)/i.test(evidence) ? 'tmall' : '',
    /(jd|京东)/i.test(evidence) ? 'jd' : '',
    /(douyin|抖音)/i.test(evidence) ? 'douyin' : '',
    /(pinduoduo|拼多多)/i.test(evidence) ? 'pinduoduo' : '',
    /(kuaishou|快手)/i.test(evidence) ? 'kuaishou' : '',
    /(wechatmall|小程序)/i.test(evidence) ? 'wechatmall' : '',
  ].find(Boolean) || '';

  const textPeriod = normalized.match(/(?:统计周期|时间范围|周期|日期范围)[:：]?\s*([^。；;\n]{2,60})/i)?.[1]?.trim()
    || normalized.match(/((?:20\d{2}[/-]\d{1,2}(?:[/-]\d{1,2})?(?:\s*至\s*|-\s*)20\d{2}[/-]\d{1,2}(?:[/-]\d{1,2})?)|Q[1-4]\s*20\d{2})/i)?.[1]?.trim()
    || '';
  const textOrderCount = normalized.match(/(?:订单量|订单数|order_count)[:：]?\s*([0-9,.万kK]+)/i)?.[1]?.trim() || '';
  const textNetSales = normalized.match(/(?:净销售额|销售额|gmv|net_sales)[:：]?\s*([￥¥]?[0-9,.万亿%]+)/i)?.[1]?.trim() || '';
  const textGrossMargin = normalized.match(/(?:毛利率|gross_margin)[:：]?\s*([0-9.]+%?)/i)?.[1]?.trim() || '';
  const textTopCategory = normalized.match(/(?:重点品类|top\s*category|品类|类目)[:：]?\s*([^。；;\n]{2,60})/i)?.[1]?.trim() || '';
  const textInventoryStatus = /(库存|days_of_cover|safety_stock)/i.test(evidence) ? 'inventory-related' : '';
  const textReplenishmentAction = /(备货|补货|restock|replenishment)/i.test(evidence) ? 'replenishment-needed' : '';

  const orderCountMetric = findTableMetricSummary(tableSummary, ['order_count'], deps);
  const netSalesMetric = findTableMetricSummary(tableSummary, ['net_amount', 'net_sales', 'revenue', 'gross_amount'], deps);
  const grossMarginMetric = findTableMetricSummary(tableSummary, ['gross_margin'], deps);
  const grossProfitMetric = findTableMetricSummary(tableSummary, ['gross_profit'], deps);
  const period = formatDateRange(findTableDateSummary(tableSummary, ['month', 'date', 'order_date', 'snapshot_date', 'period'], deps)) || textPeriod;
  const platform = derivePlatformFromTableSummary(tableSummary, deps) || textPlatform;
  const orderCount = orderCountMetric
    ? formatMetricValue(orderCountMetric.sum, 'number')
    : ((tableSummary?.rowCount && (tableSummary.columns || []).some((column) => deps.normalizeTableColumnKey(column) === 'order_id'))
      ? String(tableSummary.rowCount)
      : textOrderCount);
  const netSales = netSalesMetric ? formatMetricValue(netSalesMetric.sum, netSalesMetric.kind) : textNetSales;
  const grossMargin = grossMarginMetric
    ? formatMetricValue(grossMarginMetric.avg, 'percent')
    : (grossProfitMetric && netSalesMetric && netSalesMetric.sum
      ? formatMetricValue(grossProfitMetric.sum / netSalesMetric.sum, 'percent')
      : textGrossMargin);
  const topCategory = deriveTopCategoryFromTableSummary(tableSummary, deps) || textTopCategory;
  const inventoryStatus = deriveInventoryStatusFromTableSummary(tableSummary, deps) || textInventoryStatus;
  const replenishmentAction = deriveReplenishmentActionFromTableSummary(tableSummary, inventoryStatus, deps) || textReplenishmentAction;

  const hasAnyValue = Boolean(
    period
    || platform
    || orderCount
    || netSales
    || grossMargin
    || topCategory
    || inventoryStatus
    || replenishmentAction
  );

  return hasAnyValue
    ? {
        period,
        platform,
        orderCount,
        netSales,
        grossMargin,
        topCategory,
        inventoryStatus,
        replenishmentAction,
      }
    : undefined;
}

function deriveTopMallZoneFromTableSummary(tableSummary: TableSummary | undefined, deps: DerivedFieldDeps) {
  const recordInsights = [
    tableSummary?.recordInsights,
    ...((tableSummary?.sheets || []).map((sheet) => sheet.recordInsights)),
  ].find((entry) => Boolean((entry as TableRecordInsightSummary | undefined)?.mallZoneBreakdown?.length)) as TableRecordInsightSummary | undefined;
  if (recordInsights?.mallZoneBreakdown?.length) {
    return recordInsights.mallZoneBreakdown[0]?.mallZone || '';
  }
  const mallZoneSummary = findTableDimensionSummary(tableSummary, [
    'mall_zone',
    'mall_area',
    'mall_partition',
    'shopping_zone',
    'business_zone',
    '商场分区',
    '商场区域',
    '商业分区',
    '区域',
    '分区',
    '片区',
  ], deps);
  return mallZoneSummary?.topValues?.[0]?.value || '';
}

function deriveTotalFootfallFromTableSummary(tableSummary: TableSummary | undefined, deps: DerivedFieldDeps) {
  const recordInsights = [
    tableSummary?.recordInsights,
    ...((tableSummary?.sheets || []).map((sheet) => sheet.recordInsights)),
  ].find((entry) => typeof (entry as TableRecordInsightSummary | undefined)?.totalFootfall === 'number') as TableRecordInsightSummary | undefined;
  if (typeof recordInsights?.totalFootfall === 'number' && recordInsights.totalFootfall > 0) {
    return formatMetricValue(recordInsights.totalFootfall, 'number');
  }
  const metric = findTableMetricSummary(tableSummary, [
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
  ], deps);
  return metric ? formatMetricValue(metric.sum, 'number') : '';
}

function deriveMallZoneCountFromTableSummary(tableSummary: TableSummary | undefined, deps: DerivedFieldDeps) {
  const recordInsights = [
    tableSummary?.recordInsights,
    ...((tableSummary?.sheets || []).map((sheet) => sheet.recordInsights)),
  ].find((entry) => Boolean((entry as TableRecordInsightSummary | undefined)?.mallZoneBreakdown?.length)) as TableRecordInsightSummary | undefined;
  if (recordInsights?.mallZoneBreakdown?.length) {
    return String(recordInsights.mallZoneBreakdown.length);
  }
  const dimension = findTableDimensionSummary(tableSummary, [
    'mall_zone',
    'mall_area',
    'mall_partition',
    'shopping_zone',
    'business_zone',
    '商场分区',
    '商场区域',
    '商业分区',
    '区域',
    '分区',
    '片区',
  ], deps);
  return dimension?.distinctCount ? String(dimension.distinctCount) : '';
}

export function extractFootfallFields(
  text: string,
  title: string,
  bizCategory: ParsedDocument['bizCategory'],
  topicTags: string[],
  tableSummary: TableSummary | undefined,
  deps: DerivedFieldDeps,
): ParsedDocument['footfallFields'] | undefined {
  if (bizCategory !== 'footfall') return undefined;

  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const evidence = `${title} ${normalized} ${(topicTags || []).join(' ')}`.toLowerCase();
  const textPeriod = normalized.match(/(?:统计周期|时间范围|周期|日期范围)[:：]?\s*([^。；;\n]{2,60})/i)?.[1]?.trim()
    || normalized.match(/((?:20\d{2}[/-]\d{1,2}(?:[/-]\d{1,2})?(?:\s*至\s*|-\s*)20\d{2}[/-]\d{1,2}(?:[/-]\d{1,2})?)|Q[1-4]\s*20\d{2})/i)?.[1]?.trim()
    || '';
  const textTopMallZone = normalized.match(/(?:商场分区|重点分区|top\s*mall\s*zone)[:：]?\s*([^。；;\n]{2,60})/i)?.[1]?.trim() || '';
  const period = formatDateRange(findTableDateSummary(tableSummary, ['month', 'date', 'snapshot_date', 'period', '时间', '日期', '统计时间', '报表日期'], deps)) || textPeriod;
  const totalFootfall = deriveTotalFootfallFromTableSummary(tableSummary, deps)
    || normalized.match(/(?:总客流|累计客流|总到访量)[:：]?\s*([0-9,.万kK]+)/i)?.[1]?.trim()
    || '';
  const topMallZone = deriveTopMallZoneFromTableSummary(tableSummary, deps) || textTopMallZone;
  const mallZoneCount = deriveMallZoneCountFromTableSummary(tableSummary, deps);
  const aggregationLevel = [
    tableSummary?.recordInsights,
    ...((tableSummary?.sheets || []).map((sheet) => sheet.recordInsights)),
  ].some((entry) => Boolean((entry as TableRecordInsightSummary | undefined)?.mallZoneBreakdown?.length))
    ? 'mall-zone'
    : 'report';

  const hasAnyValue = Boolean(period || totalFootfall || topMallZone || mallZoneCount || aggregationLevel);
  return hasAnyValue
    ? {
        period,
        totalFootfall,
        topMallZone,
        mallZoneCount,
        aggregationLevel,
      }
    : undefined;
}
