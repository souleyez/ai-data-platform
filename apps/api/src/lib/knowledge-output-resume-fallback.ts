import type { ParsedDocument } from './document-parser.js';
import {
  alignRowsToColumns,
  containsAny,
  normalizeText,
  sanitizeText,
} from './knowledge-output-normalization.js';
import {
  buildResumePageCards,
  buildResumePageCharts,
  buildResumePageSummary,
  buildResumePageTitle,
  buildResumeSectionBlueprints,
  hasExpectedResumeTitle,
  hasSuspiciousResumeHardMetrics,
} from './knowledge-output-resume-page-copy.js';
import {
  buildRankedLabelCounts,
  buildResumePageEntries,
  buildResumePageStats,
  getResumeDisplayName,
  joinRankedLabels,
} from './knowledge-output-resume-support.js';
import {
  buildResumeCompanyProjectRows,
  buildResumeProjectRows,
  buildResumeSkillRows,
  buildResumeTalentRows,
  resolveResumeRequestView,
  type ResumeRequestView,
} from './knowledge-output-resume-views.js';
import type { ChatOutput } from './knowledge-output-types.js';
import type { ResumeDisplayProfile } from './resume-display-profile-provider.js';
import type { ReportTemplateEnvelope } from './report-center.js';

type PagePayload = NonNullable<Exclude<ChatOutput, { type: 'answer' }>['page']>;

type KnowledgePageOutput = {
  type: 'page';
  title: string;
  content: string;
  format: 'html';
  page: PagePayload;
};

const RESUME_COMPANY_COLUMNS = ['公司', '候选人', 'IT项目', '项目角色/职责', '技术栈/系统关键词', '时间线', '证据来源'];
const RESUME_PROJECT_COLUMNS = ['项目主题', '公司', '候选人', '角色/职责', '技术关键词', '时间线', '证据来源'];
const RESUME_TALENT_COLUMNS = ['候选人', '第一学历', '最近公司', '核心能力', '年龄', '工作年限', '项目亮点', '证据来源'];
const RESUME_SKILL_COLUMNS = ['技能类别', '候选人', '技能详情', '最近公司', '关联项目', '证据来源'];
const UNKNOWN_COMPANY = '未明确公司';

function getResumePageCopyDeps() {
  return {
    normalizeText,
    containsAny,
    joinRankedLabels,
  };
}

function getResumeViewDeps() {
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

function defaultResumePageSections(view: ResumeRequestView) {
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

function wrapPageOutputAsKind(kind: 'page' | 'pdf' | 'ppt' | 'doc' | 'md', page: KnowledgePageOutput): ChatOutput {
  if (kind === 'page') return page;
  return {
    type: kind,
    title: page.title,
    content: page.content,
    format: resolveNarrativeOutputFormat(kind),
    page: page.page,
  };
}

export function buildResumePageOutput(
  view: ResumeRequestView,
  documents: ParsedDocument[],
  envelope?: ReportTemplateEnvelope | null,
  displayProfiles: ResumeDisplayProfile[] = [],
): KnowledgePageOutput {
  const resumePageCopyDeps = getResumePageCopyDeps();
  const stats = buildResumePageStats(buildResumePageEntries(documents, displayProfiles));
  const summary = buildResumePageSummary(view, documents.length, stats, resumePageCopyDeps);
  const shouldUseEnvelopeSections = Boolean(envelope?.pageSections?.length)
    && hasExpectedResumeTitle(view, envelope?.title || '', resumePageCopyDeps);
  const sectionTitles = shouldUseEnvelopeSections ? (envelope?.pageSections || []) : defaultResumePageSections(view);
  const blueprints = buildResumeSectionBlueprints(view, summary, stats, resumePageCopyDeps);

  return {
    type: 'page',
    title: buildResumePageTitle(view, envelope, resumePageCopyDeps),
    content: summary,
    format: 'html',
    page: {
      summary,
      cards: buildResumePageCards(view, documents.length, stats, resumePageCopyDeps),
      sections: sectionTitles.map((title, index) => {
        const section = blueprints[index] || { body: '', bullets: [] as string[] };
        return {
          title,
          body: section.body || (index === 0 ? summary : ''),
          bullets: section.bullets || [],
        };
      }),
      charts: buildResumePageCharts(view, stats),
    },
  };
}

export function buildResumeFallbackNarrativeTitle(
  view: ResumeRequestView,
  envelope?: ReportTemplateEnvelope | null,
) {
  return buildResumePageTitle(view, envelope, getResumePageCopyDeps());
}

export function hydrateResumePageVisualShell(
  view: ResumeRequestView,
  documents: ParsedDocument[],
  envelope: ReportTemplateEnvelope | null | undefined,
  displayProfiles: ResumeDisplayProfile[],
  page: KnowledgePageOutput['page'],
) {
  const fallbackPage = buildResumePageOutput(view, documents, envelope, displayProfiles).page;
  const mergeCards = (
    primary: NonNullable<KnowledgePageOutput['page']['cards']>,
    fallback: NonNullable<KnowledgePageOutput['page']['cards']>,
    minCount: number,
  ) => {
    const merged = [...primary];
    const seen = new Set(merged.map((item) => normalizeText(item.label || item.value || item.note || '')));
    for (const item of fallback) {
      if (merged.length >= minCount) break;
      const key = normalizeText(item.label || item.value || item.note || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    return merged.length ? merged : fallback;
  };
  const mergeCharts = (
    primary: NonNullable<KnowledgePageOutput['page']['charts']>,
    fallback: NonNullable<KnowledgePageOutput['page']['charts']>,
    minCount: number,
  ) => {
    const merged = [...primary];
    const seen = new Set(merged.map((item) => normalizeText(item.title || '')));
    for (const item of fallback) {
      if (merged.length >= minCount) break;
      const key = normalizeText(item.title || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    return merged.length ? merged : fallback;
  };
  const minCardCount = view === 'client' ? 4 : 0;
  const minChartCount = view === 'client' ? 2 : 0;
  return {
    summary: page.summary || fallbackPage.summary,
    cards: mergeCards(page.cards || [], fallbackPage.cards || [], minCardCount),
    sections: page.sections?.length ? page.sections : fallbackPage.sections,
    charts: mergeCharts(page.charts || [], fallbackPage.charts || [], minChartCount),
  };
}

function countResumePipeEchoSections(sections: Array<{ title?: string; body?: string; bullets?: string[] }>) {
  return sections.filter((section) => (
    sanitizeText(section.body).includes(' | ')
    || (section.bullets || []).some((item) => sanitizeText(item).includes(' | '))
  )).length;
}

function shouldUseResumePageFallback(
  view: ResumeRequestView,
  title: string,
  page: NonNullable<Exclude<ChatOutput, { type: 'answer' }>['page']>,
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

export function buildResumeFallbackOutput(
  kind: 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md',
  requestText: string,
  documents: ParsedDocument[],
  envelope?: ReportTemplateEnvelope | null,
  displayProfiles: ResumeDisplayProfile[] = [],
): ChatOutput | null {
  const resumeDocuments = documents.filter((item) => item.schemaType === 'resume');
  if (!resumeDocuments.length) return null;

  const resumeViewDeps = getResumeViewDeps();
  const view = resolveResumeRequestView(requestText, resumeViewDeps);
  const resumeEntries = buildResumePageEntries(resumeDocuments, displayProfiles);

  if (kind !== 'table') {
    const page = buildResumePageOutput(view, resumeDocuments, envelope, displayProfiles);
    return wrapPageOutputAsKind(kind, page);
  }

  if (view === 'company') {
    const rows = buildResumeCompanyProjectRows(resumeEntries, resumeViewDeps);
    if (rows.length) {
      return {
        type: 'table',
        title: envelope?.title || '简历 IT 项目公司维度表',
        content: `已基于库内简历整理出按公司维度的 IT 项目信息，共 ${rows.length} 条。`,
        format: 'csv',
        table: {
          title: envelope?.title || '简历 IT 项目公司维度表',
          subtitle: '基于知识库结构化简历信息自动整理',
          columns: envelope?.tableColumns || RESUME_COMPANY_COLUMNS,
          rows,
        },
      };
    }
  }

  if (view === 'project') {
    const rows = buildResumeProjectRows(resumeEntries, resumeViewDeps);
    if (rows.length) {
      return {
        type: 'table',
        title: envelope?.title || '简历项目维度表',
        content: `已基于库内简历整理出按项目维度的经历信息，共 ${rows.length} 条。`,
        format: 'csv',
        table: {
          title: envelope?.title || '简历项目维度表',
          subtitle: '基于知识库结构化简历信息自动整理',
          columns: envelope?.tableColumns || RESUME_PROJECT_COLUMNS,
          rows,
        },
      };
    }
  }

  if (view === 'skill') {
    const rows = buildResumeSkillRows(resumeEntries, resumeViewDeps);
    if (rows.length) {
      return {
        type: 'table',
        title: envelope?.title || '简历技能维度表',
        content: `已基于库内简历整理出按技能维度的信息，共 ${rows.length} 条。`,
        format: 'csv',
        table: {
          title: envelope?.title || '简历技能维度表',
          subtitle: '基于知识库结构化简历信息自动整理',
          columns: envelope?.tableColumns || RESUME_SKILL_COLUMNS,
          rows,
        },
      };
    }
  }

  if (view === 'talent' || view === 'generic') {
    const rows = buildResumeTalentRows(resumeEntries);
    if (rows.length) {
      return {
        type: 'table',
        title: envelope?.title || '简历人才维度表',
        content: `已基于库内简历整理出按人才维度的信息，共 ${rows.length} 条。`,
        format: 'csv',
        table: {
          title: envelope?.title || '简历人才维度表',
          subtitle: '基于知识库结构化简历信息自动整理',
          columns: envelope?.tableColumns || RESUME_TALENT_COLUMNS,
          rows,
        },
      };
    }
  }

  const fallbackColumns = envelope?.tableColumns?.length ? envelope.tableColumns : ['结论', '说明', '证据来源'];
  const fallbackRow =
    fallbackColumns.length === 1
      ? ['当前未能稳定提取更多结构化条目。']
      : [
          '当前未能稳定提取更多结构化条目。',
          '可继续补充更明确的筛选条件或模板全名。',
          '知识库当前证据',
        ];

  return {
    type: 'table',
    title: envelope?.title || '简历人才维度表',
    content: '当前未能稳定提取更多结构化条目。',
    format: 'csv',
    table: {
      title: envelope?.title || '简历人才维度表',
      subtitle: '根据知识库结构化结果整理',
      columns: fallbackColumns,
      rows: [alignRowsToColumns([fallbackRow], fallbackColumns)[0]],
    },
  };
}

export function shouldUseResumePageFallbackOutput(
  requestText: string,
  output: ChatOutput,
  documents: ParsedDocument[] = [],
) {
  const resumeDocuments = documents.filter((item) => item.schemaType === 'resume');
  if (!resumeDocuments.length || output.type === 'answer' || !('page' in output) || !output.page) return false;
  const view = resolveResumeFallbackView(requestText);
  return shouldUseResumePageFallback(view, output.title, output.page);
}
