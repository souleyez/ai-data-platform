import type { ReportDraftModuleType, ReportOutputRecord } from './report-center.js';
import { inferSectionModuleType } from './report-visual-intent.js';
import { normalizeText } from './report-draft-copy-polish.js';

export function classifySectionType(title: string, body: string, bullets: string[], hasBullets: boolean): ReportDraftModuleType {
  return inferSectionModuleType({
    title,
    body,
    bullets,
    fallbackModuleType: hasBullets ? 'insight-list' : 'summary',
  });
}

export function classifyRiskSectionType(title: string, body: string, bullets: string[], hasBullets: boolean): ReportDraftModuleType {
  const normalized = `${title} ${body} ${(bullets || []).join(' ')}`.toLowerCase();
  if (/应答|应对|策略|建议|行动|next|recommend/.test(normalized)) return 'cta';
  if (/风险|资格|缺口|异常|阻塞|问题|gap/.test(normalized)) return 'insight-list';
  if (/附录|证据|来源|材料|依据|appendix|evidence/.test(normalized)) return 'appendix';
  if (/矩阵|对比|comparison/.test(normalized)) return 'comparison';
  return inferSectionModuleType({
    title,
    body,
    bullets,
    fallbackModuleType: hasBullets ? 'insight-list' : 'summary',
  });
}

export function classifyResearchSectionType(title: string, body: string, bullets: string[], hasBullets: boolean): ReportDraftModuleType {
  const normalized = `${title} ${body} ${(bullets || []).join(' ')}`.toLowerCase();
  if (/局限|限制|风险|uncertainty|limitation/.test(normalized)) return 'insight-list';
  if (/结果|发现|结论|finding|result|conclusion/.test(normalized)) return 'insight-list';
  if (/建议|启发|行动|next|recommend/.test(normalized)) return 'cta';
  if (/方法|method|design/.test(normalized)) return 'summary';
  return inferSectionModuleType({
    title,
    body,
    bullets,
    fallbackModuleType: hasBullets ? 'insight-list' : 'summary',
  });
}

export function classifySolutionSectionType(title: string, body: string, bullets: string[], hasBullets: boolean): ReportDraftModuleType {
  const normalized = `${title} ${body} ${(bullets || []).join(' ')}`.toLowerCase();
  if (/交付|实施|计划|里程碑|roadmap|timeline|phase|上线/.test(normalized)) return 'timeline';
  if (/建议|行动|下一步|next|recommend|call to action/.test(normalized)) return 'cta';
  if (/架构|模块|能力|服务|产品|方案|组件|capability|service|solution|architecture|module/.test(normalized)) {
    return hasBullets ? 'comparison' : 'summary';
  }
  if (/价值|收益|亮点|优势|benefit|value|highlight|advantage/.test(normalized)) return 'insight-list';
  if (/案例|证据|客户|proof|reference|appendix|evidence/.test(normalized)) return 'appendix';
  return inferSectionModuleType({
    title,
    body,
    bullets,
    fallbackModuleType: hasBullets ? 'insight-list' : 'summary',
  });
}

export function classifyTalentSectionType(title: string, body: string, bullets: string[], hasBullets: boolean): ReportDraftModuleType {
  const normalized = `${title} ${body} ${(bullets || []).join(' ')}`.toLowerCase();
  if (/联系|合作|下一步|next|contact|reach/.test(normalized)) return 'cta';
  if (/经历|履历|experience|timeline|成长|历程/.test(normalized)) return 'timeline';
  if (/技能|能力|强项|优势|skill|strength|capabilit/.test(normalized)) return 'insight-list';
  if (/项目|案例|portfolio|case|作品/.test(normalized)) return 'comparison';
  if (/成果|亮点|achievement|impact|result/.test(normalized)) return 'insight-list';
  if (/附录|证书|reference|appendix/.test(normalized)) return 'appendix';
  return inferSectionModuleType({
    title,
    body,
    bullets,
    fallbackModuleType: hasBullets ? 'insight-list' : 'summary',
  });
}

export function resolveRecordLayoutVariant(record: ReportOutputRecord) {
  return normalizeText(record.page?.pageSpec?.layoutVariant || record.dynamicSource?.planPageSpec?.layoutVariant);
}

export function isOperationsCockpitRecord(record: ReportOutputRecord) {
  const layoutVariant = resolveRecordLayoutVariant(record);
  if (layoutVariant === 'operations-cockpit') return true;
  const title = normalizeText(record.title).toLowerCase();
  return /workspace|overview|dashboard|cockpit|总览|经营|运营|驾驶舱/.test(title);
}

export function isRiskBriefRecord(record: ReportOutputRecord) {
  const layoutVariant = resolveRecordLayoutVariant(record);
  if (layoutVariant === 'risk-brief') return true;
  const title = normalizeText(record.title).toLowerCase();
  return /risk|bid|tender|proposal|标书|招标|投标|风险/.test(title);
}

export function isResearchBriefRecord(record: ReportOutputRecord) {
  const layoutVariant = resolveRecordLayoutVariant(record);
  if (layoutVariant === 'research-brief') return true;
  const title = normalizeText(record.title).toLowerCase();
  return /research|paper|study|analysis|论文|研究|综述|分析/.test(title);
}

export function isSolutionOverviewRecord(record: ReportOutputRecord) {
  const layoutVariant = resolveRecordLayoutVariant(record);
  if (layoutVariant === 'solution-overview') return true;
  const title = normalizeText(record.title).toLowerCase();
  return /solution|overview|service|capability|architecture|解决方案|方案|能力|服务|产品介绍|架构/.test(title);
}

export function isTalentShowcaseRecord(record: ReportOutputRecord) {
  const layoutVariant = resolveRecordLayoutVariant(record);
  if (layoutVariant === 'talent-showcase') return true;
  const title = normalizeText(record.title).toLowerCase();
  return /resume|profile|portfolio|talent|candidate|cv|简历|履历|人才|作品集/.test(title);
}
