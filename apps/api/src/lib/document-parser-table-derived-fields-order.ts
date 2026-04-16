import type { DocumentExtractionProfile } from './document-extraction-governance.js';
import type { ParsedDocument, TableSummary } from './document-parser.js';
import {
  type DerivedFieldDeps,
  findTableDateSummary,
  findTableDimensionSummary,
  findTableMetricSummary,
  formatDateRange,
  formatMetricValue,
} from './document-parser-table-derived-fields-support.js';

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
