import type { ReportDraftModule, ReportDraftModuleType } from './report-center.js';
import type { ReportPlanLayoutVariant } from './report-planner.js';

export function normalizeText(value: unknown) {
  return String(value || '').trim();
}

export type DraftPolishContext = {
  layoutVariant: ReportPlanLayoutVariant | 'insight-brief';
  audienceTone: string;
  summary: string;
  metricLabels: string[];
};

function ensureSentence(value: unknown) {
  const text = normalizeText(value);
  if (!text) return '';
  return /[。！？.!?]$/.test(text) ? text : `${text}。`;
}

function buildShortList(items: string[], limit = 2) {
  return items
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, limit);
}

function summarizeBulletsForCopy(bullets: string[], limit = 2) {
  const values = buildShortList(bullets, limit);
  return values.length ? values.join('、') : '';
}

function summarizeChartItemsForCopy(
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

function splitBulletLabel(bullet: string) {
  const normalized = normalizeText(bullet);
  if (!normalized) return '';
  const [label = normalized] = normalized.split(/[：:|]/).map((item) => item.trim()).filter(Boolean);
  return label || normalized;
}

function buildScenarioLead(
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

function buildScenarioTail(
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

function buildCtaActionSentence(
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

function buildComparisonDimensionSentence(
  layoutVariant: DraftPolishContext['layoutVariant'],
  dimensions: string,
) {
  if (!dimensions) return '';
  if (layoutVariant === 'operations-cockpit') return `重点可先围绕${dimensions}组织当前经营判断。`;
  if (layoutVariant === 'solution-overview') return `重点可先按${dimensions}组织方案说明。`;
  if (layoutVariant === 'talent-showcase') return `重点可先按${dimensions}组织案例说明。`;
  return `重点可先按${dimensions}展开。`;
}

function buildMetricGridTitle(layoutVariant: DraftPolishContext['layoutVariant']) {
  if (layoutVariant === 'operations-cockpit') return '经营指标';
  if (layoutVariant === 'solution-overview') return '方案亮点';
  if (layoutVariant === 'talent-showcase') return '关键信息';
  if (layoutVariant === 'risk-brief') return '关键提示';
  if (layoutVariant === 'research-brief') return '关键结论';
  return '关键指标';
}

function buildScenarioModuleTitle(
  layoutVariant: DraftPolishContext['layoutVariant'],
  moduleType: ReportDraftModuleType,
  currentTitle: string,
) {
  const normalizedTitle = normalizeText(currentTitle);
  if (moduleType === 'hero' && normalizedTitle === '页面摘要') {
    if (layoutVariant === 'operations-cockpit') return '经营总览';
    if (layoutVariant === 'solution-overview') return '方案概览';
    if (layoutVariant === 'research-brief') return '研究摘要';
    if (layoutVariant === 'risk-brief') return '风险摘要';
    if (layoutVariant === 'talent-showcase') return '人物概览';
  }
  if (moduleType === 'metric-grid' && normalizedTitle === '关键指标') {
    return buildMetricGridTitle(layoutVariant);
  }
  if (moduleType === 'cta' && normalizedTitle === '行动建议') {
    if (layoutVariant === 'operations-cockpit') return '下一步动作';
    if (layoutVariant === 'solution-overview') return '推进建议';
    if (layoutVariant === 'research-brief') return '研究建议';
  }
  return currentTitle;
}

function buildMetricCardFallbackNote(
  layoutVariant: DraftPolishContext['layoutVariant'],
  label: string,
) {
  const normalizedLabel = normalizeText(label).toLowerCase();
  if (layoutVariant === 'operations-cockpit') {
    if (/订单|gmv|销售|收入|营收/.test(normalizedLabel)) return '建议作为首屏经营结果信号展示。';
    if (/库存|补货|周转/.test(normalizedLabel)) return '适合与风险和补货动作一起看。';
    if (/退款|退货|转化|复购/.test(normalizedLabel)) return '适合作为经营质量信号展示。';
    return '建议作为首屏经营信号展示。';
  }
  if (layoutVariant === 'solution-overview') {
    if (/场景|行业|客户/.test(normalizedLabel)) return '适合放在方案首页说明适用范围。';
    if (/模块|能力|覆盖/.test(normalizedLabel)) return '适合作为方案亮点数字展示。';
    return '建议作为方案首页亮点数字展示。';
  }
  if (layoutVariant === 'talent-showcase') {
    if (/项目|案例/.test(normalizedLabel)) return '适合放在人物概览区快速建立可信度。';
    if (/年限|经验|履历/.test(normalizedLabel)) return '适合作为人物概览的基础信息。';
    return '适合作为人物概览的首屏信息。';
  }
  if (layoutVariant === 'risk-brief') return '适合作为风险摘要页的辅助提示信息。';
  if (layoutVariant === 'research-brief') return '适合作为研究摘要页的辅助结论信息。';
  return '';
}

function looksLikeWeakCardNote(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) return true;
  return /^(样例|示例|待补充|暂无|说明|备注)$/u.test(normalized) || normalized.length <= 4;
}

function polishMetricGridCards(
  cards: Array<{ label?: string; value?: string; note?: string }>,
  layoutVariant: DraftPolishContext['layoutVariant'],
) {
  return (Array.isArray(cards) ? cards : []).map((card, index) => {
    const label = normalizeText(card?.label) || `指标 ${index + 1}`;
    const value = normalizeText(card?.value);
    const note = normalizeText(card?.note);
    const fallbackNote = buildMetricCardFallbackNote(layoutVariant, label);
    return {
      ...card,
      label,
      value,
      note: looksLikeWeakCardNote(note) ? (fallbackNote || note) : ensureSentence(note),
    };
  });
}

function buildPlaceholderContentDraft(
  moduleType: ReportDraftModuleType,
  title: string,
  summary: string,
  context?: DraftPolishContext,
) {
  const normalizedTitle = normalizeText(title) || '当前模块';
  if (moduleType === 'cta') {
    return `${buildScenarioLead(context?.layoutVariant || 'insight-brief', moduleType, normalizedTitle) || '建议先补充以下动作'}，终稿前再替换为确认后的客户口径。`;
  }
  if (moduleType === 'timeline') {
    return `${buildScenarioLead(context?.layoutVariant || 'insight-brief', moduleType, normalizedTitle) || '建议按阶段补充当前路径'}，终稿前补全关键节点和里程碑。`;
  }
  if (moduleType === 'comparison') {
    return `${buildScenarioLead(context?.layoutVariant || 'insight-brief', moduleType, normalizedTitle) || '当前模块可按对比结构补充'}，终稿前补全每个维度的证据和结论。`;
  }
  if (moduleType === 'metric-grid') {
    return `${normalizedTitle} 当前仍待补充确认后的关键数据，终稿前替换为可直接展示的指标卡。`;
  }
  if (moduleType === 'chart') {
    return `${normalizedTitle} 当前保留图表位置，终稿前补充实际数据和标题说明。`;
  }
  const normalizedSummary = normalizeText(summary);
  if (normalizedSummary) {
    return `${ensureSentence(normalizedSummary)}当前先保留「${normalizedTitle}」区块，终稿前补充更明确的证据和表述。`;
  }
  return `当前先保留「${normalizedTitle}」区块，终稿前补充更明确的证据和表述。`;
}

function buildReadableModuleCopy(module: ReportDraftModule, context: DraftPolishContext) {
  const body = normalizeText(module.contentDraft);
  const bullets = Array.isArray(module.bullets) ? module.bullets.filter(Boolean).map((item) => normalizeText(item)) : [];
  const metricFocus = buildShortList(context.metricLabels, 2).join('、');
  const scenarioTail = buildScenarioTail(context.layoutVariant, module.moduleType);
  if (module.moduleType === 'hero') {
    if (body && metricFocus && scenarioTail) return `${ensureSentence(body)}当前页优先围绕${metricFocus}展开。${scenarioTail}`;
    if (body && metricFocus) return `${ensureSentence(body)}当前页优先围绕${metricFocus}展开。`;
    if (body && scenarioTail) return `${ensureSentence(body)}${scenarioTail}`;
    if (body) return ensureSentence(body);
    if (context.summary && metricFocus && scenarioTail) return `${ensureSentence(context.summary)}当前页优先围绕${metricFocus}展开。${scenarioTail}`;
    if (context.summary && metricFocus) return `${ensureSentence(context.summary)}当前页优先围绕${metricFocus}展开。`;
    if (context.summary && scenarioTail) return `${ensureSentence(context.summary)}${scenarioTail}`;
    return ensureSentence(context.summary);
  }
  if (module.moduleType === 'cta') {
    const topActions = summarizeBulletsForCopy(bullets, 2);
    const actionSentence = buildCtaActionSentence(context.layoutVariant, topActions);
    if (body && actionSentence && scenarioTail) return `${ensureSentence(body)}${actionSentence}${scenarioTail}`;
    if (body && actionSentence) return `${ensureSentence(body)}${actionSentence}`;
    if (body && scenarioTail) return `${ensureSentence(body)}${scenarioTail}`;
    if (body) return ensureSentence(body);
    if (topActions) return `${buildScenarioLead(context.layoutVariant, module.moduleType, module.title)}：${topActions}。`;
    return body;
  }
  if (module.moduleType === 'timeline') {
    const topPhases = summarizeBulletsForCopy(bullets, 3);
    if (body && bullets.length && scenarioTail) return `${ensureSentence(body)}建议按以下阶段展开。${scenarioTail}`;
    if (body && bullets.length) return `${ensureSentence(body)}建议按以下阶段展开。`;
    if (body && scenarioTail) return `${ensureSentence(body)}${scenarioTail}`;
    if (body) return ensureSentence(body);
    if (topPhases) return `${buildScenarioLead(context.layoutVariant, module.moduleType, module.title)}：${topPhases}。`;
    return body;
  }
  if (module.moduleType === 'comparison') {
    const dimensions = summarizeBulletsForCopy(bullets.map(splitBulletLabel), 3);
    const dimensionSentence = buildComparisonDimensionSentence(context.layoutVariant, dimensions);
    if (body && dimensionSentence && scenarioTail) return `${ensureSentence(body)}${dimensionSentence}${scenarioTail}`;
    if (body && dimensionSentence) return `${ensureSentence(body)}${dimensionSentence}`;
    if (body && scenarioTail) return `${ensureSentence(body)}${scenarioTail}`;
    if (body) return ensureSentence(body);
    if (dimensions) return `${buildScenarioLead(context.layoutVariant, module.moduleType, module.title)}：${dimensions}。`;
    return body;
  }
  if (module.moduleType === 'chart') {
    const chartFocus = summarizeChartItemsForCopy(module.chartIntent?.items, 3);
    if (body && chartFocus && scenarioTail) return `${ensureSentence(body)}图表建议优先展示${chartFocus}等核心维度。${scenarioTail}`;
    if (body && chartFocus) return `${ensureSentence(body)}图表建议优先展示${chartFocus}等核心维度。`;
    if (body && scenarioTail) return `${ensureSentence(body)}${scenarioTail}`;
    if (body) return ensureSentence(body);
    if (chartFocus) return `${buildScenarioLead(context.layoutVariant, module.moduleType, module.title)}：${chartFocus}。`;
    return body;
  }
  if (module.moduleType === 'insight-list') {
    const highlights = summarizeBulletsForCopy(bullets, 2);
    if (body && highlights && !body.includes(highlights) && scenarioTail) return `${ensureSentence(body)}重点集中在${highlights}。${scenarioTail}`;
    if (body && highlights && !body.includes(highlights)) return `${ensureSentence(body)}重点集中在${highlights}。`;
    if (body && scenarioTail) return `${ensureSentence(body)}${scenarioTail}`;
    if (body) return ensureSentence(body);
    if (highlights) return `${buildScenarioLead(context.layoutVariant, module.moduleType, module.title)}${highlights}。`;
    return body;
  }
  if (body) return ensureSentence(body);
  return body;
}

export function polishDraftModules(modules: ReportDraftModule[], context: DraftPolishContext) {
  return modules.map((module) => {
    const normalizedEvidenceRefs = Array.isArray(module.evidenceRefs)
      ? module.evidenceRefs.map((item) => normalizeText(item)).filter(Boolean)
      : [];
    const contentDraft = normalizedEvidenceRefs.includes('composer:placeholder')
      ? buildPlaceholderContentDraft(module.moduleType, module.title, context.summary, context)
      : buildReadableModuleCopy(module, context);
    return {
      ...module,
      contentDraft,
      purpose: normalizeText(module.purpose),
      evidenceRefs: normalizedEvidenceRefs,
      title: buildScenarioModuleTitle(context.layoutVariant, module.moduleType, module.title),
      cards:
        module.moduleType === 'metric-grid'
          ? polishMetricGridCards(module.cards || [], context.layoutVariant)
          : module.cards,
    };
  });
}
