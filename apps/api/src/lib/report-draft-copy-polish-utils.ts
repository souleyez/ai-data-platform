import type { ReportDraftModuleType } from './report-center.js';
import type { DraftPolishContext } from './report-draft-copy-polish-types.js';

export function normalizeText(value: unknown) {
  return String(value || '').trim();
}

export function ensureSentence(value: unknown) {
  const text = normalizeText(value);
  if (!text) return '';
  return /[。！？.!?]$/.test(text) ? text : `${text}。`;
}

export function buildShortList(items: string[], limit = 2) {
  return items
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, limit);
}

export function summarizeBulletsForCopy(bullets: string[], limit = 2) {
  const values = buildShortList(bullets, limit);
  return values.length ? values.join('、') : '';
}

export function summarizeChartItemsForCopy(
  items: Array<{ label?: string; value?: number }> | null | undefined,
  limit = 3,
) {
  return summarizeBulletsForCopy(
    (Array.isArray(items) ? items : [])
      .map((item) => normalizeText(item?.label))
      .filter(Boolean),
    limit,
  );
}

export function splitBulletLabel(bullet: string) {
  const normalized = normalizeText(bullet);
  if (!normalized) return '';
  const [label = normalized] = normalized.split(/[：:|]/).map((item) => item.trim()).filter(Boolean);
  return label || normalized;
}

export function buildScenarioLead(
  layoutVariant: DraftPolishContext['layoutVariant'],
  moduleType: ReportDraftModuleType,
  title: string,
) {
  if (moduleType === 'cta') {
    if (layoutVariant === 'risk-brief') return '建议优先处理以下动作';
    if (layoutVariant === 'research-brief') return '建议先按以下方向收口研究结论';
    if (layoutVariant === 'solution-overview') return '建议优先推进以下动作';
    if (layoutVariant === 'talent-showcase') return '建议按以下方式推进沟通';
    return '建议优先执行以下动作';
  }
  if (moduleType === 'timeline') {
    if (layoutVariant === 'talent-showcase') return '可按以下经历顺序展开';
    if (layoutVariant === 'solution-overview') return '建议按以下交付阶段推进';
    return '建议按以下阶段推进';
  }
  if (moduleType === 'comparison') {
    if (layoutVariant === 'solution-overview') return '可按以下能力模块展开';
    if (layoutVariant === 'talent-showcase') return '可优先展示以下代表案例';
    return `${normalizeText(title) || '当前内容'}可优先从以下维度展开`;
  }
  if (moduleType === 'chart') {
    if (layoutVariant === 'operations-cockpit') return '图表建议优先展示以下经营维度';
    if (layoutVariant === 'solution-overview') return '图表建议优先展示以下能力覆盖';
    if (layoutVariant === 'research-brief') return '图表建议优先展示以下关键结果';
    return '图表建议优先展示以下维度';
  }
  if (moduleType === 'insight-list') {
    if (/风险|异常|波动|问题/.test(normalizeText(title))) return '当前需要优先关注的问题集中在';
    if (layoutVariant === 'research-brief') return '当前最值得保留的研究发现集中在';
    return '当前最值得保留的关键信号集中在';
  }
  return '';
}

export function buildScenarioTail(
  layoutVariant: DraftPolishContext['layoutVariant'],
  moduleType: ReportDraftModuleType,
) {
  if (moduleType === 'hero') {
    if (layoutVariant === 'operations-cockpit') return '页面开场先把整体经营盘面交代清楚，再落到风险和动作。';
    if (layoutVariant === 'solution-overview') return '页面开场先讲清方案主张，再展开能力模块和交付路径。';
    if (layoutVariant === 'research-brief') return '页面开场先交代研究结论，再说明边界和建议。';
    if (layoutVariant === 'risk-brief') return '页面开场先指出核心风险，再落到应答动作。';
    if (layoutVariant === 'talent-showcase') return '页面开场先讲核心优势，再落到经历和案例。';
  }
  if (moduleType === 'cta') {
    if (layoutVariant === 'operations-cockpit') return '动作建议要尽量写成可以立即执行的经营动作。';
    if (layoutVariant === 'solution-overview') return '优先把能最快形成客户感知的交付样板落下来。';
    if (layoutVariant === 'research-brief') return '建议先把适用边界和下一步验证动作讲清楚。';
    if (layoutVariant === 'risk-brief') return '优先把补证、边界澄清和材料重写排出顺序。';
    if (layoutVariant === 'talent-showcase') return '建议把沟通重点落在项目边界、角色和结果。';
  }
  if (moduleType === 'timeline') {
    if (layoutVariant === 'solution-overview') return '交付路径尽量保持客户容易理解的阶段节奏。';
    if (layoutVariant === 'talent-showcase') return '经历顺序尽量体现能力沉淀而不是简单列项目。';
  }
  if (moduleType === 'comparison') {
    if (layoutVariant === 'solution-overview') return '每个能力模块都应说明解决什么问题、怎么交付、客户能看到什么。';
    if (layoutVariant === 'operations-cockpit') return '对比维度要优先服务经营判断，不做平铺罗列。';
    if (layoutVariant === 'talent-showcase') return '案例说明尽量同时覆盖场景、角色和结果。';
  }
  if (moduleType === 'chart') {
    if (layoutVariant === 'operations-cockpit') return '图表应优先支撑当前经营判断，而不是重复罗列数据。';
    if (layoutVariant === 'solution-overview') return '图表应优先说明能力覆盖或交付范围，让客户一眼看懂。';
    if (layoutVariant === 'research-brief') return '图表应优先支撑主要结论，不额外扩展无关指标。';
  }
  if (moduleType === 'insight-list') {
    if (layoutVariant === 'operations-cockpit') return '重点信号应直接服务当前经营判断。';
    if (layoutVariant === 'research-brief') return '发现应尽量保留能直接进入客户摘要页的表述。';
    if (layoutVariant === 'risk-brief') return '风险描述要落到影响范围和优先级。';
  }
  return '';
}

export function buildCtaActionSentence(
  layoutVariant: DraftPolishContext['layoutVariant'],
  topActions: string,
) {
  if (!topActions) return '';
  if (layoutVariant === 'operations-cockpit') return `建议先围绕${topActions}组织当前经营动作。`;
  if (layoutVariant === 'solution-overview') return `建议优先把${topActions}落成第一批客户可见交付。`;
  if (layoutVariant === 'research-brief') return `建议先围绕${topActions}收口研究结论和适用边界。`;
  if (layoutVariant === 'risk-brief') return `建议优先围绕${topActions}处理当前风险。`;
  if (layoutVariant === 'talent-showcase') return `建议优先围绕${topActions}组织后续沟通。`;
  return `建议优先围绕${topActions}推进。`;
}

export function buildComparisonDimensionSentence(
  layoutVariant: DraftPolishContext['layoutVariant'],
  dimensions: string,
) {
  if (!dimensions) return '';
  if (layoutVariant === 'operations-cockpit') return `重点可先围绕${dimensions}组织当前经营判断。`;
  if (layoutVariant === 'solution-overview') return `重点可先按${dimensions}组织方案说明。`;
  if (layoutVariant === 'talent-showcase') return `重点可先按${dimensions}组织案例说明。`;
  return `重点可先按${dimensions}展开。`;
}

export function buildMetricGridTitle(layoutVariant: DraftPolishContext['layoutVariant']) {
  if (layoutVariant === 'operations-cockpit') return '经营指标';
  if (layoutVariant === 'solution-overview') return '方案亮点';
  if (layoutVariant === 'talent-showcase') return '关键信息';
  if (layoutVariant === 'risk-brief') return '关键提示';
  if (layoutVariant === 'research-brief') return '关键结论';
  return '关键指标';
}
