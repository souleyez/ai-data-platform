import {
  containsAny,
  normalizeText,
  sanitizeText,
} from './knowledge-output-normalization.js';
import { joinRankedLabels } from './knowledge-output-resume-support.js';
import {
  resolveResumeRequestView,
  type ResumeRequestView,
} from './knowledge-output-resume-views.js';
import { getResumeDisplayName } from './knowledge-output-resume-support.js';
import type { ChatOutput } from './knowledge-output-types.js';

type PagePayload = NonNullable<Exclude<ChatOutput, { type: 'answer' }>['page']>;

export type KnowledgePageOutput = {
  type: 'page';
  title: string;
  content: string;
  format: 'html';
  page: PagePayload;
};

export const RESUME_COMPANY_COLUMNS = ['公司', '候选人', 'IT项目', '项目角色/职责', '技术栈/系统关键词', '时间线', '证据来源'];
export const RESUME_PROJECT_COLUMNS = ['项目主题', '公司', '候选人', '角色/职责', '技术关键词', '时间线', '证据来源'];
export const RESUME_TALENT_COLUMNS = ['候选人', '第一学历', '最近公司', '核心能力', '年龄', '工作年限', '项目亮点', '证据来源'];
export const RESUME_SKILL_COLUMNS = ['技能类别', '候选人', '技能详情', '最近公司', '关联项目', '证据来源'];
const UNKNOWN_COMPANY = '未明确公司';

export function getResumePageCopyDeps() {
  return {
    normalizeText,
    containsAny,
    joinRankedLabels,
  };
}

export function getResumeViewDeps() {
  return {
    normalizeText,
    containsAny,
    sanitizeText,
    getResumeDisplayName,
    unknownCompany: UNKNOWN_COMPANY,
  };
}

export function resolveResumeFallbackView(requestText: string) {
  return resolveResumeRequestView(requestText, getResumeViewDeps());
}

export function defaultResumePageSections(view: ResumeRequestView) {
  if (view === 'client') return ['客户概览', '代表候选人', '代表项目', '技能覆盖', '匹配建议', 'AI综合分析'];
  if (view === 'company') return ['公司概览', '重点项目分布', '候选人覆盖', '技术关键词', '风险与机会', 'AI综合分析'];
  if (view === 'project') return ['项目概览', '公司分布', '候选人参与', '技术关键词', '交付信号', 'AI综合分析'];
  if (view === 'skill') return ['技能概览', '候选人分布', '公司覆盖', '关联项目', '人才机会', 'AI综合分析'];
  return ['人才概览', '学历与背景', '公司经历', '项目经历', '核心能力', 'AI综合分析'];
}

function resolveNarrativeOutputFormat(kind: 'page' | 'pdf' | 'ppt' | 'doc' | 'md') {
  if (kind === 'page') return 'html';
  if (kind === 'ppt') return 'pptx';
  if (kind === 'pdf') return 'pdf';
  if (kind === 'doc') return 'docx';
  return 'md';
}

export function wrapPageOutputAsKind(kind: 'page' | 'pdf' | 'ppt' | 'doc' | 'md', page: KnowledgePageOutput): ChatOutput {
  if (kind === 'page') return page;
  return {
    type: kind,
    title: page.title,
    content: page.content,
    format: resolveNarrativeOutputFormat(kind),
    page: page.page,
  };
}

function countResumePipeEchoSections(sections: Array<{ title?: string; body?: string; bullets?: string[] }>) {
  return sections.filter((section) => (
    sanitizeText(section.body).includes(' | ')
    || (section.bullets || []).some((item) => sanitizeText(item).includes(' | '))
  )).length;
}

export function shouldUseResumePageFallback(
  view: ResumeRequestView,
  title: string,
  page: NonNullable<Exclude<ChatOutput, { type: 'answer' }>['page']>,
  hasExpectedResumeTitle: (view: ResumeRequestView, title: string, deps: ReturnType<typeof getResumePageCopyDeps>) => boolean,
  hasSuspiciousResumeHardMetrics: (view: ResumeRequestView, pageText: string) => boolean,
) {
  const resumePageCopyDeps = getResumePageCopyDeps();
  const cards = page.cards || [];
  const sections = page.sections || [];
  const charts = page.charts || [];
  const pageText = [
    title,
    page.summary || '',
    ...cards.flatMap((card) => [card.label || '', card.value || '', card.note || '']),
    ...sections.flatMap((section) => [section.title || '', section.body || '', ...(section.bullets || [])]),
  ]
    .map((item) => sanitizeText(item))
    .filter(Boolean)
    .join('\n');

  const pipeEchoSections = countResumePipeEchoSections(sections);
  if (!hasExpectedResumeTitle(view, title, resumePageCopyDeps)) return true;
  if ((view === 'client' || view === 'skill') && pipeEchoSections >= 2) return true;
  if (pipeEchoSections >= 3 && charts.length <= 1) return true;
  if (hasSuspiciousResumeHardMetrics(view, pageText)) return true;
  return false;
}
