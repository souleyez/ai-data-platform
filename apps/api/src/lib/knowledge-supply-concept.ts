import { loadParsedDocuments } from './document-store.js';
import type { KnowledgeTemplateTaskHint } from './knowledge-template.js';
import type { KnowledgeLibraryRef } from './knowledge-supply-types.js';
import type { RetrievalResult } from './document-retrieval.js';

function countTopValues(values: string[], limit = 6) {
  const counter = new Map<string, number>();
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    counter.set(normalized, (counter.get(normalized) || 0) + 1);
  }

  return [...counter.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function collectStructuredValues(profile: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!profile || typeof profile !== 'object') return [];
  const results: string[] = [];

  for (const key of keys) {
    const value = profile[key];
    if (Array.isArray(value)) {
      results.push(...value.map((entry) => String(entry || '').trim()).filter(Boolean));
      continue;
    }
    const text = String(value || '').trim();
    if (text) results.push(text);
  }

  return results;
}

function detectConceptDimension(requestText: string, templateTaskHint?: KnowledgeTemplateTaskHint | null) {
  const text = String(requestText || '').toLowerCase();
  if (templateTaskHint === 'resume-comparison') {
    if (/company|employer|organization|公司|雇主/.test(text)) return 'company';
    if (/project|projects|system|项目|系统|平台|it/.test(text)) return 'project';
    if (/skill|skills|技术栈|技能|能力/.test(text)) return 'skill';
    return 'talent';
  }
  if (templateTaskHint === 'bids-static-page' || templateTaskHint === 'bids-table') {
    if (/risk|风险|deadline|合规/.test(text)) return 'risk';
    if (/section|chapter|章节|资格/.test(text)) return 'section';
    return 'response';
  }
  if (templateTaskHint === 'paper-static-page' || templateTaskHint === 'paper-table') {
    if (/method|methods|methodology|trial|design|方法|方法学|研究设计|试验设计/.test(text)) return 'method';
    if (/result|results|finding|findings|metric|outcome|结果|发现|指标/.test(text)) return 'result';
    return 'conclusion';
  }
  if (templateTaskHint === 'order-static-page') {
    if (/platform|tmall|jd|douyin|平台|天猫|京东|抖音/.test(text)) return 'platform';
    if (/category|sku|品类|类目/.test(text)) return 'category';
    return 'stock';
  }
  if (templateTaskHint === 'footfall-static-page') return 'mall-zone';
  if (templateTaskHint === 'technical-summary' || templateTaskHint === 'iot-static-page' || templateTaskHint === 'iot-table') {
    if (/value|roi|benefit|收益|价值/.test(text)) return 'value';
    if (/module|device|gateway|模块|设备|网关|接口/.test(text)) return 'module';
    return 'scenario';
  }
  if (templateTaskHint === 'formula-static-page') return 'ingredient';
  if (templateTaskHint === 'contract-risk') return 'risk';
  return 'generic';
}

function buildConceptSections(dimension: string, templateTaskHint?: KnowledgeTemplateTaskHint | null) {
  if (templateTaskHint === 'resume-comparison') {
    if (dimension === 'company') return ['公司概览', '重点项目分布', '候选人覆盖', '技术关键词', '风险与机会', 'AI综合分析'];
    if (dimension === 'project') return ['项目概览', '公司分布', '候选人参与', '技术关键词', '交付信号', 'AI综合分析'];
    if (dimension === 'skill') return ['技能概览', '候选人覆盖', '公司分布', '相关项目', '技能风险', 'AI综合分析'];
    return ['人才概览', '学历与背景', '公司经历', '项目经历', '核心能力', 'AI综合分析'];
  }
  if (templateTaskHint === 'bids-static-page' || templateTaskHint === 'bids-table') {
    if (dimension === 'risk') return ['风险概览', '资格风险', '材料缺口', '时间风险', '应答建议', 'AI综合分析'];
    if (dimension === 'section') return ['章节概览', '资格条件', '关键节点', '应答重点', '补充材料', 'AI综合分析'];
    return ['项目概况', '资格条件', '关键时间节点', '应答重点', '风险提醒', 'AI综合分析'];
  }
  if (templateTaskHint === 'paper-static-page' || templateTaskHint === 'paper-table') {
    if (dimension === 'method') return ['研究概览', '研究设计', '研究对象', '关键指标', '证据质量', 'AI综合分析'];
    if (dimension === 'result') return ['研究概览', '核心发现', '结果指标', '证据来源', '局限与风险', 'AI综合分析'];
    return ['研究概览', '研究结论', '适用人群', '证据等级', '局限与建议', 'AI综合分析'];
  }
  if (templateTaskHint === 'order-static-page') {
    if (dimension === 'platform') return ['经营摘要', '平台对比', '品类覆盖', '销量趋势', '库存与备货建议', 'AI综合分析'];
    if (dimension === 'category') return ['经营摘要', '品类对比', '平台覆盖', '销量趋势', '库存与备货建议', 'AI综合分析'];
    return ['经营摘要', '核心指标', '库存与预测', '异常波动', '备货建议', 'AI综合分析'];
  }
  if (templateTaskHint === 'footfall-static-page') {
    return ['客流总览', '商场分区贡献', '重点分区对比', '商场动线提示', '行动建议', 'AI综合分析'];
  }
  if (templateTaskHint === 'technical-summary' || templateTaskHint === 'iot-static-page' || templateTaskHint === 'iot-table') {
    if (dimension === 'module') return ['模块概览', '设备与网关', '平台能力', '接口集成', '交付关系', 'AI综合分析'];
    if (dimension === 'value') return ['价值概览', '业务收益', '交付稳定性', '关键能力', '风险提示', 'AI综合分析'];
    return ['方案摘要', '场景概览', '模块能力', '集成与部署', '价值与风险', 'AI综合分析'];
  }
  if (templateTaskHint === 'formula-static-page') {
    return ['方案摘要', '核心成分', '适用人群', '作用机制', '证据依据', 'AI综合分析'];
  }
  if (templateTaskHint === 'contract-risk') {
    return ['合同摘要', '关键条款', '付款与交付', '风险提示', '行动建议', 'AI综合分析'];
  }
  return ['摘要', '核心指标', '重点分析', '行动建议', 'AI综合分析'];
}

function buildConceptGroupingHints(
  documents: Awaited<ReturnType<typeof loadParsedDocuments>>['items'],
  dimension: string,
) {
  const values = documents.flatMap((item) => {
    const profile = (item.structuredProfile || {}) as Record<string, unknown>;
    const tableSummary = profile.tableSummary && typeof profile.tableSummary === 'object'
      ? profile.tableSummary as Record<string, unknown>
      : null;
    const recordInsights = tableSummary?.recordInsights && typeof tableSummary.recordInsights === 'object'
      ? tableSummary.recordInsights as Record<string, unknown>
      : null;
    if (dimension === 'company') return collectStructuredValues(profile, ['companies', 'latestCompany', 'organizationSignals']);
    if (dimension === 'project') return collectStructuredValues(profile, ['itProjectHighlights', 'projectHighlights', 'highlights']);
    if (dimension === 'skill') return collectStructuredValues(profile, ['skills', 'coreSkills', 'technologySignals']);
    if (dimension === 'talent') return collectStructuredValues(profile, ['candidateName', 'targetRole', 'currentRole']);
    if (dimension === 'section' || dimension === 'response') {
      return [...collectStructuredValues(profile, ['sectionSignals', 'qualificationSignals']), ...(item.topicTags || [])];
    }
    if (dimension === 'platform') return collectStructuredValues(profile, ['platforms', 'platformSignals']);
    if (dimension === 'category') return collectStructuredValues(profile, ['categorySignals', 'categories']);
    if (dimension === 'stock') return collectStructuredValues(profile, ['forecastSignals', 'inventorySignals', 'replenishmentSignals']);
    if (dimension === 'mall-zone') {
      const mallZoneBreakdown = Array.isArray(recordInsights?.mallZoneBreakdown)
        ? recordInsights.mallZoneBreakdown as Array<Record<string, unknown>>
        : [];
      const mallZonesFromBreakdown = mallZoneBreakdown.map((entry) => String(entry.mallZone || '').trim()).filter(Boolean);
      return [...mallZonesFromBreakdown, ...collectStructuredValues(profile, ['mallZones', 'topMallZone', 'aggregationLevel'])];
    }
    if (dimension === 'method') return collectStructuredValues(profile, ['methodology', 'subjectType', 'publicationSignals']);
    if (dimension === 'result') return collectStructuredValues(profile, ['resultSignals', 'metricSignals']);
    if (dimension === 'conclusion') return collectStructuredValues(profile, ['resultSignals', 'publicationSignals', 'subjectType']);
    if (dimension === 'scenario') {
      return [...collectStructuredValues(profile, ['targetScenario', 'industrySignals', 'customerSignals', 'deploymentMode']), ...(item.topicTags || [])];
    }
    if (dimension === 'module') return collectStructuredValues(profile, ['moduleSignals', 'interfaceType', 'integrationSignals']);
    if (dimension === 'value') return collectStructuredValues(profile, ['valueSignals', 'metricSignals', 'benefitSignals']);
    if (dimension === 'ingredient') return collectStructuredValues(profile, ['ingredientSignals', 'strainSignals', 'benefitSignals']);
    if (dimension === 'risk') return collectStructuredValues(profile, ['riskSignals', 'contractRiskSignals', 'qualificationSignals']);
    return [...(item.topicTags || []), String(item.schemaType || item.category || '').trim()].filter(Boolean);
  });

  return countTopValues(values);
}

export function buildConceptPageSupplyBlock(input: {
  requestText: string;
  libraries: KnowledgeLibraryRef[];
  retrieval: RetrievalResult;
  timeRange?: string;
  contentFocus?: string;
  templateTaskHint?: KnowledgeTemplateTaskHint | null;
}) {
  const documents = input.retrieval.documents.slice(0, 8);
  if (!documents.length) return '';

  const dimension = detectConceptDimension(input.requestText, input.templateTaskHint);
  const sections = buildConceptSections(dimension, input.templateTaskHint);
  const groupingHints = buildConceptGroupingHints(documents as Awaited<ReturnType<typeof loadParsedDocuments>>['items'], dimension);
  const schemaHints = countTopValues(documents.map((item) => String(item.schemaType || item.category || 'generic')));
  const topicHints = countTopValues(documents.flatMap((item) => Array.isArray(item.topicTags) ? item.topicTags : []));
  const detailedCount = documents.filter((item) => item.parseStage === 'detailed' || item.detailParseStatus === 'succeeded').length;

  const cards = [
    `资料数量=${documents.length}`,
    `进阶解析=${detailedCount}`,
    schemaHints[0]?.label ? `主要类型=${schemaHints[0].label}` : '',
    groupingHints[0]?.label
      ? `核心维度=${groupingHints[0].label}`
      : input.templateTaskHint === 'footfall-static-page'
        ? '核心维度=商场分区'
        : '',
  ].filter(Boolean);

  const charts = [
    schemaHints.length ? `文档类型分布: ${schemaHints.map((item) => `${item.label} ${item.value}`).join(' | ')}` : '',
    groupingHints.length ? `核心维度分布: ${groupingHints.slice(0, 5).map((item) => `${item.label} ${item.value}`).join(' | ')}` : '',
    topicHints.length ? `主题热点: ${topicHints.slice(0, 5).map((item) => `${item.label} ${item.value}`).join(' | ')}` : '',
  ].filter(Boolean);

  return [
    'Concept page supply:',
    `Libraries: ${input.libraries.map((item) => item.label || item.key).join(' | ')}`,
    input.timeRange ? `Time range: ${input.timeRange}` : '',
    input.contentFocus ? `Content focus: ${input.contentFocus}` : '',
    input.templateTaskHint ? `Task hint: ${input.templateTaskHint}` : '',
    `Primary grouping dimension: ${dimension}`,
    `Recommended sections: ${sections.join(' | ')}`,
    cards.length ? `Recommended cards: ${cards.join(' | ')}` : '',
    charts.length ? `Recommended charts: ${charts.join(' || ')}` : '',
    groupingHints.length ? `Grouping hints: ${groupingHints.map((item) => `${item.label} (${item.value})`).join(' | ')}` : '',
    `Recent documents: ${documents.map((item) => item.title || item.name).filter(Boolean).slice(0, 6).join(' | ')}`,
  ]
    .filter(Boolean)
    .join('\n');
}
