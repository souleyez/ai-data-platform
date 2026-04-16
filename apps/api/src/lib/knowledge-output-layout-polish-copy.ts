import {
  ensureSentence,
  includesLayoutSignals,
  looksLikeWeakSectionBody,
} from './knowledge-output-layout-polish-support.js';
import { buildLayoutVariantChartTitle } from './knowledge-output-layout-polish-titles.js';
import type { LayoutPolishDeps, LayoutVariant } from './knowledge-output-layout-polish-types.js';

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
