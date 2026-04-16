import type { ParsedDocument, TableRecordInsightSummary, TableSummary } from './document-parser.js';
import {
  type DerivedFieldDeps,
  findTableDateSummary,
  findTableDimensionSummary,
  findTableMetricSummary,
  formatDateRange,
  formatMetricValue,
} from './document-parser-table-derived-fields-support.js';

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
