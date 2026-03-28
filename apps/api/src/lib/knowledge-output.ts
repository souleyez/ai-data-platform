import type { ParsedDocument } from './document-parser.js';
import type { ReportTemplateEnvelope } from './report-center.js';

export type ChatOutput =
  | { type: 'answer'; content: string }
  | {
      type: 'table' | 'page' | 'pdf' | 'ppt';
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
        sections?: Array<{ title?: string; body?: string; bullets?: string[] }>;
        charts?: Array<{ title?: string; items?: Array<{ label?: string; value?: number }> }>;
      } | null;
    };

type JsonRecord = Record<string, unknown>;
type ResumeRequestView = 'generic' | 'company' | 'project' | 'talent' | 'skill';
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

function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function isObject(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildDefaultTitle(kind: 'table' | 'page' | 'pdf' | 'ppt') {
  if (kind === 'page') return '知识库静态页';
  if (kind === 'ppt') return '知识库PPT';
  if (kind === 'pdf') return '知识库文档';
  return '知识库表格';
}

function sanitizeText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function sanitizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => sanitizeText(item)).filter(Boolean);
}

function tryParseJsonPayload(content: string) {
  const raw = String(content || '').trim();
  if (!raw) return null;

  const candidates = [
    raw,
    ...(raw.match(/```json\s*([\s\S]*?)```/gi) || []).map((item) => item.replace(/```json|```/gi, '').trim()),
    ...(raw.match(/```[\s\S]*?```/gi) || []).map((item) => item.replace(/```/g, '').trim()),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      const firstBrace = candidate.indexOf('{');
      const lastBrace = candidate.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
          return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
        } catch {
          // continue
        }
      }
    }
  }

  return null;
}

function pickNestedObject(root: JsonRecord, paths: string[][]) {
  for (const path of paths) {
    let current: unknown = root;
    let matched = true;
    for (const key of path) {
      if (!isObject(current) || !(key in current)) {
        matched = false;
        break;
      }
      current = current[key];
    }
    if (matched && isObject(current)) {
      return current;
    }
  }
  return null;
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    const text = sanitizeText(value);
    if (text) return text;
  }
  return '';
}

function normalizeCards(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isObject)
    .map((item) => ({
      label: sanitizeText(item.label),
      value: sanitizeText(item.value),
      note: sanitizeText(item.note),
    }))
    .filter((item) => item.label || item.value || item.note);
}

function normalizeSections(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isObject)
    .map((item) => ({
      title: sanitizeText(item.title),
      body: sanitizeText(item.body || item.content || item.summary),
      bullets: sanitizeStringArray(item.bullets || item.points || item.items),
    }))
    .filter((item) => item.title || item.body || item.bullets.length);
}

function normalizeCharts(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isObject)
    .map((item) => ({
      title: sanitizeText(item.title),
      items: Array.isArray(item.items)
        ? item.items
            .filter(isObject)
            .map((entry) => ({
              label: sanitizeText(entry.label),
              value: Number(entry.value || 0),
            }))
            .filter((entry) => entry.label)
        : [],
    }))
    .filter((item) => item.title || item.items.length);
}

function normalizeColumnNames(columns: string[]) {
  return columns.map((item) => sanitizeText(item)).filter(Boolean);
}

function normalizeObjectKeys(row: JsonRecord) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeText(key), value]),
  );
}

function deriveColumnsFromObjectRows(rows: JsonRecord[]) {
  const orderedKeys: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      const normalized = sanitizeText(key);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      orderedKeys.push(normalized);
    }
  }
  return orderedKeys;
}

function sanitizeRows(value: unknown, targetColumns: string[]) {
  if (!Array.isArray(value)) return { columns: targetColumns, rows: [] as string[][] };

  const arrayRows = value.filter((entry) => Array.isArray(entry)) as unknown[][];
  if (arrayRows.length) {
    const rows = arrayRows.map((row) => row.map((cell) => sanitizeText(cell)));
    return { columns: targetColumns, rows };
  }

  const objectRows = value.filter(isObject) as JsonRecord[];
  if (!objectRows.length) {
    return { columns: targetColumns, rows: [] as string[][] };
  }

  const columns = targetColumns.length ? targetColumns : deriveColumnsFromObjectRows(objectRows);
  const normalizedColumns = columns.map((column) => sanitizeText(column)).filter(Boolean);
  const rows = objectRows.map((row) => {
    const normalizedRow = normalizeObjectKeys(row);
    return normalizedColumns.map((column) => {
      const direct = row[column];
      if (direct != null) return sanitizeText(direct);
      const byNormalized = normalizedRow[normalizeText(column)];
      if (byNormalized != null) return sanitizeText(byNormalized);
      return '';
    });
  });

  return { columns: normalizedColumns, rows };
}

function alignRowsToColumns(rows: string[][], columns: string[]) {
  return rows.map((row) => {
    if (row.length === columns.length) return row;
    if (row.length > columns.length) return row.slice(0, columns.length);
    return [...row, ...new Array(columns.length - row.length).fill('')];
  });
}

function alignSectionsToEnvelope(
  sections: Array<{ title?: string; body?: string; bullets?: string[] }>,
  envelopeSections: string[],
  summary: string,
) {
  if (!envelopeSections.length) return sections;

  const unused = [...sections];
  return envelopeSections.map((title, index) => {
    const normalizedTitle = normalizeText(title);
    const exactIndex = unused.findIndex((item) => normalizeText(item.title || '') === normalizedTitle);
    const fuzzyIndex = exactIndex >= 0
      ? exactIndex
      : unused.findIndex((item) => {
          const itemTitle = normalizeText(item.title || '');
          return itemTitle && (itemTitle.includes(normalizedTitle) || normalizedTitle.includes(itemTitle));
        });
    const matched = fuzzyIndex >= 0 ? unused.splice(fuzzyIndex, 1)[0] : undefined;
    return {
      title,
      body: matched?.body || (index === 0 ? summary : ''),
      bullets: matched?.bullets || [],
    };
  });
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => sanitizeText(item)).filter(Boolean);
}

function getResumeProfile(item: ParsedDocument) {
  return (item.structuredProfile || {}) as Record<string, unknown>;
}

function hasCompanySignal(text: string) {
  return containsAny(text, ['company', 'employer', 'organization', '公司', '雇主']);
}

function hasProjectSignal(text: string) {
  return containsAny(text, [
    'project',
    'projects',
    'system',
    'systems',
    'platform',
    'platforms',
    'api',
    'implementation',
    'delivery',
    'architecture',
    '项目',
    '系统',
    '平台',
    '接口',
    '实施',
    '交付',
    '架构',
    'it',
  ]);
}

function hasSkillSignal(text: string) {
  return containsAny(text, [
    'skill',
    'skills',
    'ability',
    'abilities',
    'tech stack',
    'technology',
    '技术栈',
    '技能',
    '能力',
    '核心能力',
    '关键技能',
  ]);
}

function hasTalentSignal(text: string) {
  return containsAny(text, [
    'talent',
    'candidate',
    'candidates',
    'people',
    'person',
    '人才',
    '候选人',
    '人员',
    '画像',
    '学历',
    '工作经历',
  ]);
}

function detectResumeRequestView(requestText: string): ResumeRequestView {
  const text = normalizeText(requestText);

  if (containsAny(text, ['人才维度', '候选人维度', '人才画像', '候选人画像', '按人才', '按候选人'])) {
    return 'talent';
  }
  if (hasSkillSignal(text)) return 'skill';
  if (hasCompanySignal(text) && hasProjectSignal(text)) return 'company';
  if (hasProjectSignal(text)) return 'project';
  if (hasTalentSignal(text)) return 'talent';
  return 'generic';
}

function extractProjectRole(text: string) {
  const source = sanitizeText(text);
  const match = source.match(/(负责[^，。；]{2,24}|担任[^，。；]{2,24}|主导[^，。；]{2,24}|参与[^，。；]{2,24}|牵头[^，。；]{2,24})/);
  return match?.[1] || '';
}

function extractProjectTimeline(text: string) {
  const source = sanitizeText(text);
  const match = source.match(/((?:20\d{2}|19\d{2})[./-]?\d{0,2}(?:\s*[~-]\s*(?:(?:20\d{2})[./-]?\d{0,2}|至今|现在))?)/);
  return match?.[1] || '';
}

function extractTechKeywords(text: string) {
  const source = sanitizeText(text).toLowerCase();
  const keywords = [
    'sap', 'erp', 'crm', 'mes', 'wms', 'bi', 'api', 'java', 'python', 'go', 'c#', 'sql',
    'mysql', 'oracle', 'postgresql', 'redis', 'kafka', 'docker', 'kubernetes', 'aws', 'azure',
    '阿里云', '腾讯云', '系统', '平台', '接口', '数据中台', '供应链', '实施', '开发', '架构', 'iot',
  ];
  const matches = keywords.filter((keyword) => source.includes(keyword.toLowerCase()));
  return [...new Set(matches)].slice(0, 6).join(' / ');
}

function buildResumeCompanyProjectRows(documents: ParsedDocument[]) {
  const rows: Array<Array<string>> = [];

  for (const item of documents) {
    if (item.schemaType !== 'resume') continue;
    const profile = getResumeProfile(item);
    const candidate = sanitizeText(profile.candidateName || item.title || item.name) || item.name;
    const companies = toStringArray(profile.companies).length
      ? toStringArray(profile.companies)
      : [sanitizeText(profile.latestCompany)].filter(Boolean);
    const projectHighlights = toStringArray(profile.itProjectHighlights).length
      ? toStringArray(profile.itProjectHighlights)
      : toStringArray(profile.projectHighlights);
    const effectiveCompanies = companies.length ? companies.slice(0, 4) : [UNKNOWN_COMPANY];
    const effectiveProjects = projectHighlights.length
      ? projectHighlights.slice(0, 6)
      : toStringArray(profile.highlights)
          .filter((entry) => /(项目|系统|平台|接口|开发|实施|架构|技术|it|api|platform|system)/i.test(entry))
          .slice(0, 4);

    if (!effectiveProjects.length) {
      rows.push([
        effectiveCompanies[0],
        candidate,
        '未提取到明确 IT 项目',
        '',
        toStringArray(profile.skills).slice(0, 6).join(' / '),
        '',
        item.name,
      ]);
      continue;
    }

    for (const company of effectiveCompanies) {
      for (const project of effectiveProjects) {
        rows.push([
          company,
          candidate,
          project,
          extractProjectRole(project),
          extractTechKeywords(project) || toStringArray(profile.skills).slice(0, 6).join(' / '),
          extractProjectTimeline(project),
          item.name,
        ]);
      }
    }
  }

  const seen = new Set<string>();
  return rows
    .filter((row) => {
      const key = row.join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 36);
}

function buildResumeProjectRows(documents: ParsedDocument[]) {
  const rows: Array<Array<string>> = [];
  for (const item of documents) {
    if (item.schemaType !== 'resume') continue;
    const profile = getResumeProfile(item);
    const candidate = sanitizeText(profile.candidateName || item.title || item.name) || item.name;
    const company = sanitizeText(profile.latestCompany) || toStringArray(profile.companies)[0] || UNKNOWN_COMPANY;
    const projects = toStringArray(profile.itProjectHighlights).length
      ? toStringArray(profile.itProjectHighlights)
      : toStringArray(profile.projectHighlights);
    for (const project of projects.slice(0, 6)) {
      rows.push([
        project,
        company,
        candidate,
        extractProjectRole(project),
        extractTechKeywords(project) || toStringArray(profile.skills).slice(0, 6).join(' / '),
        extractProjectTimeline(project),
        item.name,
      ]);
    }
  }
  return rows.slice(0, 36);
}

function buildResumeTalentRows(documents: ParsedDocument[]) {
  return documents
    .filter((item) => item.schemaType === 'resume')
    .map((item) => {
      const profile = getResumeProfile(item);
      return [
        sanitizeText(profile.candidateName || item.title || item.name) || item.name,
        sanitizeText(profile.education),
        sanitizeText(profile.latestCompany),
        toStringArray(profile.skills).slice(0, 6).join(' / '),
        sanitizeText(profile.age),
        sanitizeText(profile.yearsOfExperience),
        toStringArray(profile.projectHighlights).slice(0, 2).join('；'),
        item.name,
      ];
    })
    .filter((row) => row.some(Boolean))
    .slice(0, 36);
}

function buildResumeSkillRows(documents: ParsedDocument[]) {
  const rows: Array<Array<string>> = [];
  for (const item of documents) {
    if (item.schemaType !== 'resume') continue;
    const profile = getResumeProfile(item);
    const candidate = sanitizeText(profile.candidateName || item.title || item.name) || item.name;
    const latestCompany = sanitizeText(profile.latestCompany) || toStringArray(profile.companies)[0] || UNKNOWN_COMPANY;
    const projects = toStringArray(profile.itProjectHighlights).length
      ? toStringArray(profile.itProjectHighlights)
      : toStringArray(profile.projectHighlights);
    for (const skill of toStringArray(profile.skills).slice(0, 8)) {
      rows.push([
        skill,
        candidate,
        skill,
        latestCompany,
        projects.slice(0, 2).join('；'),
        item.name,
      ]);
    }
  }
  return rows.slice(0, 40);
}

function defaultResumePageSections(view: ResumeRequestView) {
  if (view === 'company') return ['公司概览', '重点项目分布', '候选人覆盖', '技术关键词', '风险与机会', 'AI综合分析'];
  if (view === 'project') return ['项目概览', '公司分布', '候选人参与', '技术关键词', '交付信号', 'AI综合分析'];
  if (view === 'skill') return ['技能概览', '候选人分布', '公司覆盖', '关联项目', '人才机会', 'AI综合分析'];
  return ['人才概览', '学历与背景', '公司经历', '项目经历', '核心能力', 'AI综合分析'];
}

function buildResumePageOutput(view: ResumeRequestView, documents: ParsedDocument[], envelope?: ReportTemplateEnvelope | null): KnowledgePageOutput {
  const companyRows = view === 'company' ? buildResumeCompanyProjectRows(documents) : [];
  const projectRows = view === 'project' ? buildResumeProjectRows(documents) : [];
  const talentRows = view === 'talent' || view === 'generic' ? buildResumeTalentRows(documents) : [];
  const skillRows = view === 'skill' ? buildResumeSkillRows(documents) : [];

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

function wrapPageOutputAsKind(kind: 'page' | 'pdf' | 'ppt', page: KnowledgePageOutput): ChatOutput {
  if (kind === 'page') return page;
  return {
    type: kind,
    title: page.title,
    content: page.content,
    format: kind,
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
  kind: 'table' | 'page' | 'pdf' | 'ppt',
  requestText: string,
  rawContent: string,
  envelope?: ReportTemplateEnvelope | null,
): ChatOutput {
  const title = envelope?.title || buildDefaultTitle(kind);
  const content = sanitizeText(rawContent) || sanitizeText(requestText) || '当前未能稳定提取更多结构化结果。';

  if (kind === 'page' || kind === 'pdf' || kind === 'ppt') {
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

export function buildReportInstruction(kind: 'table' | 'page' | 'pdf' | 'ppt') {
  if (kind === 'page') {
    return [
      '只输出 JSON。',
      'Schema:',
      '{"title":"...","content":"...","page":{"summary":"...","cards":[{"label":"...","value":"...","note":"..."}],"sections":[{"title":"...","body":"...","bullets":["..."]}],"charts":[{"title":"...","items":[{"label":"...","value":12}]}]}}',
      '所有内容必须使用自然中文。',
    ].join('\n');
  }

  if (kind === 'pdf' || kind === 'ppt') {
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
  kind: 'table' | 'page' | 'pdf' | 'ppt',
  requestText: string,
  documents: ParsedDocument[],
  envelope?: ReportTemplateEnvelope | null,
): ChatOutput {
  const view = detectResumeRequestView(requestText);
  const resumeDocuments = documents.filter((item) => item.schemaType === 'resume');

  if (resumeDocuments.length) {
    if (kind === 'page' || kind === 'pdf' || kind === 'ppt') {
      const page = buildResumePageOutput(view, resumeDocuments, envelope);
      return wrapPageOutputAsKind(kind, page);
    }

    if (kind === 'table') {
      if (view === 'company') {
        const rows = buildResumeCompanyProjectRows(resumeDocuments);
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
        const rows = buildResumeProjectRows(resumeDocuments);
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
        const rows = buildResumeSkillRows(resumeDocuments);
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
        const rows = buildResumeTalentRows(resumeDocuments);
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

  return buildGenericFallbackOutput(kind, requestText, '', envelope);
}

export function normalizeReportOutput(
  kind: 'table' | 'page' | 'pdf' | 'ppt',
  requestText: string,
  rawContent: string,
  envelope?: ReportTemplateEnvelope | null,
): ChatOutput {
  const parsed = tryParseJsonPayload(rawContent);
  const root = isObject(parsed) ? parsed : {};
  const payload = pickNestedObject(root, [['output'], ['report'], ['result'], ['data']]) || root;
  const title = pickString(envelope?.title, payload.title, root.title, buildDefaultTitle(kind));
  const content = pickString(payload.content, root.content, rawContent);

  if (kind === 'page' || kind === 'pdf' || kind === 'ppt') {
    const pageSource = pickNestedObject(payload, [['page']]) || pickNestedObject(root, [['page']]) || payload;
    const summary = pickString(pageSource.summary, payload.summary, root.summary, content);
    const cards = normalizeCards(pageSource.cards || payload.cards || root.cards);
    const rawSections = normalizeSections(pageSource.sections || payload.sections || root.sections);
    const alignedSections = envelope?.pageSections?.length
      ? alignSectionsToEnvelope(rawSections, envelope.pageSections, summary)
      : rawSections;
    const charts = normalizeCharts(pageSource.charts || payload.charts || root.charts);

    return {
      type: kind === 'page' ? 'page' : kind,
      title,
      content: content || summary,
      format: kind === 'page' ? 'html' : kind,
      page: {
        summary,
        cards,
        sections: alignedSections.length
          ? alignedSections
          : (envelope?.pageSections || []).map((sectionTitle, index) => ({
              title: sectionTitle,
              body: index === 0 ? summary : '',
              bullets: [],
            })),
        charts,
      },
    };
  }

  const tableSource =
    pickNestedObject(payload, [['table']])
    || pickNestedObject(root, [['table']])
    || payload;

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
