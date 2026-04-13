import type { ParsedDocument } from './document-parser.js';
import type { ReportPlanDatavizSlot, ReportPlanPageSpec } from './report-planner.js';
import type { ReportTemplateEnvelope } from './report-center.js';
import {
  buildLayoutVariantPageTitle,
  polishLayoutVariantPageCopy,
  resolvePreferredNarrativeTitle,
} from './knowledge-output-layout-polish.js';
import {
  alignRowsToColumns,
  alignSectionsToEnvelope,
  applyPageSpecSectionDisplayModes,
  applyPlannedDatavizSlots,
  buildDefaultTitle,
  containsAny,
  extractEmbeddedStructuredPayload,
  inferSectionDisplayModeFromTitle,
  isObject,
  looksLikeJsonEchoText,
  looksLikeStructuredReportPayload,
  normalizeCards,
  normalizeCharts,
  normalizeColumnNames,
  normalizeReportPlanDatavizSlots,
  normalizeReportPlanPageSpec,
  normalizeSections,
  normalizeText,
  pickNestedObject,
  pickString,
  sanitizeRows,
  sanitizeStringArray,
  sanitizeText,
  toStringArray,
  tryParseJsonPayload,
  type JsonRecord,
} from './knowledge-output-normalization.js';
import {
  buildFootfallPageOutput,
  buildFootfallTableOutput,
  hydrateFootfallPageVisualShell,
  isFootfallReportDocument,
} from './knowledge-output-footfall.js';
import {
  buildOrderPageOutput,
  hydrateOrderPageVisualShell,
  isOrderInventoryDocument,
  resolveOrderRequestView,
} from './knowledge-output-order.js';
import {
  buildPromptEchoFallbackOutput,
  buildSupplyEchoPageOutput,
  looksLikeKnowledgeSupplyPayload,
  looksLikePromptEchoPage,
} from './knowledge-output-supply-fallback.js';
import {
  buildResumePageCards,
  buildResumePageCharts,
  buildResumePageSummary,
  buildResumePageTitle,
  buildResumeSectionBlueprints,
  hasSuspiciousResumeHardMetrics,
  hasExpectedResumeTitle,
} from './knowledge-output-resume-page-copy.js';
import {
  buildRankedLabelCounts,
  buildResumePageEntries,
  buildResumePageStats,
  getResumeDisplayName,
  joinRankedLabels,
  type ResumePageEntry,
  type ResumePageStats,
  type ResumeShowcaseProject,
} from './knowledge-output-resume-support.js';
import {
  buildResumeCompanyProjectRows,
  buildResumeProjectRows,
  buildResumeSkillRows,
  buildResumeTalentRows,
  resolveResumeRequestView,
  type ResumeRequestView,
} from './knowledge-output-resume-views.js';
import type { ResumeDisplayProfile } from './resume-display-profile-provider.js';
import { isFootfallDocumentSignal } from './document-domain-signals.js';

export type ChatOutput =
  | { type: 'answer'; content: string }
  | {
      type: 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md';
      title: string;
      content: string;
      format?: string;
      table?: {
        title?: string;
        subtitle?: string;
        columns?: string[];
        rows?: Array<Array<string | number | null>>;
      } | null;
      page?: {
        summary?: string;
        cards?: Array<{ label?: string; value?: string; note?: string }>;
        sections?: Array<{ title?: string; body?: string; bullets?: string[]; displayMode?: string }>;
        datavizSlots?: ReportPlanDatavizSlot[];
        pageSpec?: ReportPlanPageSpec;
        charts?: Array<{
          title?: string;
          items?: Array<{ label?: string; value?: number }>;
          render?: {
            renderer?: string;
            chartType?: string;
            svg?: string;
            alt?: string;
            generatedAt?: string;
          } | null;
        }>;
      } | null;
    };

export type NormalizeReportOutputOptions = {
  allowResumeFallback?: boolean;
  datavizSlots?: ReportPlanDatavizSlot[];
  pageSpec?: ReportPlanPageSpec;
};

type KnowledgePageOutput = {
  type: 'page';
  title: string;
  content: string;
  format: 'html';
  page: NonNullable<Exclude<ChatOutput, { type: 'answer' }>['page']>;
};

const RESUME_COMPANY_COLUMNS = ['公司', '候选人', 'IT项目', '项目角色/职责', '技术栈/系统关键词', '时间线', '证据来源'];
const RESUME_PROJECT_COLUMNS = ['项目主题', '公司', '候选人', '角色/职责', '技术关键词', '时间线', '证据来源'];
const RESUME_TALENT_COLUMNS = ['候选人', '第一学历', '最近公司', '核心能力', '年龄', '工作年限', '项目亮点', '证据来源'];
const RESUME_SKILL_COLUMNS = ['技能类别', '候选人', '技能详情', '最近公司', '关联项目', '证据来源'];
const DEFAULT_PAGE_SECTIONS = ['摘要', '重点分析', '行动建议', 'AI综合分析'];
const UNKNOWN_COMPANY = '未明确公司';

function getLayoutPolishDeps() {
  return {
    buildDefaultTitle,
    containsAny,
    looksLikeJsonEchoText,
    normalizeText,
    sanitizeText,
  };
}

function getFootfallOutputDeps() {
  return {
    normalizeText,
    sanitizeText,
    containsAny,
    looksLikeJsonEchoText,
  };
}

function getOrderOutputDeps() {
  return {
    normalizeText,
    sanitizeText,
    containsAny,
    toStringArray,
    buildRankedLabelCounts,
    joinRankedLabels,
    looksLikeJsonEchoText,
  };
}

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

function isNarrativeOutputKind(kind: 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md') {
  return kind !== 'table';
}

function resolveNarrativeOutputFormat(kind: 'page' | 'pdf' | 'ppt' | 'doc' | 'md') {
  if (kind === 'page') return 'html';
  if (kind === 'ppt') return 'pptx';
  if (kind === 'pdf') return 'pdf';
  if (kind === 'doc') return 'docx';
  return 'md';
}

function legacyDefaultResumePageSections(view: ResumeRequestView) {
  if (view === 'company') return ['公司概览', '重点项目分布', '候选人覆盖', '技术关键词', '风险与机会', 'AI综合分析'];
  if (view === 'project') return ['项目概览', '公司分布', '候选人参与', '技术关键词', '交付信号', 'AI综合分析'];
  if (view === 'skill') return ['技能概览', '候选人分布', '公司覆盖', '关联项目', '人才机会', 'AI综合分析'];
  return ['人才概览', '学历与背景', '公司经历', '项目经历', '核心能力', 'AI综合分析'];
}

function legacyBuildResumePageOutput(
  view: ResumeRequestView,
  documents: ParsedDocument[],
  envelope?: ReportTemplateEnvelope | null,
  displayProfiles: ResumeDisplayProfile[] = [],
): KnowledgePageOutput {
  const resumeEntries = buildResumePageEntries(documents, displayProfiles);
  const resumeViewDeps = getResumeViewDeps();
  const companyRows = view === 'company' ? buildResumeCompanyProjectRows(resumeEntries, resumeViewDeps) : [];
  const projectRows = view === 'project' ? buildResumeProjectRows(resumeEntries, resumeViewDeps) : [];
  const talentRows = view === 'talent' || view === 'generic' ? buildResumeTalentRows(resumeEntries) : [];
  const skillRows = view === 'skill' ? buildResumeSkillRows(resumeEntries, resumeViewDeps) : [];

  const effectiveRows = companyRows.length
    ? companyRows
    : projectRows.length
      ? projectRows
      : skillRows.length
        ? skillRows
        : talentRows;

  const primaryIndex = view === 'company' ? 0 : view === 'project' ? 0 : view === 'skill' ? 0 : 0;
  const companyCount = new Set(
    effectiveRows
      .map((row) => view === 'company' ? row[0] : view === 'project' ? row[1] : row[2] || row[0])
      .filter(Boolean),
  ).size;
  const candidateCount = new Set(
    effectiveRows
      .map((row) => view === 'company' ? row[1] : view === 'project' ? row[2] : view === 'skill' ? row[1] : row[0])
      .filter(Boolean),
  ).size;

  const cardLabel =
    view === 'skill'
      ? '技能条目'
      : view === 'project'
        ? '项目条目'
        : view === 'company'
          ? '公司条目'
          : '候选人条目';
  const summary = effectiveRows.length
    ? `当前基于库内 ${documents.length} 份简历整理出 ${effectiveRows.length} 条${cardLabel}，可直接用于招聘筛选、人才盘点和项目经验对比。`
    : '当前知识库中暂无足够的简历结构化结果可用于生成页面。';
  const sectionTitles = envelope?.pageSections?.length ? envelope.pageSections : defaultResumePageSections(view);
  const sections = alignSectionsToEnvelope([], sectionTitles, summary).map((section, index) => ({
    ...section,
    body: section.body
      || (
        index === 0
          ? summary
          : effectiveRows
              .slice(index - 1, index + 2)
              .map((row) => row.filter(Boolean).slice(0, 4).join(' | '))
              .filter(Boolean)
              .join('\n')
      ),
    bullets: section.bullets?.length
      ? section.bullets
      : effectiveRows
          .slice(index, index + 3)
          .map((row) => row.filter(Boolean)[primaryIndex])
          .filter(Boolean) as string[],
  }));

  const chartTitle =
    view === 'skill'
      ? '技能覆盖分布'
      : view === 'project'
        ? '项目覆盖分布'
        : view === 'company'
          ? '公司覆盖分布'
          : '候选人覆盖分布';

  return {
    type: 'page',
    title: envelope?.title
      || (
        view === 'company'
          ? '简历公司维度 IT 项目静态页'
          : view === 'project'
            ? '简历项目维度静态页'
            : view === 'skill'
              ? '简历技能维度静态页'
              : '简历人才维度静态页'
      ),
    content: summary,
    format: 'html',
    page: {
      summary,
      cards: [
        { label: '简历数量', value: String(documents.length), note: '参与本次页面生成的简历文档数' },
        { label: cardLabel, value: String(effectiveRows.length), note: '当前页面抽取出的主要条目数' },
        { label: '公司覆盖', value: String(companyCount), note: '涉及的公司或组织数量' },
        { label: '候选人覆盖', value: String(candidateCount), note: '涉及的候选人数量' },
      ],
      sections,
      charts: [
        {
          title: chartTitle,
          items: effectiveRows.slice(0, 8).map((row) => ({
            label: row[primaryIndex] || '未命名',
            value: 1,
          })),
        },
      ],
    },
  };
}

function defaultResumePageSections(view: ResumeRequestView) {
  if (view === 'client') return ['客户概览', '代表候选人', '代表项目', '技能覆盖', '匹配建议', 'AI综合分析'];
  if (view === 'company') return ['公司概览', '重点项目分布', '候选人覆盖', '技术关键词', '风险与机会', 'AI综合分析'];
  if (view === 'project') return ['项目概览', '公司分布', '候选人参与', '技术关键词', '交付信号', 'AI综合分析'];
  if (view === 'skill') return ['技能概览', '候选人分布', '公司覆盖', '关联项目', '人才机会', 'AI综合分析'];
  return ['人才概览', '学历与背景', '公司经历', '项目经历', '核心能力', 'AI综合分析'];
}

function buildResumePageOutput(
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

function hydrateResumePageVisualShell(
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

function buildFallbackTableOutput(title: string, content: string, envelope?: ReportTemplateEnvelope | null): ChatOutput {
  const fallbackColumns = envelope?.tableColumns?.length ? envelope.tableColumns : ['结论', '说明', '证据来源'];
  const fallbackRow =
    fallbackColumns.length === 1
      ? [content]
      : [
          content || '当前未能稳定提取更多结构化条目。',
          '可继续补充更明确的筛选条件或模板全名。',
          '知识库当前证据',
        ];

  return {
    type: 'table',
    title,
    content,
    format: 'csv',
    table: {
      title,
      subtitle: '根据知识库内容整理',
      columns: fallbackColumns,
      rows: [alignRowsToColumns([fallbackRow], fallbackColumns)[0]],
    },
  };
}

function buildFallbackPageOutput(
  title: string,
  content: string,
  envelope?: ReportTemplateEnvelope | null,
): KnowledgePageOutput {
  const summary = content || '当前未能稳定提取更多可展示的知识库内容。';
  const sections = (envelope?.pageSections || DEFAULT_PAGE_SECTIONS).map((sectionTitle, index) => ({
    title: sectionTitle,
    body: index === 0 ? summary : '',
    bullets: [],
  }));

  return {
    type: 'page',
    title,
    content: summary,
    format: 'html',
    page: {
      summary,
      cards: [],
      sections,
      charts: [],
    },
  };
}

function buildGenericFallbackOutput(
  kind: 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md',
  requestText: string,
  rawContent: string,
  envelope?: ReportTemplateEnvelope | null,
): ChatOutput {
  const title = envelope?.title || buildDefaultTitle(kind);
  const content = sanitizeText(rawContent) || sanitizeText(requestText) || '当前未能稳定提取更多结构化结果。';

  if (isNarrativeOutputKind(kind)) {
    const page = buildFallbackPageOutput(title, content, envelope);
    return wrapPageOutputAsKind(kind, page);
  }

  return buildFallbackTableOutput(title, content, envelope);
}

export function buildKnowledgeMissMessage(libraries: Array<{ key: string; label: string }>) {
  if (libraries.length) {
    return `当前已尝试知识库：${libraries.map((item) => item.label).join('、')}。\n\n这次没有检索到足够的知识库证据，暂不生成结果。请换一种更明确的知识库表述，或先补充相关文档。`;
  }
  return '当前没有稳定命中的知识库，暂不生成结果。请先说明要基于哪个知识库输出。';
}

export function buildReportInstruction(kind: 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md') {
  if (kind === 'page') {
    return [
      '只输出 JSON。',
      'Schema:',
      '{"title":"...","content":"...","page":{"summary":"...","cards":[{"label":"...","value":"...","note":"..."}],"sections":[{"title":"...","body":"...","bullets":["..."]}],"charts":[{"title":"...","items":[{"label":"...","value":12}]}]}}',
      '所有内容必须使用自然中文。',
    ].join('\n');
  }

  if (kind === 'pdf' || kind === 'ppt' || kind === 'doc' || kind === 'md') {
    return [
      '只输出 JSON。',
      'Schema:',
      '{"title":"...","content":"...","page":{"summary":"...","sections":[{"title":"...","body":"...","bullets":["..."]}]}}',
      '所有内容必须使用自然中文。',
    ].join('\n');
  }

  return [
    '只输出 JSON。',
    'Schema:',
    '{"title":"...","content":"...","table":{"title":"...","subtitle":"...","columns":["..."],"rows":[["...","..."]]}}',
    '所有内容必须使用自然中文。',
  ].join('\n');
}

export function buildKnowledgeFallbackOutput(
  kind: 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md',
  requestText: string,
  documents: ParsedDocument[],
  envelope?: ReportTemplateEnvelope | null,
  displayProfiles: ResumeDisplayProfile[] = [],
): ChatOutput {
  const resumeViewDeps = getResumeViewDeps();
  const view = resolveResumeRequestView(requestText, resumeViewDeps);
  const resumeDocuments = documents.filter((item) => item.schemaType === 'resume');
  const resumeEntries = resumeDocuments.length ? buildResumePageEntries(resumeDocuments, displayProfiles) : [];
  const footfallOutputDeps = getFootfallOutputDeps();
  const footfallDocuments = documents.filter((item) => isFootfallReportDocument(item, footfallOutputDeps));
  const orderOutputDeps = getOrderOutputDeps();
  const orderDocuments = documents.filter((item) => isOrderInventoryDocument(item, orderOutputDeps));
  const orderView = orderDocuments.length ? resolveOrderRequestView(requestText, orderOutputDeps) : 'generic';

  if (resumeDocuments.length) {
    if (isNarrativeOutputKind(kind)) {
      const page = buildResumePageOutput(view, resumeDocuments, envelope, displayProfiles);
      return wrapPageOutputAsKind(kind, page);
    }

    if (kind === 'table') {
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
    }
  }

  if (footfallDocuments.length) {
    if (isNarrativeOutputKind(kind)) {
      const page = buildFootfallPageOutput(footfallDocuments, envelope, footfallOutputDeps);
      return wrapPageOutputAsKind(kind, page);
    }

    if (kind === 'table') {
      return buildFootfallTableOutput(footfallDocuments, envelope, footfallOutputDeps);
    }
  }

  if (orderDocuments.length && isNarrativeOutputKind(kind)) {
    const page = buildOrderPageOutput(orderView, orderDocuments, envelope, orderOutputDeps);
    return wrapPageOutputAsKind(kind, page);
  }

  return buildGenericFallbackOutput(kind, requestText, '', envelope);
}

export function normalizeReportOutput(
  kind: 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md',
  requestText: string,
  rawContent: string,
  envelope?: ReportTemplateEnvelope | null,
  documents: ParsedDocument[] = [],
  displayProfiles: ResumeDisplayProfile[] = [],
  options: NormalizeReportOutputOptions = {},
): ChatOutput {
  const parsed = tryParseJsonPayload(rawContent);
  const root = isObject(parsed) ? parsed : {};
  const payload = pickNestedObject(root, [['output'], ['report'], ['result'], ['data']]) || root;
  const embeddedPayload = extractEmbeddedStructuredPayload(
    payload.content,
    payload.summary,
    root.content,
    root.summary,
  );
  const effectivePayload = embeddedPayload || payload;
  const generatedTitle = pickString(effectivePayload.title, payload.title, root.title);
  const title = pickString(generatedTitle, envelope?.title, buildDefaultTitle(kind));
  const content = pickString(
    effectivePayload.content,
    effectivePayload.summary,
    payload.content,
    payload.summary,
    root.content,
    rawContent,
  );

  if (isNarrativeOutputKind(kind)) {
    const wrapperPageSource = pickNestedObject(payload, [['page']]) || pickNestedObject(root, [['page']]) || payload;
    const nestedPagePayload = extractEmbeddedStructuredPayload(
      isObject(wrapperPageSource) ? wrapperPageSource.summary : null,
      isObject(wrapperPageSource) ? wrapperPageSource.body : null,
      isObject(wrapperPageSource) ? wrapperPageSource.content : null,
      payload.content,
      payload.summary,
      root.content,
      root.summary,
    );
    const pageSource =
      pickNestedObject(nestedPagePayload || effectivePayload, [['page']])
      || nestedPagePayload
      || pickNestedObject(effectivePayload, [['page']])
      || wrapperPageSource;
    const supplyEchoSource = looksLikeKnowledgeSupplyPayload(pageSource)
      ? pageSource
      : looksLikeKnowledgeSupplyPayload(effectivePayload)
        ? effectivePayload
        : looksLikeKnowledgeSupplyPayload(root)
          ? root
          : null;

    if (supplyEchoSource) {
      return buildSupplyEchoPageOutput(kind, title, supplyEchoSource, envelope, DEFAULT_PAGE_SECTIONS);
    }

    const summary = pickString(pageSource.summary, effectivePayload.summary, payload.summary, root.summary, content);
    const cards = normalizeCards(pageSource.cards || effectivePayload.cards || payload.cards || root.cards);
    const rawSections = normalizeSections(pageSource.sections || effectivePayload.sections || payload.sections || root.sections);
    const alignedSections = envelope?.pageSections?.length
      ? alignSectionsToEnvelope(rawSections, envelope.pageSections, summary)
      : rawSections;
    const charts = applyPlannedDatavizSlots(
      normalizeCharts(pageSource.charts || effectivePayload.charts || payload.charts || root.charts),
      options.datavizSlots || [],
    );
    const effectiveSections = alignedSections.length ? alignedSections : rawSections;
    const normalizedPageSpec = normalizeReportPlanPageSpec(options.pageSpec) || undefined;
    const plannedSections = applyPageSpecSectionDisplayModes(
      alignedSections.length
        ? alignedSections
        : (envelope?.pageSections || []).map((sectionTitle, index) => ({
            title: sectionTitle,
            body: index === 0 ? summary : '',
            bullets: [],
            displayMode: '',
          })),
      normalizedPageSpec || null,
    );
    const resumeDocuments = documents.filter((item) => item.schemaType === 'resume');
    const footfallOutputDeps = getFootfallOutputDeps();
    const footfallDocuments = documents.filter((item) => isFootfallReportDocument(item, footfallOutputDeps));
    const orderOutputDeps = getOrderOutputDeps();
    const orderDocuments = documents.filter((item) => isOrderInventoryDocument(item, orderOutputDeps));
    const resumeViewDeps = getResumeViewDeps();
    const resumeView = resumeDocuments.length ? resolveResumeRequestView(requestText, resumeViewDeps) : 'generic';
    const orderView = orderDocuments.length ? resolveOrderRequestView(requestText, orderOutputDeps) : 'generic';
    const layoutPolishDeps = getLayoutPolishDeps();

    if (looksLikePromptEchoPage(requestText, summary, content, cards, effectiveSections)) {
      if (footfallDocuments.length) {
        return buildKnowledgeFallbackOutput(kind, requestText, footfallDocuments, envelope, displayProfiles);
      }
      if (orderDocuments.length) {
        return buildKnowledgeFallbackOutput(kind, requestText, orderDocuments, envelope, displayProfiles);
      }
      if (resumeDocuments.length) {
        return buildKnowledgeFallbackOutput(kind, requestText, resumeDocuments, envelope, displayProfiles);
      }
      return buildPromptEchoFallbackOutput(kind, title, requestText, envelope, DEFAULT_PAGE_SECTIONS);
    }
    const fallbackNarrativeTitle = resumeDocuments.length
      ? buildResumePageTitle(resumeView, envelope, getResumePageCopyDeps())
      : footfallDocuments.length
        ? buildFootfallPageOutput(footfallDocuments, envelope, footfallOutputDeps).title
        : orderDocuments.length
          ? buildOrderPageOutput(orderView, orderDocuments, envelope, orderOutputDeps).title
          : buildLayoutVariantPageTitle(normalizedPageSpec?.layoutVariant, envelope, layoutPolishDeps);
    const normalizedTitle = resolvePreferredNarrativeTitle({
      generatedTitle,
      requestText,
      fallbackTitle: fallbackNarrativeTitle,
    }, layoutPolishDeps);

    const normalizedOutput: Exclude<ChatOutput, { type: 'answer' }> = {
      type: kind === 'page' ? 'page' : kind,
      title: normalizedTitle,
      content: content || summary,
      format: resolveNarrativeOutputFormat(kind),
      page: {
        summary,
        cards,
        sections: plannedSections,
        datavizSlots: normalizeReportPlanDatavizSlots(options.datavizSlots),
        pageSpec: normalizedPageSpec,
        charts,
      },
    };

    if (resumeDocuments.length && normalizedOutput.page) {
      normalizedOutput.page = hydrateResumePageVisualShell(
        resumeView,
        resumeDocuments,
        envelope,
        displayProfiles,
        normalizedOutput.page,
      );
    }

    if (!resumeDocuments.length && footfallDocuments.length && normalizedOutput.page) {
      normalizedOutput.page = hydrateFootfallPageVisualShell(
        footfallDocuments,
        envelope,
        normalizedOutput.page,
        footfallOutputDeps,
      );
    }

    if (!resumeDocuments.length && !footfallDocuments.length && orderDocuments.length && normalizedOutput.page) {
      normalizedOutput.page = hydrateOrderPageVisualShell(
        orderView,
        orderDocuments,
        envelope,
        normalizedOutput.page,
        orderOutputDeps,
      );
    }

    if (!resumeDocuments.length && !footfallDocuments.length && !orderDocuments.length && normalizedOutput.page) {
      normalizedOutput.page = polishLayoutVariantPageCopy(
        normalizedOutput.page,
        normalizedPageSpec?.layoutVariant,
        layoutPolishDeps,
      );
    }

    if (normalizedOutput.page && (!normalizedOutput.content || looksLikeJsonEchoText(normalizedOutput.content))) {
      normalizedOutput.content = normalizedOutput.page.summary || normalizedOutput.content;
    }

    if (resumeDocuments.length && normalizedOutput.page && options.allowResumeFallback !== false) {
      if (shouldUseResumePageFallback(resumeView, normalizedOutput.title, normalizedOutput.page)) {
        return buildKnowledgeFallbackOutput(kind, requestText, resumeDocuments, envelope, displayProfiles);
      }
    }

    return normalizedOutput;
  }

  const tableSource =
    pickNestedObject(payload, [['table']])
    || pickNestedObject(root, [['table']])
    || payload;
  const resumeDocuments = documents.filter((item) => item.schemaType === 'resume');
  const footfallOutputDeps = getFootfallOutputDeps();
  const footfallDocuments = documents.filter((item) => isFootfallReportDocument(item, footfallOutputDeps));
  const orderOutputDeps = getOrderOutputDeps();
  const orderDocuments = documents.filter((item) => isOrderInventoryDocument(item, orderOutputDeps));
  const normalizedRawContent = normalizeText(rawContent);
  if (normalizedRawContent && normalizedRawContent === normalizeText(requestText)) {
    if (footfallDocuments.length) {
      return buildKnowledgeFallbackOutput(kind, requestText, footfallDocuments, envelope, displayProfiles);
    }
    if (orderDocuments.length) {
      return buildKnowledgeFallbackOutput(kind, requestText, orderDocuments, envelope, displayProfiles);
    }
    if (resumeDocuments.length) {
      return buildKnowledgeFallbackOutput(kind, requestText, resumeDocuments, envelope, displayProfiles);
    }
  }

  const candidateColumns = normalizeColumnNames(sanitizeStringArray(
    (isObject(tableSource) ? tableSource.columns : undefined)
    || payload.columns
    || root.columns
    || payload.headers
    || root.headers,
  ));

  const preferredColumns = envelope?.tableColumns?.length ? envelope.tableColumns : candidateColumns;
  const tableRowsInput =
    (isObject(tableSource) ? tableSource.rows : undefined)
    || (isObject(tableSource) ? tableSource.items : undefined)
    || (isObject(tableSource) ? tableSource.records : undefined)
    || payload.rows
    || payload.items
    || payload.records
    || root.rows
    || root.items
    || root.records;

  const { columns: objectColumns, rows } = sanitizeRows(tableRowsInput, preferredColumns);
  const finalColumns = normalizeColumnNames(envelope?.tableColumns?.length ? envelope.tableColumns : objectColumns);
  const finalRows = alignRowsToColumns(rows, finalColumns);
  const tableTitle = pickString(
    isObject(tableSource) ? tableSource.title : '',
    payload.tableTitle,
    root.tableTitle,
    title,
  );
  const tableSubtitle = pickString(
    isObject(tableSource) ? tableSource.subtitle : '',
    payload.subtitle,
    root.subtitle,
    '根据知识库整理',
  );

  if (!finalColumns.length || !finalRows.length) {
    return buildGenericFallbackOutput(kind, requestText, rawContent, envelope);
  }

  return {
    type: 'table',
    title,
    content,
    format: 'csv',
    table: {
      title: tableTitle,
      subtitle: tableSubtitle,
      columns: finalColumns,
      rows: finalRows,
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
  const view = resolveResumeRequestView(requestText, getResumeViewDeps());
  return shouldUseResumePageFallback(view, output.title, output.page);
}
