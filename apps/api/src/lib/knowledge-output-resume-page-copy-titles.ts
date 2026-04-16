import type { ReportTemplateEnvelope } from './report-center.js';
import type { ResumePageStats } from './knowledge-output-resume-types.js';
import type { ResumeRequestView } from './knowledge-output-resume-views.js';
import type { ResumePageCopyDeps } from './knowledge-output-resume-page-copy-support.js';

export function hasExpectedResumeTitle(view: ResumeRequestView, title: string, deps: Pick<ResumePageCopyDeps, 'normalizeText' | 'containsAny'>) {
  const normalized = deps.normalizeText(title);
  if (!normalized) return false;
  if (view === 'client') return deps.containsAny(normalized, ['client', 'customer', '客户', '汇报', '推荐', '匹配']);
  if (view === 'skill') return deps.containsAny(normalized, ['skill', '技能']);
  if (view === 'company') return deps.containsAny(normalized, ['company', '公司']);
  if (view === 'project') return deps.containsAny(normalized, ['project', '项目']);
  return deps.containsAny(normalized, ['talent', 'candidate', '人才', '候选人']);
}

export function buildResumePageTitle(
  view: ResumeRequestView,
  envelope: ReportTemplateEnvelope | null | undefined,
  deps: Pick<ResumePageCopyDeps, 'normalizeText' | 'containsAny'>,
) {
  if (envelope?.title && hasExpectedResumeTitle(view, envelope.title, deps)) return envelope.title;
  if (view === 'client') return '简历客户汇报静态页';
  if (view === 'company') return '简历公司维度 IT 项目静态页';
  if (view === 'project') return '简历项目维度静态页';
  if (view === 'skill') return '简历技能维度静态页';
  return '简历人才维度静态页';
}

export function buildResumePageSummary(
  view: ResumeRequestView,
  documentCount: number,
  stats: ResumePageStats,
  deps: Pick<ResumePageCopyDeps, 'joinRankedLabels'>,
) {
  const shared = `当前基于库内 ${documentCount} 份简历，整理出 ${stats.candidateCount} 位候选人、${stats.companyCount} 家关联公司和 ${stats.projectCount} 条项目线索。`;
  if (view === 'talent') {
    const shortlistText = stats.showcaseCandidateNames.length ? `优先展示 ${stats.showcaseCandidateNames.join('、')} 等 shortlist 候选人。` : '';
    return `${shared} 当前页面采用客户汇报视角，重点展示代表候选人、代表项目、核心技能和匹配建议。${shortlistText}`;
  }
  if (view === 'company') return `${shared} 当前页面按公司维度组织，适合快速查看目标公司的项目经验覆盖和人才结构。`;
  if (view === 'project') return `${shared} 当前页面按项目维度组织，适合对比代表项目、参与候选人和技术方向。`;
  if (view === 'skill') {
    return `当前基于库内 ${documentCount} 份简历，汇总出 ${stats.skillCount} 类核心技能、${stats.candidateCount} 位候选人和 ${stats.projectCount} 条关联项目线索，适合用于技能盘点和招聘筛选。`;
  }
  return `${shared} 当前页面按人才维度组织，适合快速查看候选人背景、项目经历和核心能力。`;
}

export function hasSuspiciousResumeHardMetrics(view: ResumeRequestView, text: string) {
  if (view !== 'company' && view !== 'project' && view !== 'client') return false;
  return /(?:\d+(?:\.\d+)?%|\d+(?:\.\d+)?(?:亿|万|k|K)|\d+\+)/.test(text);
}
