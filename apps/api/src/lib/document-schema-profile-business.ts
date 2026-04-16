import { buildFocusedFieldPayload, createFieldDetail } from './document-schema-field-details.js';
import { includesAnyText } from './document-schema-heuristics.js';
import type { StructuredProfileBaseParts } from './document-schema-profile-core.js';
import type { BuildStructuredProfileInput } from './document-schema-profile-types.js';

export function buildTechnicalStructuredProfile(input: BuildStructuredProfileInput, parts: StructuredProfileBaseParts) {
  const { base, enterpriseGuidanceFields } = parts;
  const fieldDetails = {
    ...base.fieldDetails,
    ...(createFieldDetail(enterpriseGuidanceFields?.businessSystem, 0.88, 'rule', input.evidenceChunks) ? { businessSystem: createFieldDetail(enterpriseGuidanceFields?.businessSystem, 0.88, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(enterpriseGuidanceFields?.documentKind, 0.84, 'rule', input.evidenceChunks) ? { documentKind: createFieldDetail(enterpriseGuidanceFields?.documentKind, 0.84, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(enterpriseGuidanceFields?.applicableScope, 0.8, 'rule', input.evidenceChunks) ? { applicableScope: createFieldDetail(enterpriseGuidanceFields?.applicableScope, 0.8, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(enterpriseGuidanceFields?.operationEntry, 0.82, 'rule', input.evidenceChunks) ? { operationEntry: createFieldDetail(enterpriseGuidanceFields?.operationEntry, 0.82, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(enterpriseGuidanceFields?.approvalLevels || [], 0.76, 'derived', input.evidenceChunks) ? { approvalLevels: createFieldDetail(enterpriseGuidanceFields?.approvalLevels || [], 0.76, 'derived', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(enterpriseGuidanceFields?.policyFocus || [], 0.74, 'derived', input.evidenceChunks) ? { policyFocus: createFieldDetail(enterpriseGuidanceFields?.policyFocus || [], 0.74, 'derived', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(enterpriseGuidanceFields?.contacts || [], 0.72, 'rule', input.evidenceChunks) ? { contacts: createFieldDetail(enterpriseGuidanceFields?.contacts || [], 0.72, 'rule', input.evidenceChunks)! } : {}),
  };

  return {
    ...base,
    domain: 'technical',
    focus: input.topicTags.slice(0, 4),
    businessSystem: enterpriseGuidanceFields?.businessSystem || '',
    documentKind: enterpriseGuidanceFields?.documentKind || '',
    applicableScope: enterpriseGuidanceFields?.applicableScope || '',
    operationEntry: enterpriseGuidanceFields?.operationEntry || '',
    approvalLevels: enterpriseGuidanceFields?.approvalLevels || [],
    policyFocus: enterpriseGuidanceFields?.policyFocus || [],
    contacts: enterpriseGuidanceFields?.contacts || [],
    fieldDetails,
    ...buildFocusedFieldPayload(fieldDetails, input.extractionProfile),
  };
}

export function buildOrderStructuredProfile(input: BuildStructuredProfileInput, parts: StructuredProfileBaseParts) {
  const { base, orderFields } = parts;
  const fieldDetails = {
    ...base.fieldDetails,
    ...(createFieldDetail(orderFields?.period, 0.8, 'rule', input.evidenceChunks) ? { period: createFieldDetail(orderFields?.period, 0.8, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(orderFields?.platform, 0.88, 'rule', input.evidenceChunks) ? { platform: createFieldDetail(orderFields?.platform, 0.88, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(orderFields?.orderCount, 0.82, 'rule', input.evidenceChunks) ? { orderCount: createFieldDetail(orderFields?.orderCount, 0.82, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(orderFields?.netSales, 0.82, 'rule', input.evidenceChunks) ? { netSales: createFieldDetail(orderFields?.netSales, 0.82, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(orderFields?.grossMargin, 0.78, 'rule', input.evidenceChunks) ? { grossMargin: createFieldDetail(orderFields?.grossMargin, 0.78, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(orderFields?.topCategory, 0.74, 'rule', input.evidenceChunks) ? { topCategory: createFieldDetail(orderFields?.topCategory, 0.74, 'rule', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(orderFields?.inventoryStatus, 0.68, 'derived', input.evidenceChunks) ? { inventoryStatus: createFieldDetail(orderFields?.inventoryStatus, 0.68, 'derived', input.evidenceChunks)! } : {}),
    ...(createFieldDetail(orderFields?.replenishmentAction, 0.68, 'derived', input.evidenceChunks) ? { replenishmentAction: createFieldDetail(orderFields?.replenishmentAction, 0.68, 'derived', input.evidenceChunks)! } : {}),
  };
  return {
    ...base,
    domain: 'order',
    period: orderFields?.period || '',
    platform: orderFields?.platform || '',
    orderCount: orderFields?.orderCount || '',
    netSales: orderFields?.netSales || '',
    grossMargin: orderFields?.grossMargin || '',
    topCategory: orderFields?.topCategory || '',
    inventoryStatus: orderFields?.inventoryStatus || '',
    replenishmentAction: orderFields?.replenishmentAction || '',
    focus: input.topicTags.slice(0, 4),
    fieldDetails,
    ...buildFocusedFieldPayload(fieldDetails, input.extractionProfile),
  };
}

export function buildReportStructuredProfile(input: BuildStructuredProfileInput, parts: StructuredProfileBaseParts) {
  const { base, evidence, footfallFields } = parts;
  const isFootfallReport = Boolean(
    footfallFields?.totalFootfall
    || footfallFields?.topMallZone
    || footfallFields?.mallZoneCount
    || footfallFields?.aggregationLevel,
  );
  const tableSummaryRecord = input.tableSummary && typeof input.tableSummary === 'object'
    ? input.tableSummary as Record<string, unknown>
    : null;
  const recordInsights = tableSummaryRecord?.recordInsights && typeof tableSummaryRecord.recordInsights === 'object'
    ? tableSummaryRecord.recordInsights as Record<string, unknown>
    : null;
  const rawMallZoneBreakdown = Array.isArray(recordInsights?.mallZoneBreakdown)
    ? recordInsights.mallZoneBreakdown as unknown[]
    : [];
  const mallZoneBreakdown = rawMallZoneBreakdown
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return '';
      return String((entry as Record<string, unknown>).mallZone || '').trim();
    })
    .filter(Boolean);
  const mallZones = [...new Set([
    ...mallZoneBreakdown,
    String(footfallFields?.topMallZone || '').trim(),
  ].filter(Boolean))];

  return {
    ...base,
    domain: 'report',
    focus: input.topicTags.slice(0, 4),
    reportFocus: isFootfallReport ? 'footfall' : 'generic',
    period: footfallFields?.period || '',
    totalFootfall: footfallFields?.totalFootfall || '',
    topMallZone: footfallFields?.topMallZone || '',
    mallZoneCount: footfallFields?.mallZoneCount || '',
    aggregationLevel: footfallFields?.aggregationLevel || '',
    mallZones: isFootfallReport ? mallZones : [],
    platforms: [
      evidence.includes('tmall') ? 'tmall' : '',
      evidence.includes('jd') ? 'jd' : '',
      evidence.includes('douyin') ? 'douyin' : '',
      evidence.includes('pinduoduo') ? 'pinduoduo' : '',
      evidence.includes('amazon') ? 'amazon' : '',
      evidence.includes('shopify') ? 'shopify' : '',
    ].filter(Boolean),
    platformSignals: [
      evidence.includes('tmall') ? 'tmall' : '',
      evidence.includes('jd') ? 'jd' : '',
      evidence.includes('douyin') ? 'douyin' : '',
      evidence.includes('pinduoduo') ? 'pinduoduo' : '',
      evidence.includes('amazon') ? 'amazon' : '',
      evidence.includes('shopify') ? 'shopify' : '',
    ].filter(Boolean),
    categorySignals: input.topicTags.filter((tag) => ['订单分析', '库存管理', '经营复盘', '销量预测', '备货建议'].includes(tag)),
    metricSignals: [
      includesAnyText(evidence, ['yoy', 'year over year', '同比']) ? 'yoy' : '',
      includesAnyText(evidence, ['mom', 'month over month', '环比']) ? 'mom' : '',
      includesAnyText(evidence, ['inventory', 'stock', '库存']) ? 'inventory' : '',
      includesAnyText(evidence, ['sales', 'gmv', 'revenue', '销量', '销售']) ? 'sales' : '',
      includesAnyText(evidence, ['forecast', 'prediction', '预测']) ? 'forecast' : '',
      includesAnyText(evidence, ['anomaly', 'volatility', 'alert', '异常']) ? 'anomaly' : '',
    ].filter(Boolean),
    keyMetrics: [
      includesAnyText(evidence, ['yoy', 'year over year', '同比']) ? 'yoy' : '',
      includesAnyText(evidence, ['mom', 'month over month', '环比']) ? 'mom' : '',
      includesAnyText(evidence, ['inventory index', 'inventory health', '库存指数']) ? 'inventory-index' : '',
      includesAnyText(evidence, ['sell-through', '动销']) ? 'sell-through' : '',
      includesAnyText(evidence, ['gmv', '交易额']) ? 'gmv' : '',
    ].filter(Boolean),
    replenishmentSignals: [
      includesAnyText(evidence, ['replenishment', '备货']) ? 'replenishment' : '',
      includesAnyText(evidence, ['restock', '补货']) ? 'restock' : '',
      includesAnyText(evidence, ['safety stock', '安全库存']) ? 'safety-stock' : '',
    ].filter(Boolean),
    salesCycleSignals: [
      includesAnyText(evidence, ['week', 'weekly', '周']) ? 'weekly' : '',
      includesAnyText(evidence, ['month', 'monthly', '月']) ? 'monthly' : '',
      includesAnyText(evidence, ['quarter', 'quarterly', '季度']) ? 'quarterly' : '',
    ].filter(Boolean),
    forecastSignals: [
      includesAnyText(evidence, ['forecast', '预测']) ? 'forecast' : '',
      includesAnyText(evidence, ['trend', '趋势']) ? 'trend' : '',
      includesAnyText(evidence, ['plan', '规划']) ? 'planning' : '',
    ].filter(Boolean),
    anomalySignals: [
      includesAnyText(evidence, ['anomaly', 'abnormal', '异常']) ? 'anomaly' : '',
      includesAnyText(evidence, ['volatility', 'spike', '波动']) ? 'volatility' : '',
      includesAnyText(evidence, ['alert', 'warning', '预警']) ? 'alert' : '',
    ].filter(Boolean),
    operatingSignals: [
      includesAnyText(evidence, ['operating', 'operation review', '经营']) ? 'operating-review' : '',
      includesAnyText(evidence, ['replenishment', '备货']) ? 'replenishment' : '',
      includesAnyText(evidence, ['forecast', '预测']) ? 'forecast' : '',
      includesAnyText(evidence, ['exception', 'anomaly', '异常']) ? 'exception' : '',
    ].filter(Boolean),
  };
}
