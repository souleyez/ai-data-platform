import type { ReportPlanPageSpec } from './report-planner.js';
import type { ReportTemplateEnvelope } from './report-center.js';

type LayoutVariant = ReportPlanPageSpec['layoutVariant'];

type LayoutPolishDeps = {
  buildDefaultTitle: (kind: 'page') => string;
  containsAny: (text: string, keywords: string[]) => boolean;
  looksLikeJsonEchoText: (value: string) => boolean;
  normalizeText: (value: string) => string;
  sanitizeText: (value: unknown) => string;
};

const REPORT_TITLE_SIGNAL_PATTERN = /(报告|分析|静态页|驾驶舱|看板|概览|汇总|总览|表格|表|文档|方案|画像|清单|复盘|应答|总结)/u;
const WEAK_GENERATED_TITLE_PATTERN = /^(一个|某个|默认|示例|样例|测试|泛化)/u;
const TITLE_STOPWORDS = new Set([
  '请',
  '基于',
  '使用',
  '对',
  '将',
  '按',
  '生成',
  '输出',
  '一份',
  '一个',
  '知识库',
  '全部',
  '当前',
  '数据',
  '报告',
  '分析',
  '静态页',
  '表格',
  '文档',
  'page',
  'table',
]);

function ensureSentence(value: unknown, deps: LayoutPolishDeps) {
  const text = deps.sanitizeText(value);
  if (!text) return '';
  return /[。！？.!?]$/.test(text) ? text : `${text}。`;
}

function includesLayoutSignals(text: string, signals: string[], deps: LayoutPolishDeps) {
  const normalized = deps.normalizeText(text);
  return signals.filter((signal) => normalized.includes(deps.normalizeText(signal))).length;
}

function looksLikeWeakSectionBody(value: string, deps: LayoutPolishDeps) {
  const text = deps.sanitizeText(value);
  if (!text) return true;
  if (deps.looksLikeJsonEchoText(text)) return true;
  return /^(内容|待补充|说明|暂无|略|详情|文字内容)$/u.test(text) || text.length <= 6;
}

function looksLikeWeakChartTitle(value: string, deps: LayoutPolishDeps) {
  const title = deps.normalizeText(value);
  if (!title) return true;
  return /^(图表|chart|趋势图|对比图|分布图|数据图|可视化)\s*[-_#]?\s*\d*$/iu.test(title);
}

function extractMeaningfulTitleTokens(value: string, deps: LayoutPolishDeps) {
  return deps.normalizeText(value)
    .split(' ')
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !TITLE_STOPWORDS.has(item));
}

function countTitleTokenOverlap(left: string, right: string, deps: LayoutPolishDeps) {
  const leftTokens = extractMeaningfulTitleTokens(left, deps);
  const rightTokens = new Set(extractMeaningfulTitleTokens(right, deps));
  if (!leftTokens.length || !rightTokens.size) return 0;
  return leftTokens.filter((token) => rightTokens.has(token)).length;
}

function extractSpecificTitleFragments(value: string, deps: LayoutPolishDeps) {
  return deps.sanitizeText(value)
    .split(/(?:分析报告|分析|报告|报表|静态页|驾驶舱|看板|概览|总览|汇总|清单|方案|文档|画像|订单|库存|补货|客流|商场|多渠道|sku|品类|渠道|平台)/iu)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function shouldPreferGeneratedTitle(
  input: {
    generatedTitle: string;
    requestText: string;
    fallbackTitle: string;
  },
  deps: LayoutPolishDeps,
) {
  const generatedTitle = deps.sanitizeText(input.generatedTitle);
  if (!generatedTitle || deps.looksLikeJsonEchoText(generatedTitle)) return false;

  const fallbackTitle = deps.sanitizeText(input.fallbackTitle);
  if (!fallbackTitle) return true;
  if (generatedTitle === fallbackTitle) return true;
  if (WEAK_GENERATED_TITLE_PATTERN.test(generatedTitle)) return false;

  const requestOverlap = countTitleTokenOverlap(generatedTitle, input.requestText, deps);
  const fallbackOverlap = countTitleTokenOverlap(fallbackTitle, input.requestText, deps);
  if (requestOverlap > fallbackOverlap) return true;

  const specificGeneratedFragments = extractSpecificTitleFragments(generatedTitle, deps);
  if (specificGeneratedFragments.some((fragment) => (
    input.requestText.includes(fragment)
    && !fallbackTitle.includes(fragment)
  ))) {
    return true;
  }

  if (requestOverlap > 0 && !REPORT_TITLE_SIGNAL_PATTERN.test(fallbackTitle)) return true;
  return false;
}

export function buildLayoutVariantPageTitle(
  layoutVariant: LayoutVariant | undefined,
  envelope: ReportTemplateEnvelope | null | undefined,
  deps: LayoutPolishDeps,
) {
  const envelopeTitle = deps.sanitizeText(envelope?.title);
  if (envelopeTitle) return envelopeTitle;
  if (layoutVariant === 'operations-cockpit') return '经营总览页';
  if (layoutVariant === 'solution-overview') return '方案介绍页';
  if (layoutVariant === 'research-brief') return '研究综述页';
  if (layoutVariant === 'risk-brief') return '风险简报页';
  if (layoutVariant === 'talent-showcase') return '人才展示页';
  if (layoutVariant === 'insight-brief') return '知识综述页';
  return deps.buildDefaultTitle('page');
}

export function buildLayoutVariantSummary(
  summary: string,
  layoutVariant: LayoutVariant | undefined,
  deps: LayoutPolishDeps,
) {
  const normalizedSummary = deps.sanitizeText(summary);
  if (!normalizedSummary) return normalizedSummary;
  if (layoutVariant === 'operations-cockpit') {
    if (includesLayoutSignals(normalizedSummary, ['经营', '风险', '动作'], deps) >= 2) return ensureSentence(normalizedSummary, deps);
    return `${ensureSentence(normalizedSummary, deps)}本页重点围绕经营信号、风险提醒和下一步动作展开。`;
  }
  if (layoutVariant === 'solution-overview') {
    if (includesLayoutSignals(normalizedSummary, ['方案', '交付', '落地'], deps) >= 2) return ensureSentence(normalizedSummary, deps);
    return `${ensureSentence(normalizedSummary, deps)}本页重点围绕方案能力、交付路径和落地动作展开。`;
  }
  if (layoutVariant === 'research-brief') {
    if (includesLayoutSignals(normalizedSummary, ['发现', '边界', '建议'], deps) >= 2) return ensureSentence(normalizedSummary, deps);
    return `${ensureSentence(normalizedSummary, deps)}本页重点围绕核心发现、适用边界和后续建议展开。`;
  }
  if (layoutVariant === 'risk-brief') {
    if (includesLayoutSignals(normalizedSummary, ['风险', '影响', '应答'], deps) >= 2) return ensureSentence(normalizedSummary, deps);
    return `${ensureSentence(normalizedSummary, deps)}本页重点围绕主要风险、影响范围和应答动作展开。`;
  }
  if (layoutVariant === 'talent-showcase') {
    if (includesLayoutSignals(normalizedSummary, ['优势', '项目', '案例'], deps) >= 2) return ensureSentence(normalizedSummary, deps);
    return `${ensureSentence(normalizedSummary, deps)}本页重点围绕核心优势、项目经历和代表案例展开。`;
  }
  return ensureSentence(normalizedSummary, deps);
}

export function buildLayoutVariantSectionLead(
  layoutVariant: LayoutVariant | undefined,
  title: string,
  deps: LayoutPolishDeps,
) {
  const normalizedTitle = deps.normalizeText(title);
  if (!normalizedTitle) return '';
  if (layoutVariant === 'operations-cockpit') {
    if (deps.containsAny(normalizedTitle, ['经营', '概览', '摘要'])) return '这一段先把当前经营盘面和主要变化交代清楚。';
    if (deps.containsAny(normalizedTitle, ['风险', '提醒', '异常'])) return '这一段重点说明当前最需要优先处理的风险点。';
    if (deps.containsAny(normalizedTitle, ['行动', '建议', '下一步'])) return '这一段给出可直接执行的下一步动作。';
  }
  if (layoutVariant === 'solution-overview') {
    if (deps.containsAny(normalizedTitle, ['方案', '概览', '摘要'])) return '这一段先讲清方案主张和适用范围。';
    if (deps.containsAny(normalizedTitle, ['能力', '模块'])) return '这一段说明方案由哪些能力模块组成，以及各模块解决什么问题。';
    if (deps.containsAny(normalizedTitle, ['交付', '路径', '阶段'])) return '这一段说明方案如何分阶段落地，以及每个阶段的交付重点。';
    if (deps.containsAny(normalizedTitle, ['行动', '建议', '下一步'])) return '这一段说明推进落地的优先顺序和下一步沟通动作。';
  }
  if (layoutVariant === 'research-brief') {
    if (deps.containsAny(normalizedTitle, ['研究', '概览', '摘要'])) return '这一段先讲清研究对象、问题和当前结论范围。';
    if (deps.containsAny(normalizedTitle, ['核心', '发现'])) return '这一段保留最值得被客户记住的研究发现。';
    if (deps.containsAny(normalizedTitle, ['局限', '风险', '边界'])) return '这一段交代结论边界和需要谨慎解读的部分。';
    if (deps.containsAny(normalizedTitle, ['行动', '建议', '下一步'])) return '这一段把研究结论转成可执行建议。';
  }
  if (layoutVariant === 'risk-brief') {
    if (deps.containsAny(normalizedTitle, ['概览', '摘要'])) return '这一段先交代当前项目范围和需要关注的总风险。';
    if (deps.containsAny(normalizedTitle, ['风险', '资格', '异常'])) return '这一段说明当前最主要的风险点和影响范围。';
    if (deps.containsAny(normalizedTitle, ['应答', '行动', '建议'])) return '这一段把风险转成应答动作和材料优先级。';
  }
  if (layoutVariant === 'talent-showcase') {
    if (deps.containsAny(normalizedTitle, ['核心', '优势'])) return '这一段先讲清候选人的核心优势和适配点。';
    if (deps.containsAny(normalizedTitle, ['项目', '经历', '历程'])) return '这一段按经历顺序说明代表性项目和承担角色。';
    if (deps.containsAny(normalizedTitle, ['代表', '案例', '项目'])) return '这一段优先摆出最能支撑可信度的项目案例。';
    if (deps.containsAny(normalizedTitle, ['联系', '建议', '下一步'])) return '这一段给出下一步沟通建议。';
  }
  return '';
}

export function buildLayoutVariantChartTitle(
  layoutVariant: LayoutVariant | undefined,
  title: string,
  index: number,
  deps: LayoutPolishDeps,
) {
  const normalizedTitle = deps.sanitizeText(title);
  if (!looksLikeWeakChartTitle(normalizedTitle, deps)) return normalizedTitle;
  if (layoutVariant === 'operations-cockpit') {
    if (index === 0) return '经营趋势概览';
    if (index === 1) return '风险与动作优先级';
    return '经营图表概览';
  }
  if (layoutVariant === 'solution-overview') {
    if (index === 0) return '能力覆盖一览';
    if (index === 1) return '交付阶段一览';
    return '方案要点图示';
  }
  if (layoutVariant === 'research-brief') {
    if (index === 0) return '关键结果对比';
    return '研究结果图示';
  }
  if (layoutVariant === 'risk-brief') {
    if (index === 0) return '风险主题分布';
    return '风险图示';
  }
  if (layoutVariant === 'talent-showcase') {
    if (index === 0) return '能力结构概览';
    return '案例分布图示';
  }
  return normalizedTitle;
}

export function polishLayoutVariantSectionBody(
  body: string,
  title: string,
  layoutVariant: LayoutVariant | undefined,
  deps: LayoutPolishDeps,
) {
  const normalizedBody = deps.sanitizeText(body);
  const lead = buildLayoutVariantSectionLead(layoutVariant, title, deps);
  if (!lead) return ensureSentence(normalizedBody, deps);
  if (looksLikeWeakSectionBody(normalizedBody, deps)) return lead;
  if (normalizedBody.includes(deps.sanitizeText(lead))) return ensureSentence(normalizedBody, deps);
  if (normalizedBody.length <= 20) return `${ensureSentence(normalizedBody, deps)}${lead}`;
  return ensureSentence(normalizedBody, deps);
}

export function polishLayoutVariantPageCopy<
  TPage extends {
    summary?: string;
    sections?: Array<{ title?: string; body?: string } & Record<string, unknown>>;
    charts?: Array<{ title?: string } & Record<string, unknown>>;
  },
>(
  page: TPage,
  layoutVariant: LayoutVariant | undefined,
  deps: LayoutPolishDeps,
): TPage {
  if (
    layoutVariant !== 'operations-cockpit'
    && layoutVariant !== 'solution-overview'
    && layoutVariant !== 'research-brief'
    && layoutVariant !== 'risk-brief'
    && layoutVariant !== 'talent-showcase'
  ) {
    return page;
  }

  return {
    ...page,
    summary: buildLayoutVariantSummary(String(page.summary || ''), layoutVariant, deps),
    sections: (page.sections || []).map((section) => ({
      ...section,
      body: polishLayoutVariantSectionBody(String(section.body || ''), String(section.title || ''), layoutVariant, deps),
    })),
    charts: (page.charts || []).map((chart, index) => ({
      ...chart,
      title: buildLayoutVariantChartTitle(layoutVariant, String(chart.title || ''), index, deps),
    })),
  };
}

export function resolvePreferredNarrativeTitle(
  input: {
    generatedTitle: string;
    requestText: string;
    fallbackTitle: string;
  },
  deps: LayoutPolishDeps,
) {
  return shouldPreferGeneratedTitle(input, deps)
    ? deps.sanitizeText(input.generatedTitle)
    : deps.sanitizeText(input.fallbackTitle) || deps.buildDefaultTitle('page');
}
