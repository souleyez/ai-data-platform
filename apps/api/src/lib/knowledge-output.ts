import type { ParsedDocument, ResumeFields } from './document-parser.js';
import { isLikelyResumePersonName } from './document-schema.js';
import type { ReportTemplateEnvelope } from './report-center.js';
import { sanitizeResumeDisplayCompany } from './resume-display-company.js';
import type { ResumeDisplayProfile } from './resume-display-profile-provider.js';
import { isWeakResumeCandidateName, mergeResumeFields } from './resume-canonicalizer.js';

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

export type NormalizeReportOutputOptions = {
  allowResumeFallback?: boolean;
};

type JsonRecord = Record<string, unknown>;
type ResumeRequestView = 'generic' | 'company' | 'project' | 'talent' | 'skill' | 'client';
type OrderRequestView = 'generic' | 'platform' | 'category' | 'stock';
type ResumePageEntry = {
  candidateName: string;
  education: string;
  latestCompany: string;
  yearsOfExperience: string;
  skills: string[];
  projectHighlights: string[];
  itProjectHighlights: string[];
  highlights: string[];
  expectedCity: string;
  expectedSalary: string;
  sourceName: string;
  sourceTitle: string;
  summary: string;
};
type ResumeShowcaseProject = {
  label: string;
  value: number;
  ownerName: string;
  ownerKey: string;
  company: string;
  companyKey: string;
  fit: string;
};
type ResumePageStats = {
  entries: ResumePageEntry[];
  candidateCount: number;
  companyCount: number;
  projectCount: number;
  skillCount: number;
  companies: Array<{ label: string; value: number }>;
  projects: Array<{ label: string; value: number }>;
  skills: Array<{ label: string; value: number }>;
  educations: Array<{ label: string; value: number }>;
  candidateLines: string[];
  companyLines: string[];
  projectLines: string[];
  skillLines: string[];
  salaryLines: string[];
  showcaseCandidateNames: string[];
  showcaseProjectLabels: string[];
  showcaseProjects: ResumeShowcaseProject[];
};
type OrderPageStats = {
  documentCount: number;
  channels: Array<{ label: string; value: number }>;
  categories: Array<{ label: string; value: number }>;
  metrics: Array<{ label: string; value: number }>;
  replenishment: Array<{ label: string; value: number }>;
  anomalies: Array<{ label: string; value: number }>;
  supportingLines: string[];
  platformAmounts: Array<{ label: string; value: number }>;
  categoryAmounts: Array<{ label: string; value: number }>;
  riskHighlights: string[];
  actionHighlights: string[];
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

const GENERIC_RESUME_PROJECT_LABELS = new Set(['平台', '系统', '项目', '方案', '销售方案', '系统搭建与上线']);

const STRICT_RESUME_GENERIC_PROJECT_LABELS = new Set([
  '\u5e73\u53f0',
  '\u7cfb\u7edf',
  '\u9879\u76ee',
  '\u65b9\u6848',
  '\u9500\u552e\u65b9\u6848',
  '\u7cfb\u7edf\u642d\u5efa\u4e0e\u4e0a\u7ebf',
  '\u4f18\u5316\u4e86\u5e73\u53f0',
]);
const STRICT_RESUME_SECTION_SPLIT_PATTERN =
  /\u5de5\u4f5c\u7ecf\u5386|\u6838\u5fc3\u80fd\u529b|\u6559\u80b2\u80cc\u666f|\u8054\u7cfb\u65b9\u5f0f/u;
const STRICT_RESUME_PROJECT_KEYWORD_PATTERN =
  /(?:\u9879\u76ee|project|\u7cfb\u7edf|\u5e73\u53f0|\u65b9\u6848|\u667a\u80fd|\u5ea7\u8231|\u6d88\u9632|\u56ed\u533a|aigc|\u7269\u8054\u7f51|\u4ea4\u4ed8|\u6539\u9020|\u8fd0\u8425|\u7535\u5546|\u98ce\u63a7|\u770b\u677f|\u4e2d\u53f0|\u7814\u53d1)/iu;
const STRICT_RESUME_PROJECT_SUFFIX_PATTERN =
  /([\u4e00-\u9fffA-Za-z0-9()（）\-/]{2,24}(?:\u9879\u76ee|project|\u7cfb\u7edf|\u5e73\u53f0|\u4e2d\u53f0|\u5c0f\u7a0b\u5e8f|APP|\u7f51\u7ad9|\u5546\u57ce|ERP|CRM|MES|WMS|SRM|BI|IoT|IOT|AIGC|AI))/iu;
const STRICT_RESUME_ACTION_LEAD_PATTERN =
  /^(?:\u8d1f\u8d23|\u53c2\u4e0e|\u534f\u52a9|\u7ef4\u62a4|\u8ddf\u8fdb|\u5236\u5b9a|\u5b8c\u6210|\u4f18\u5316|\u63a8\u8fdb|\u4e3b\u5bfc|\u5e26\u9886|\u7ba1\u7406|\u6d4b\u8bd5|\u652f\u6301|\u5b9e\u65bd|\u7f16\u5199|\u8bbe\u8ba1|\u5f00\u53d1|\u642d\u5efa|\u4e0a\u7ebf)/u;
const STRICT_RESUME_WEAK_PROJECT_DETAIL_PATTERN =
  /(?:\u5ba2\u6237\u5173\u7cfb|\u9879\u76ee\u8fdb\u5ea6|\u56de\u6b3e\u60c5\u51b5|\u7ed3\u7b97\u60c5\u51b5|\u9500\u552e\u65b9\u6848|\u9879\u76ee\u7acb\u9879|\u4ee3\u7801\u8d28\u91cf\u7ba1\u63a7|\u5f00\u53d1\u8fdb\u5ea6\u628a\u63a7|\u57f9\u8bad\u6280\u672f\u5458|\u6838\u5fc3\u529f\u80fd)/u;
const STRICT_RESUME_NOISY_HIGHLIGHT_PUNCTUATION_PATTERN = /[;；]/u;
const STRICT_RESUME_SENTENCE_END_PATTERN = /[。；;]/u;

function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ORDER_CHANNEL_LABEL_MAP = new Map<string, string>([
  ['tmall', 'Tmall'],
  ['jd', 'JD'],
  ['douyin', 'Douyin'],
  ['pinduoduo', 'Pinduoduo'],
  ['amazon', 'Amazon'],
  ['shopify', 'Shopify'],
]);

const ORDER_SIGNAL_LABEL_MAP = new Map<string, string>([
  ['yoy', '同比'],
  ['mom', '环比'],
  ['inventory', '库存'],
  ['inventory index', '库存指数'],
  ['inventory-index', '库存指数'],
  ['sell through', '动销'],
  ['sell-through', '动销'],
  ['gmv', 'GMV'],
  ['forecast', '预测'],
  ['trend', '趋势'],
  ['planning', '规划'],
  ['replenishment', '补货'],
  ['restock', '补货'],
  ['safety stock', '安全库存'],
  ['safety-stock', '安全库存'],
  ['anomaly', '异常'],
  ['volatility', '波动'],
  ['alert', '预警'],
  ['operating review', '经营复盘'],
  ['operating-review', '经营复盘'],
  ['exception', '异常'],
]);

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

function looksLikeStructuredReportPayload(value: unknown): value is JsonRecord {
  if (!isObject(value)) return false;
  return Boolean(
    isObject(value.page)
    || Array.isArray(value.cards)
    || Array.isArray(value.sections)
    || Array.isArray(value.charts)
    || Array.isArray(value.rows)
    || Array.isArray(value.columns)
    || sanitizeText(value.summary)
    || sanitizeText(value.content)
    || sanitizeText(value.title),
  );
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

function extractEmbeddedStructuredPayload(...values: unknown[]) {
  for (const value of values) {
    const candidate = typeof value === 'string' ? tryParseJsonPayload(value) : value;
    if (!isObject(candidate)) continue;
    const payload =
      pickNestedObject(candidate, [['output'], ['report'], ['result'], ['data']])
      || candidate;
    if (looksLikeStructuredReportPayload(payload)) {
      return payload;
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

function normalizeObjectArray(value: unknown) {
  if (!Array.isArray(value)) return [] as JsonRecord[];
  return value.filter(isObject) as JsonRecord[];
}

function looksLikeKnowledgeSupplyPayload(value: unknown): value is JsonRecord {
  if (!isObject(value)) return false;
  const hasScope = isObject(value.scope);
  const hasSupplyCollections = Array.isArray(value.documents) || Array.isArray(value.evidence) || Array.isArray(value.gaps);
  const hasGuidance = isObject(value.templateGuidance) || isObject(value.conceptPage);
  const hasReportShape =
    isObject(value.page)
    || isObject(value.table)
    || Array.isArray(value.sections)
    || Array.isArray(value.cards)
    || Array.isArray(value.rows)
    || Array.isArray(value.columns);
  return hasScope && (hasSupplyCollections || hasGuidance) && !hasReportShape;
}

function extractSupplySectionTitles(payload: JsonRecord, envelope?: ReportTemplateEnvelope | null) {
  if (envelope?.pageSections?.length) return envelope.pageSections;

  const conceptPage = isObject(payload.conceptPage) ? payload.conceptPage : {};
  const templateGuidance = isObject(payload.templateGuidance) ? payload.templateGuidance : {};
  const conceptSections = sanitizeStringArray(conceptPage.recommendedSections);
  if (conceptSections.length) return conceptSections;

  const preferredSections = sanitizeStringArray(templateGuidance.preferredSections);
  if (preferredSections.length) return preferredSections;

  return DEFAULT_PAGE_SECTIONS;
}

function extractSupplyLibraries(payload: JsonRecord) {
  const scope = isObject(payload.scope) ? payload.scope : {};
  return normalizeObjectArray(scope.libraries).map((item) => pickString(item.label, item.key)).filter(Boolean);
}

function buildSupplySummary(payload: JsonRecord) {
  const libraries = extractSupplyLibraries(payload);
  const documents = normalizeObjectArray(payload.documents);
  const gaps = sanitizeStringArray(payload.gaps);

  if (gaps.length) {
    const prefix = libraries.length ? `当前基于 ${libraries.join('、')} 知识库整理后发现：` : '当前供料结果显示：';
    return `${prefix}${gaps[0]}`;
  }

  if (documents.length) {
    const prefix = libraries.length ? `${libraries.join('、')} 知识库` : '当前知识库';
    return `当前基于 ${prefix} 整理出 ${documents.length} 份高相关资料，可继续生成结构化静态页。`;
  }

  return '当前已匹配到目标知识库，但供料仍然有限，建议补充更贴近需求的资料后再生成页面。';
}

function buildSupplyCards(payload: JsonRecord) {
  const documents = normalizeObjectArray(payload.documents);
  const evidence = normalizeObjectArray(payload.evidence);
  const gaps = sanitizeStringArray(payload.gaps);
  const libraries = extractSupplyLibraries(payload);

  return [
    { label: '资料数量', value: String(documents.length), note: '本次供料命中的核心文档数' },
    { label: '证据条目', value: String(evidence.length), note: '可直接复用的证据片段数' },
    { label: '知识库', value: String(libraries.length), note: libraries.join('、') || '未显式命名' },
    { label: '待补缺口', value: String(gaps.length), note: gaps[0] || '暂无显式缺口' },
  ].filter((item) => item.value !== '0' || item.label === '待补缺口');
}

function buildSupplyDocumentLines(payload: JsonRecord) {
  return normalizeObjectArray(payload.documents)
    .slice(0, 3)
    .map((item) => {
      const title = pickString(item.title, item.source, '资料');
      const summary = pickString(item.summary, item.whySelected);
      return summary ? `${title}：${summary}` : title;
    })
    .filter(Boolean);
}

function buildSupplyEvidenceLines(payload: JsonRecord) {
  return normalizeObjectArray(payload.evidence)
    .slice(0, 3)
    .map((item) => {
      const title = pickString(item.title, item.dimension, '证据');
      const text = pickString(item.text, item.whySelected);
      return text ? `${title}：${text}` : title;
    })
    .filter(Boolean);
}

function buildSupplyHintLines(payload: JsonRecord) {
  const templateGuidance = isObject(payload.templateGuidance) ? payload.templateGuidance : {};
  const conceptPage = isObject(payload.conceptPage) ? payload.conceptPage : {};
  return [
    ...sanitizeStringArray(templateGuidance.groupingHints),
    ...sanitizeStringArray(conceptPage.groupingHints),
    pickString(templateGuidance.outputHint),
  ].filter(Boolean);
}

function buildSupplySectionBody(
  title: string,
  summary: string,
  documentLines: string[],
  evidenceLines: string[],
  gaps: string[],
  hintLines: string[],
) {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) return summary;
  if (containsAny(normalizedTitle, ['概览', '摘要', '总览'])) return summary;
  if (containsAny(normalizedTitle, ['风险', '缺口'])) return gaps.join('\n') || summary;
  if (containsAny(normalizedTitle, ['建议', '分析'])) return hintLines.join('\n') || gaps.join('\n') || summary;
  if (containsAny(normalizedTitle, ['设备', '网关', '平台', '接口', '集成', '模块', '场景', '价值'])) {
    return evidenceLines.join('\n') || documentLines.join('\n') || summary;
  }
  return documentLines.join('\n') || evidenceLines.join('\n') || summary;
}

function buildSupplySectionBullets(
  title: string,
  documentLines: string[],
  evidenceLines: string[],
  gaps: string[],
  hintLines: string[],
) {
  const normalizedTitle = normalizeText(title);
  if (containsAny(normalizedTitle, ['风险', '缺口'])) return gaps.slice(0, 3);
  if (containsAny(normalizedTitle, ['建议', '分析'])) return hintLines.slice(0, 3);
  if (containsAny(normalizedTitle, ['设备', '网关', '平台', '接口', '集成', '模块', '场景', '价值'])) {
    return evidenceLines.slice(0, 3);
  }
  return documentLines.slice(0, 3);
}

function buildSupplyEchoPageOutput(
  kind: 'page' | 'pdf' | 'ppt',
  title: string,
  payload: JsonRecord,
  envelope?: ReportTemplateEnvelope | null,
): ChatOutput {
  const summary = buildSupplySummary(payload);
  const sectionTitles = extractSupplySectionTitles(payload, envelope);
  const documentLines = buildSupplyDocumentLines(payload);
  const evidenceLines = buildSupplyEvidenceLines(payload);
  const gaps = sanitizeStringArray(payload.gaps).slice(0, 6);
  const hintLines = buildSupplyHintLines(payload).slice(0, 6);

  const page = {
    summary,
    cards: buildSupplyCards(payload),
    sections: sectionTitles.map((sectionTitle) => ({
      title: sectionTitle,
      body: buildSupplySectionBody(sectionTitle, summary, documentLines, evidenceLines, gaps, hintLines),
      bullets: buildSupplySectionBullets(sectionTitle, documentLines, evidenceLines, gaps, hintLines),
    })),
    charts: [],
  };

  return {
    type: kind === 'page' ? 'page' : kind,
    title,
    content: summary,
    format: kind === 'page' ? 'html' : kind,
    page,
  };
}

function looksLikePromptEchoPage(
  requestText: string,
  summary: string,
  content: string,
  cards: Array<{ label?: string; value?: string; note?: string }>,
  sections: Array<{ title?: string; body?: string; bullets?: string[] }>,
) {
  if (cards.length) return false;

  const normalizedRequest = normalizeText(requestText);
  if (!normalizedRequest) return false;

  const normalizedSummary = normalizeText(summary);
  const normalizedContent = normalizeText(content);
  const summaryMatchesRequest =
    !normalizedSummary
    || normalizedSummary === normalizedRequest
    || normalizedContent === normalizedRequest;

  if (!summaryMatchesRequest) return false;

  const nonEmptySections = sections.filter((section) => sanitizeText(section.body) || section.bullets?.length);
  if (!nonEmptySections.length) return true;

  return nonEmptySections.every((section) => {
    if (section.bullets?.length) return false;
    const normalizedBody = normalizeText(section.body || '');
    return !normalizedBody || normalizedBody === normalizedRequest;
  });
}

function buildPromptEchoFallbackOutput(
  kind: 'page' | 'pdf' | 'ppt',
  title: string,
  requestText: string,
  envelope?: ReportTemplateEnvelope | null,
): ChatOutput {
  const requestPreview = sanitizeText(requestText);
  const summary = requestPreview
    ? '已识别到页面生成请求，但模型当前只回显了请求文本，未稳定产出结构化页面内容。以下保留既定章节骨架，建议补充更贴近维度的供料后重试。'
    : '已识别到页面生成请求，但模型当前未稳定产出结构化页面内容。以下保留既定章节骨架。';
  const sectionTitles = envelope?.pageSections?.length ? envelope.pageSections : DEFAULT_PAGE_SECTIONS;

  const page = {
    summary,
    cards: [
      { label: '输出状态', value: '待补充', note: '模型未稳定产出结构化页面内容' },
      { label: '章节数量', value: String(sectionTitles.length), note: '已保留页面结构骨架' },
      ...(requestPreview
        ? [{ label: '原始请求', value: '已识别', note: requestPreview }]
        : []),
    ],
    sections: sectionTitles.map((sectionTitle, index) => {
      const normalizedTitle = normalizeText(sectionTitle);
      const isAnalysisSection = containsAny(normalizedTitle, ['分析', '建议']);
      return {
        title: sectionTitle,
        body:
          index === 0
            ? summary
            : index === 1 && requestPreview
              ? `原始请求：${requestPreview}`
              : isAnalysisSection
                ? '建议补充更贴近目标维度的知识库资料，或稍后重试页面生成。'
                : '',
        bullets:
          index === 0
            ? ['当前结果仅包含请求回显', '未返回稳定的结构化页面内容']
            : isAnalysisSection
              ? ['检查知识库供料是否命中目标维度', '确认模型输出是否返回 JSON page 结构']
              : [],
      };
    }),
    charts: [],
  };

  return {
    type: kind === 'page' ? 'page' : kind,
    title,
    content: summary,
    format: kind === 'page' ? 'html' : kind,
    page,
  };
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

function getCanonicalResumeFields(item: ParsedDocument) {
  const profile = getResumeProfile(item) as ResumeFields;
  const resumeFields = item.resumeFields || {};
  return mergeResumeFields(
    [
      {
        ...resumeFields,
        candidateName: sanitizeResumeCandidateName(resumeFields.candidateName),
        latestCompany: sanitizeResumeCompany(resumeFields.latestCompany),
        companies: toStringArray(resumeFields.companies).map((entry) => sanitizeResumeCompany(entry)).filter(Boolean),
      },
      {
        ...profile,
        candidateName: sanitizeResumeCandidateName(profile.candidateName),
        latestCompany: sanitizeResumeCompany(profile.latestCompany),
        companies: toStringArray(profile.companies).map((entry) => sanitizeResumeCompany(entry)).filter(Boolean),
      },
    ],
    {
      title: item.title,
      sourceName: item.name,
      summary: item.summary,
      excerpt: item.excerpt,
      fullText: item.fullText,
    },
  );
}

function buildResumeDisplayProfileMap(displayProfiles: ResumeDisplayProfile[] = []) {
  const profileMap = new Map<string, ResumeDisplayProfile>();
  for (const profile of displayProfiles) {
    const pathKey = normalizeText(profile.sourcePath);
    const nameKey = normalizeText(profile.sourceName);
    if (pathKey) profileMap.set(pathKey, profile);
    if (nameKey) profileMap.set(nameKey, profile);
  }
  return profileMap;
}

function normalizeUniqueStrings(values: unknown[], limit = 8) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = sanitizeText(value);
    if (!text) continue;
    const normalized = normalizeText(text);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function buildResumeFileBaseName(value: string) {
  return sanitizeText(String(value || '').replace(/\.[a-z0-9]+$/i, '').replace(/^\d{8,16}-/, ''));
}

function sanitizeResumeCandidateName(value: unknown) {
  const text = sanitizeText(value);
  if (!text) return '';
  if (/^(resume|姓名|年龄|工作经验|年工作经验|邮箱|电话|手机|个人|基本信息)$/i.test(text)) return '';
  if (/^(?:default|sample|test|demo|resume)[a-z0-9-]*$/i.test(text)) return '';
  if (/^[a-z0-9-]{8,}$/i.test(text)) return '';
  if (/^(?:个人简历|候选人简历)$/u.test(text)) return '';
  if (/^(?:\u5728|\u4e8e|\u4ece|\u5bf9|\u5411|\u548c|\u4e0e|\u53ca|\u7531|\u5c06|\u628a|\u6765\u81ea)[\u4e00-\u9fff]{1,3}$/u.test(text)) return '';
  return isLikelyResumePersonName(text) ? text : '';
}

function extractResumeCandidateNameFromText(value: unknown) {
  const text = sanitizeText(value);
  if (!text) return '';
  const tokenScanAllowed = /(?:resume|\u7b80\u5386|\u59d3\u540d|\u5019\u9009\u4eba)/iu.test(text);

  const direct = sanitizeResumeCandidateName(text);
  if (direct) return direct;

  const patterns = [
    /resume\s*[:：-]?\s*([\u4e00-\u9fff·]{2,12})/i,
    /简历\s*[:：-]?\s*([\u4e00-\u9fff·]{2,12})/i,
    /^([\u4e00-\u9fff·]{2,12})(?:[，,\s]|男|女|求职|工作|现居|本科|硕士|研究生|mba|大专|博士)/i,
    /([\u4e00-\u9fff·]{2,12})[，,]\d{1,2}岁/u,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = sanitizeResumeCandidateName(match?.[1]);
    if (candidate) return candidate;
  }

  const tokenMatches = text.match(/[\u4e00-\u9fff·]{2,12}/gu) || [];
  if (!tokenScanAllowed) return '';
  for (const token of tokenMatches.slice(0, 12)) {
    const candidate = sanitizeResumeCandidateName(token);
    if (candidate) return candidate;
  }

  return '';
}

function extractStrongResumeCandidateName(value: unknown) {
  const text = sanitizeText(value);
  if (!text) return '';
  const tokenScanAllowed = /(?:resume|\u7b80\u5386|\u59d3\u540d|\u5019\u9009\u4eba)/iu.test(text);

  const patterns = [
    /(?:resume|\u7b80\u5386)[:：]?\s*([\u4e00-\u9fff\u00b7]{2,4})/iu,
    /(?:\u59d3\u540d|\u5019\u9009\u4eba)[:：]?\s*([\u4e00-\u9fff\u00b7]{2,4})/u,
    /^([\u4e00-\u9fff\u00b7]{2,4})(?:\u7b80\u5386|，|,|\s|\u7537|\u5973|\u6c42\u804c|\u5de5\u4f5c|\u73b0\u5c45|\u672c\u79d1|\u7855\u58eb|\u7814\u7a76\u751f|MBA|\u5927\u4e13|\u535a\u58eb)/u,
  ];

  for (const pattern of patterns) {
    const candidate = sanitizeResumeCandidateName(text.match(pattern)?.[1]);
    if (!candidate || isWeakResumeCandidateName(candidate)) continue;
    return candidate;
  }

  if (!tokenScanAllowed) return '';
  const tokenMatches = text.match(/[\u4e00-\u9fff\u00b7]{2,4}/gu) || [];
  for (const token of tokenMatches.slice(0, 8)) {
    const candidate = sanitizeResumeCandidateName(token);
    if (!candidate || isWeakResumeCandidateName(candidate)) continue;
    return candidate;
  }

  return '';
}

function pickResumeDisplayName(values: unknown[]) {
  const strongCandidates: string[] = [];
  const weakCandidates: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const candidates = [
      sanitizeResumeCandidateName(value),
      extractStrongResumeCandidateName(value),
      extractResumeCandidateNameFromText(value),
    ].filter(Boolean);
    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      if (isWeakResumeCandidateName(candidate)) {
        weakCandidates.push(candidate);
        continue;
      }
      strongCandidates.push(candidate);
    }
  }

  const weakDisplayCandidate = weakCandidates.find((candidate) => !/^(?:\u7537\u6027|\u5973\u6027|\u7537|\u5973|\u6c42\u804c\u610f\u5411|\u57fa\u672c\u4fe1\u606f|\u4e2a\u4eba\u4fe1\u606f|\u76ee\u6807\u5c97\u4f4d|\u5e94\u8058\u5c97\u4f4d|\u5f53\u524d\u804c\u4f4d|\d+\+?\u5e74|\d+\u5e74|\u5e74\u5de5\u4f5c\u7ecf|\u5de5\u4f5c\u7ecf\u9a8c|\u5de5\u4f5c\u5e74\u9650|\u5e74\u7ecf\u9a8c)$/u.test(candidate));
  return strongCandidates[0] || weakDisplayCandidate || '';
}

function sanitizeResumeCompany(value: unknown) {
  const raw = sanitizeText(value);
  if (!raw) return '';
  const text = raw
    .replace(/^(至今|现任|历任|曾任|负责过|负责|就职于|任职于)\s*/u, '')
    .split(/核心能力|工作经历|项目经历|教育背景|联系方式/u)[0]
    .split(/[，。；]/u)[0]
    .trim();
  if (!text) return '';
  const hasExplicitOrgSuffix = /(公司|集团|股份|银行|研究院|研究所|学院|大学|协会|中心|医院|平台)$/u.test(text);
  if (/@/.test(text)) return '';
  if (text.length > 40) return '';
  if (/^(?:\d+年|[一二三四五六七八九十]+年)/u.test(text)) return '';
  if (/^(?:负责|参与|主导|推进|完成|统筹|带领|领导|帮助|协助|推动|实现|从0)/u.test(text)) return '';
  if (/^(?:AIGC|AI|BI|ERP|CRM|MES|WMS|SaaS|IoT|IOT)[A-Za-z0-9\u4e00-\u9fff·()（）\-/]{0,12}(?:智能|科技|信息|软件|网络|系统|平台)?$/i.test(text)) return '';
  if (/电话|手机|邮箱|工作经验|年工作经验|年龄|求职|简历|resume|负责|创立|建立|经营|销售额|同比|工作经历|核心能力|related_to/i.test(text)) return '';
  if (/营收|增长|成功/u.test(text)) return '';
  if (/(智能化|信息化)/u.test(text) && !hasExplicitOrgSuffix) return '';
  if (/(?:可视化|BIM|等信息)/iu.test(text) && !hasExplicitOrgSuffix) return '';
  if (/大学[\u4e00-\u9fff]{1,4}$/u.test(text) && !/(大学|学院|研究院)$/u.test(text)) return '';
  if (/\d{4}/.test(text)) return '';
  return text;
}

function sanitizeResumeProjectHighlight(value: unknown) {
  const text = sanitizeText(value)
    .replace(/^[\u2022\u2023\u25cf\-\d.\s]+/u, '')
    .split(STRICT_RESUME_SECTION_SPLIT_PATTERN)[0]
    .trim();
  if (!text) return '';
  if (text.length > 50) return '';
  if (/related_to|mailto:|@/i.test(text)) return '';
  if (/[\uFF0C\uFF1F]/u.test(text)) return '';
  return STRICT_RESUME_PROJECT_KEYWORD_PATTERN.test(text) ? text : '';
}

function sanitizeResumeProjectHighlightStrict(value: unknown) {
  const text = sanitizeResumeProjectHighlight(value);
  if (!text) return '';
  const explicitMatch = text.match(STRICT_RESUME_PROJECT_SUFFIX_PATTERN);
  const candidate = sanitizeText((explicitMatch?.[1] || text).replace(/^(?:\u8fc7)(?=[\u4e00-\u9fffA-Za-z0-9])/u, ''));
  if (!candidate) return '';
  if (STRICT_RESUME_GENERIC_PROJECT_LABELS.has(candidate)) return '';
  if (/^(?:[a-z][\u3001\uFF0C\uFF1A\s]*)/i.test(candidate)) return '';
  if (STRICT_RESUME_ACTION_LEAD_PATTERN.test(candidate)) return '';
  if (STRICT_RESUME_WEAK_PROJECT_DETAIL_PATTERN.test(candidate)) return '';
  return candidate;
}

function sanitizeResumeHighlightText(value: unknown) {
  const text = sanitizeText(value)
    .split(STRICT_RESUME_SECTION_SPLIT_PATTERN)[0]
    .trim();
  if (!text) return '';
  if (text.length > 90) return '';
  if (/related_to|mailto:|@/i.test(text)) return '';
  if (/^(?:[a-z][\u3001\uFF0C\uFF1A\s]*)/i.test(text)) return '';
  if (STRICT_RESUME_ACTION_LEAD_PATTERN.test(text)) return '';
  if (STRICT_RESUME_NOISY_HIGHLIGHT_PUNCTUATION_PATTERN.test(text)) return '';
  if (STRICT_RESUME_SENTENCE_END_PATTERN.test(text) && text.length > 48) return '';
  return text;
}

function extractResumeCompanyFromText(value: unknown) {
  const text = sanitizeText(value);
  if (!text) return '';

  const patterns = [
    /([\u4e00-\u9fffA-Za-z0-9·()（）\-/]{4,48}(?:股份有限公司|有限责任公司|有限公司|集团|科技有限公司|信息技术有限公司|电子科技有限公司|网络科技有限公司|地产集团|银行|研究院|联合会))/u,
    /([\u4e00-\u9fffA-Za-z0-9·()（）\-/]{4,48}(?:公司|集团|科技|网络|信息|智能|银行|研究院|联合会))/u,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const company = sanitizeResumeCompany(match?.[1]);
    if (company) return company;
  }

  return '';
}

function extractResumeEducation(value: unknown) {
  const text = sanitizeText(value);
  if (!text) return '';
  const direct = text.match(/(博士|研究生|硕士|MBA|本科|大专|专科|中专)/i);
  return sanitizeText(direct?.[1] || '');
}

function extractResumeYears(value: unknown) {
  const text = sanitizeText(value);
  if (!text) return '';
  const match = text.match(/(\d{1,2}年(?:工作)?经验)/);
  return sanitizeText(match?.[1] || '');
}

function getResumeDisplayName(entry: ResumePageEntry) {
  return pickResumeDisplayName([
    entry.candidateName,
    entry.sourceTitle,
    buildResumeFileBaseName(entry.sourceName),
    entry.summary,
  ]);
}

function buildResumePageEntries(documents: ParsedDocument[], displayProfiles: ResumeDisplayProfile[] = []): ResumePageEntry[] {
  const displayProfileMap = buildResumeDisplayProfileMap(displayProfiles);
  return documents
    .filter((item) => item.schemaType === 'resume')
    .map((item) => {
      const profile = getResumeProfile(item) as ResumeFields;
      const resumeFields = item.resumeFields || {};
      const canonicalFields = getCanonicalResumeFields(item);
      const displayProfile = displayProfileMap.get(normalizeText(item.path)) || displayProfileMap.get(normalizeText(item.name));
      const candidateName = pickResumeDisplayName([
        displayProfile?.displayName,
        canonicalFields?.candidateName,
        resumeFields.candidateName,
        profile.candidateName,
        item.title,
        buildResumeFileBaseName(item.name),
        displayProfile?.displaySummary,
        item.summary,
      ]);
      const companies = normalizeUniqueStrings([
        sanitizeResumeDisplayCompany(displayProfile?.displayCompany),
        ...(canonicalFields?.companies || []).map((entry) => sanitizeResumeDisplayCompany(sanitizeResumeCompany(entry))),
        sanitizeResumeDisplayCompany(sanitizeResumeCompany(canonicalFields?.latestCompany)),
        ...toStringArray(resumeFields.companies).map((entry) => sanitizeResumeDisplayCompany(sanitizeResumeCompany(entry))),
        sanitizeResumeDisplayCompany(sanitizeResumeCompany(resumeFields.latestCompany)),
        ...toStringArray(profile.companies).map((entry) => sanitizeResumeDisplayCompany(sanitizeResumeCompany(entry))),
        sanitizeResumeDisplayCompany(sanitizeResumeCompany(profile.latestCompany)),
        sanitizeResumeDisplayCompany(extractResumeCompanyFromText(item.summary)),
        sanitizeResumeDisplayCompany(extractResumeCompanyFromText(item.title)),
      ], 4);
      const latestCompany = companies[0] || '';
      const projectHighlights = normalizeUniqueStrings(
        displayProfile?.displayProjects?.length
          ? displayProfile.displayProjects.map((entry) => sanitizeResumeProjectHighlightStrict(entry))
          : (canonicalFields?.projectHighlights || []).map((entry) => sanitizeResumeProjectHighlightStrict(entry)),
        6,
      );
      const itProjectHighlights = normalizeUniqueStrings(
        displayProfile?.displayProjects?.length
          ? displayProfile.displayProjects.map((entry) => sanitizeResumeProjectHighlightStrict(entry))
          : [
              ...(canonicalFields?.itProjectHighlights || []).map((entry) => sanitizeResumeProjectHighlightStrict(entry)),
              ...(canonicalFields?.projectHighlights || []).map((entry) => sanitizeResumeProjectHighlightStrict(entry)),
            ],
        6,
      );
      const skills = normalizeUniqueStrings(
        displayProfile?.displaySkills?.length
          ? displayProfile.displaySkills
          : (canonicalFields?.skills || []),
        8,
      );
      const education = sanitizeText(canonicalFields?.education);
      const yearsOfExperience = sanitizeText(canonicalFields?.yearsOfExperience);

      return {
        candidateName,
        education,
        latestCompany,
        yearsOfExperience,
        skills,
        projectHighlights,
        itProjectHighlights,
        highlights: normalizeUniqueStrings(
          displayProfile?.displaySummary
            ? [sanitizeResumeHighlightText(displayProfile.displaySummary)]
            : (canonicalFields?.highlights || []).map((entry) => sanitizeResumeHighlightText(entry)),
          8,
        ),
        expectedCity: sanitizeText(canonicalFields?.expectedCity),
        expectedSalary: sanitizeText(canonicalFields?.expectedSalary),
        sourceName: item.name,
        sourceTitle: item.title,
        summary: sanitizeText(sanitizeResumeHighlightText(displayProfile?.displaySummary || item.summary)),
      };
    })
    .filter((entry) => (
      entry.candidateName
      || entry.latestCompany
      || entry.skills.length
      || entry.projectHighlights.length
      || entry.itProjectHighlights.length
      || entry.highlights.length
    ));
}

function buildRankedLabelCounts(values: string[], limit = 8) {
  const counts = new Map<string, { label: string; value: number }>();
  for (const value of values) {
    const label = sanitizeText(value);
    if (!label) continue;
    const normalized = normalizeText(label);
    if (!normalized) continue;
    const next = counts.get(normalized);
    if (next) {
      next.value += 1;
      continue;
    }
    counts.set(normalized, { label, value: 1 });
  }

  return [...counts.values()]
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'zh-CN'))
    .slice(0, limit);
}

function joinRankedLabels(items: Array<{ label: string; value: number }>, limit = 4) {
  return items
    .slice(0, limit)
    .map((item) => `${item.label}${item.value > 1 ? `(${item.value})` : ''}`)
    .join('、');
}

function formatOrderAmount(value: number) {
  if (!Number.isFinite(value)) return '';
  const absolute = Math.abs(value);
  if (absolute >= 100000) return `${(value / 10000).toFixed(0)}万元`;
  if (absolute >= 10000) return `${(value / 10000).toFixed(1)}万元`;
  return `${Math.round(value)}元`;
}

function joinOrderAmountLabels(items: Array<{ label: string; value: number }>, limit = 4) {
  return items
    .slice(0, limit)
    .map((item) => `${item.label}(${formatOrderAmount(item.value)})`)
    .join('、');
}

function parseResumeExperienceYears(value: string) {
  const match = sanitizeText(value).match(/(\d{1,2})(?:\+)?\s*(?:年|yrs?|years?)/iu);
  if (!match) return 0;
  return Number(match[1] || 0);
}

function scoreResumeEntry(entry: ResumePageEntry) {
  let score = 0;
  const displayName = getResumeDisplayName(entry);
  if (displayName) score += isWeakResumeCandidateName(displayName) ? 6 : 18;
  if (entry.latestCompany) score += 14;
  if (entry.itProjectHighlights.length) score += 12 + Math.min(entry.itProjectHighlights.length, 3) * 2;
  else if (entry.projectHighlights.length) score += 6 + Math.min(entry.projectHighlights.length, 3);
  score += Math.min(entry.skills.length, 4) * 3;
  if (entry.education) score += 2;
  if (entry.summary || entry.highlights.length) score += 2;
  score += Math.min(parseResumeExperienceYears(entry.yearsOfExperience), 20);
  return score;
}

function sortResumeEntriesForClientShowcase(entries: ResumePageEntry[]) {
  return [...entries].sort((left, right) => (
    scoreResumeEntry(right) - scoreResumeEntry(left)
    || right.itProjectHighlights.length - left.itProjectHighlights.length
    || right.projectHighlights.length - left.projectHighlights.length
    || right.skills.length - left.skills.length
    || parseResumeExperienceYears(right.yearsOfExperience) - parseResumeExperienceYears(left.yearsOfExperience)
    || getResumeDisplayName(left).localeCompare(getResumeDisplayName(right), 'zh-CN')
  ));
}

function buildWeightedResumeProjectCountIndex(entries: ResumePageEntry[]) {
  const counts = new Map<string, { label: string; value: number; priority: number }>();
  for (const entry of entries) {
    const priority = scoreResumeEntry(entry);
    const labels = (entry.itProjectHighlights.length ? entry.itProjectHighlights : entry.projectHighlights)
      .map((item) => sanitizeText(item))
      .filter(Boolean);
    for (const label of labels) {
      const normalized = normalizeText(label);
      if (!normalized) continue;
      const next = counts.get(normalized);
      if (next) {
        next.value += 1;
        next.priority = Math.max(next.priority, priority);
        continue;
      }
      counts.set(normalized, { label, value: 1, priority });
    }
  }

  return counts;
}

function buildWeightedResumeProjectCounts(entries: ResumePageEntry[], limit = 10) {
  const counts = buildWeightedResumeProjectCountIndex(entries);

  return [...counts.values()]
    .sort((left, right) => (
      right.value - left.value
      || right.priority - left.priority
      || left.label.localeCompare(right.label, 'zh-CN')
    ))
    .slice(0, limit)
    .map(({ label, value }) => ({ label, value }));
}

function buildResumeProjectShowcase(entries: ResumePageEntry[], limit = 5): ResumeShowcaseProject[] {
  const counts = buildWeightedResumeProjectCountIndex(entries);
  const candidates: Array<ResumeShowcaseProject & { priority: number }> = [];

  for (const entry of entries) {
    const ownerName = getResumeDisplayName(entry);
    const ownerKey = normalizeText(ownerName || entry.sourceName || entry.latestCompany || 'resume-project');
    const companyKey = normalizeText(entry.latestCompany || ownerName || 'resume-company');
    const fit = buildResumeCandidateFit(entry);
    const labels = normalizeUniqueStrings(
      entry.itProjectHighlights.length ? entry.itProjectHighlights : entry.projectHighlights,
      6,
    );

    for (const label of labels) {
      const normalized = normalizeText(label);
      if (!normalized) continue;
      const count = counts.get(normalized);
      candidates.push({
        label: count?.label || label,
        value: count?.value || 1,
        ownerName,
        ownerKey,
        company: entry.latestCompany,
        companyKey,
        fit,
        priority: count?.priority || scoreResumeEntry(entry),
      });
    }
  }

  candidates.sort((left, right) => (
    right.value - left.value
    || right.priority - left.priority
    || left.label.localeCompare(right.label, 'zh-CN')
  ));

  const selected: ResumeShowcaseProject[] = [];
  const usedLabels = new Set<string>();
  const usedOwners = new Set<string>();
  const usedCompanies = new Set<string>();

  const selectWith = (predicate: (item: ResumeShowcaseProject & { priority: number }) => boolean) => {
    for (const candidate of candidates) {
      if (selected.length >= limit) break;
      const labelKey = normalizeText(candidate.label);
      if (!labelKey || usedLabels.has(labelKey)) continue;
      if (!predicate(candidate)) continue;
      usedLabels.add(labelKey);
      if (candidate.ownerKey) usedOwners.add(candidate.ownerKey);
      if (candidate.companyKey) usedCompanies.add(candidate.companyKey);
      selected.push({
        label: candidate.label,
        value: candidate.value,
        ownerName: candidate.ownerName,
        ownerKey: candidate.ownerKey,
        company: candidate.company,
        companyKey: candidate.companyKey,
        fit: candidate.fit,
      });
    }
  };

  selectWith((candidate) => candidate.ownerKey ? !usedOwners.has(candidate.ownerKey) : true);
  if (selected.length < limit) {
    selectWith((candidate) => candidate.companyKey ? !usedCompanies.has(candidate.companyKey) : true);
  }
  if (selected.length < limit) {
    selectWith(() => true);
  }

  return selected;
}

function buildResumeCandidateFit(entry: ResumePageEntry) {
  return normalizeUniqueStrings([
    ...(entry.itProjectHighlights.length ? entry.itProjectHighlights.slice(0, 1) : entry.projectHighlights.slice(0, 1)),
    ...entry.skills.slice(0, 2),
  ], 3).join(' / ');
}

function buildResumeCandidateLine(entry: ResumePageEntry) {
  const parts = [
    getResumeDisplayName(entry),
    entry.latestCompany ? `${entry.latestCompany}` : '',
    entry.yearsOfExperience || '',
    entry.education ? `学历 ${entry.education}` : '',
    buildResumeCandidateFit(entry) ? `匹配 ${buildResumeCandidateFit(entry)}` : '',
  ].filter(Boolean);
  return parts.join('，');
}

function buildResumeCompanyLine(item: { label: string; value: number }, stats: ResumePageStats) {
  const relatedCandidates = stats.entries
    .filter((entry) => entry.latestCompany === item.label)
    .map((entry) => getResumeDisplayName(entry))
    .filter(Boolean)
    .slice(0, 3);
  const candidateText = relatedCandidates.length ? `；代表候选人 ${relatedCandidates.join('、')}` : '';
  return `${item.label}：覆盖 ${item.value} 份简历${candidateText}`;
}

function buildResumeShowcaseProjectLine(item: ResumeShowcaseProject) {
  const ownerText = item.ownerName ? `：代表候选人 ${item.ownerName}` : '';
  const companyText = item.company ? `，关联公司 ${item.company}` : '';
  const fitText = item.fit ? `；匹配 ${item.fit}` : '';
  return `${item.label}${ownerText}${companyText}${fitText}`;
}

function buildResumeProjectLine(item: { label: string; value: number }, stats: ResumePageStats) {
  const owner = stats.entries.find((entry) => (
    entry.itProjectHighlights.includes(item.label) || entry.projectHighlights.includes(item.label)
  ));
  const ownerText = owner ? getResumeDisplayName(owner) : '';
  const companyText = owner?.latestCompany ? `，关联公司 ${owner.latestCompany}` : '';
  const fitText = owner ? buildResumeCandidateFit(owner) : '';
  return `${item.label}${ownerText ? `：代表候选人 ${ownerText}` : ''}${companyText}${fitText ? `；匹配 ${fitText}` : ''}`;
}

function buildResumeSkillLine(item: { label: string; value: number }, stats: ResumePageStats) {
  const candidates = stats.entries
    .filter((entry) => entry.skills.includes(item.label))
    .map((entry) => getResumeDisplayName(entry))
    .filter(Boolean)
    .slice(0, 3);
  return `${item.label}：覆盖 ${item.value} 位候选人${candidates.length ? `；代表候选人 ${candidates.join('、')}` : ''}`;
}

function buildResumeClientRecommendationLines(stats: ResumePageStats) {
  const lines: string[] = [];
  const shortlist = stats.entries
    .map((entry) => getResumeDisplayName(entry))
    .filter(Boolean)
    .slice(0, 3);
  if (shortlist.length) {
    lines.push(`首轮 shortlist 可优先沟通 ${shortlist.join('、')}，先做客户场景贴合度验证。`);
  }
  const topProjects = stats.showcaseProjectLabels.slice(0, 2);
  if (topProjects.length) {
    lines.push(`若目标场景接近 ${topProjects.join('、')}，优先核验同类项目中的实际角色、交付范围和协同深度。`);
  }
  const topSkills = joinRankedLabels(stats.skills, 3);
  if (topSkills) {
    lines.push(`技术岗位可先按 ${topSkills} 这组高频技能做交叉筛选，再补充具体业务经验判断。`);
  }
  if (stats.salaryLines.length) {
    lines.push(`进入客户深聊前，建议补齐 ${stats.salaryLines.slice(0, 2).join('、')} 等薪资边界与到岗时间。`);
  } else {
    lines.push('进入客户深聊前，建议补齐到岗时间、城市偏好和薪资边界。');
  }
  return lines.slice(0, 4);
}

function buildResumePageStats(entries: ResumePageEntry[]): ResumePageStats {
  const rankedEntries = sortResumeEntriesForClientShowcase(entries);
  const companies = buildRankedLabelCounts(rankedEntries.map((entry) => entry.latestCompany).filter(Boolean), 8);
  const projects = buildWeightedResumeProjectCounts(rankedEntries, 10);
  const showcaseProjects = buildResumeProjectShowcase(rankedEntries, 5);
  const skills = buildRankedLabelCounts(rankedEntries.flatMap((entry) => entry.skills).filter(Boolean), 10);
  const educations = buildRankedLabelCounts(rankedEntries.map((entry) => entry.education).filter(Boolean), 6);
  const salaryLines = normalizeUniqueStrings(
    rankedEntries
      .map((entry) => entry.expectedSalary)
      .filter(Boolean),
    6,
  );

  const stats: ResumePageStats = {
    entries: rankedEntries,
    candidateCount: new Set(rankedEntries.map((entry) => getResumeDisplayName(entry)).filter(Boolean)).size,
    companyCount: companies.length,
    projectCount: projects.length,
    skillCount: skills.length,
    companies,
    projects,
    skills,
    educations,
    candidateLines: [],
    companyLines: [],
    projectLines: [],
    skillLines: [],
    salaryLines,
    showcaseCandidateNames: [],
    showcaseProjectLabels: [],
    showcaseProjects,
  };

  stats.candidateLines = rankedEntries.filter((entry) => getResumeDisplayName(entry)).slice(0, 6).map(buildResumeCandidateLine);
  stats.companyLines = companies.map((item) => buildResumeCompanyLine(item, stats)).slice(0, 6);
  const showcaseProjectLabels = new Set(showcaseProjects.map((item) => normalizeText(item.label)).filter(Boolean));
  stats.projectLines = [
    ...showcaseProjects.map((item) => buildResumeShowcaseProjectLine(item)),
    ...projects
      .filter((item) => !showcaseProjectLabels.has(normalizeText(item.label)))
      .map((item) => buildResumeProjectLine(item, stats)),
  ].slice(0, 6);
  stats.skillLines = skills.map((item) => buildResumeSkillLine(item, stats)).slice(0, 6);
  const rankedCandidateNames = normalizeUniqueStrings(rankedEntries.map((entry) => getResumeDisplayName(entry)).filter(Boolean), 6);
  stats.showcaseCandidateNames = [
    ...rankedCandidateNames.filter((name) => !isWeakResumeCandidateName(name)),
    ...rankedCandidateNames.filter((name) => isWeakResumeCandidateName(name)),
  ].slice(0, 3);
  stats.showcaseProjectLabels = showcaseProjects.map((item) => item.label).slice(0, 3);
  return stats;
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

function legacyHasClientSignal(text: string) {
  return containsAny(text, [
    'client',
    'customer',
    'presentation',
    'pitch',
    'report',
    '瀹㈡埛',
    '姹囨姤',
    '灞曠ず',
    '鎺ㄨ崘',
    '鍖归厤寤鸿',
  ]);
}

function hasClientSignal(text: string) {
  return containsAny(text, [
    'client',
    'customer',
    'presentation',
    'pitch',
    'report',
    '\u5ba2\u6237',
    '\u6c47\u62a5',
    '\u5c55\u793a',
    '\u63a8\u8350',
    '\u5339\u914d\u5efa\u8bae',
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

function resolveResumeRequestView(requestText: string): ResumeRequestView {
  const text = normalizeText(requestText);
  if (hasClientSignal(text)) return 'client';
  return detectResumeRequestView(requestText);
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

function buildResumeCompanyProjectRows(documents: ParsedDocument[], displayProfiles: ResumeDisplayProfile[] = []) {
  const rows: Array<Array<string>> = [];

  for (const entry of buildResumePageEntries(documents, displayProfiles)) {
    const candidate = getResumeDisplayName(entry);
    const effectiveCompanies = entry.latestCompany ? [entry.latestCompany] : [UNKNOWN_COMPANY];
    const effectiveProjects = entry.itProjectHighlights.length
      ? entry.itProjectHighlights.slice(0, 6)
      : entry.projectHighlights.slice(0, 4);

    if (!effectiveProjects.length) {
      rows.push([
        effectiveCompanies[0],
        candidate,
        '未提取到明确 IT 项目',
        '',
        entry.skills.slice(0, 6).join(' / '),
        '',
        entry.sourceName,
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
          extractTechKeywords(project) || entry.skills.slice(0, 6).join(' / '),
          extractProjectTimeline(project),
          entry.sourceName,
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

function buildResumeProjectRows(documents: ParsedDocument[], displayProfiles: ResumeDisplayProfile[] = []) {
  const rows: Array<Array<string>> = [];
  for (const entry of buildResumePageEntries(documents, displayProfiles)) {
    const candidate = getResumeDisplayName(entry);
    const company = entry.latestCompany || UNKNOWN_COMPANY;
    const projects = entry.itProjectHighlights.length ? entry.itProjectHighlights : entry.projectHighlights;
    for (const project of projects.slice(0, 6)) {
      rows.push([
        project,
        company,
        candidate,
        extractProjectRole(project),
        extractTechKeywords(project) || entry.skills.slice(0, 6).join(' / '),
        extractProjectTimeline(project),
        entry.sourceName,
      ]);
    }
  }
  return rows.slice(0, 36);
}

function buildResumeTalentRows(documents: ParsedDocument[], displayProfiles: ResumeDisplayProfile[] = []) {
  return buildResumePageEntries(documents, displayProfiles)
    .map((entry) => [
      getResumeDisplayName(entry),
      entry.education,
      entry.latestCompany,
      entry.skills.slice(0, 6).join(' / '),
      '',
      entry.yearsOfExperience,
      (entry.itProjectHighlights.length ? entry.itProjectHighlights : entry.projectHighlights).slice(0, 2).join('；'),
      entry.sourceName,
    ])
    .filter((row) => row.some(Boolean))
    .slice(0, 36);
}

function buildResumeSkillRows(documents: ParsedDocument[], displayProfiles: ResumeDisplayProfile[] = []) {
  const rows: Array<Array<string>> = [];
  for (const entry of buildResumePageEntries(documents, displayProfiles)) {
    const candidate = getResumeDisplayName(entry);
    const latestCompany = entry.latestCompany || UNKNOWN_COMPANY;
    const projects = entry.itProjectHighlights.length ? entry.itProjectHighlights : entry.projectHighlights;
    for (const skill of entry.skills.slice(0, 8)) {
      rows.push([
        skill,
        candidate,
        skill,
        latestCompany,
        projects.slice(0, 2).join('；'),
        entry.sourceName,
      ]);
    }
  }
  return rows.slice(0, 40);
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
  const companyRows = view === 'company' ? buildResumeCompanyProjectRows(documents, displayProfiles) : [];
  const projectRows = view === 'project' ? buildResumeProjectRows(documents, displayProfiles) : [];
  const talentRows = view === 'talent' || view === 'generic' ? buildResumeTalentRows(documents, displayProfiles) : [];
  const skillRows = view === 'skill' ? buildResumeSkillRows(documents, displayProfiles) : [];

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

function buildResumePageTitle(view: ResumeRequestView, envelope?: ReportTemplateEnvelope | null) {
  if (envelope?.title && hasExpectedResumeTitle(view, envelope.title)) return envelope.title;
  if (view === 'client') return '简历客户汇报静态页';
  if (view === 'company') return '简历公司维度 IT 项目静态页';
  if (view === 'project') return '简历项目维度静态页';
  if (view === 'skill') return '简历技能维度静态页';
  return '简历人才维度静态页';
}

function buildResumePageSummary(view: ResumeRequestView, documentCount: number, stats: ResumePageStats) {
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

function buildResumePageCards(view: ResumeRequestView, documentCount: number, stats: ResumePageStats) {
  if (view === 'client') {
    return [
      {
        label: '候选人覆盖',
        value: String(stats.candidateCount),
        note: stats.showcaseCandidateNames.length
          ? `优先 shortlist：${stats.showcaseCandidateNames.join('、')}`
          : '进入本页主展示的人才数量',
      },
      {
        label: '公司覆盖',
        value: String(stats.companyCount),
        note: joinRankedLabels(stats.companies, 2) || '可用于客户汇报的企业背景数量',
      },
      {
        label: '项目匹配',
        value: String(stats.projectCount),
        note: stats.showcaseProjectLabels.length
          ? `代表项目：${stats.showcaseProjectLabels.slice(0, 2).join('、')}`
          : '可用于客户沟通的代表项目线索',
      },
      {
        label: '技能热点',
        value: joinRankedLabels(stats.skills, 3) || String(stats.skillCount),
        note: `高频能力主题：${joinRankedLabels(stats.skills, 2) || '待补充'}`,
      },
    ];
  }
  if (view === 'company') {
    return [
      { label: '候选人覆盖', value: String(stats.candidateCount), note: '具备公司或项目线索的候选人数量' },
      { label: '公司覆盖', value: String(stats.companyCount), note: '当前页面涉及的重点公司数量' },
      { label: '项目线索', value: String(stats.projectCount), note: '从简历中归纳出的代表项目线索' },
      { label: '技能热点', value: joinRankedLabels(stats.skills, 3) || '待补充', note: '高频技能方向' },
    ];
  }
  if (view === 'project') {
    return [
      { label: '项目线索', value: String(stats.projectCount), note: '去重后的项目线索数量' },
      { label: '候选人覆盖', value: String(stats.candidateCount), note: '参与项目的候选人数量' },
      { label: '公司覆盖', value: String(stats.companyCount), note: '相关公司或组织数量' },
      { label: '技能热点', value: joinRankedLabels(stats.skills, 3) || '待补充', note: '高频技术方向' },
    ];
  }
  if (view === 'skill') {
    return [
      { label: '技能覆盖', value: String(stats.skillCount), note: '去重后的核心技能数量' },
      { label: '候选人覆盖', value: String(stats.candidateCount), note: '具备技能画像的候选人数量' },
      { label: '公司覆盖', value: String(stats.companyCount), note: '技能来源关联到的公司数量' },
      { label: '关联项目', value: String(stats.projectCount), note: '技能对应的代表项目线索' },
    ];
  }
  return [
    { label: '简历数量', value: String(documentCount), note: '参与本次页面生成的简历数量' },
    { label: '候选人覆盖', value: String(stats.candidateCount), note: '已识别出的候选人数量' },
    { label: '公司覆盖', value: String(stats.companyCount), note: '关联公司或组织数量' },
    { label: '技能覆盖', value: String(stats.skillCount), note: '去重后的核心技能数量' },
  ];
}

function buildResumeSectionBlueprints(view: ResumeRequestView, summary: string, stats: ResumePageStats) {
  const compensationText = stats.salaryLines.length ? `；期望薪资线索包括 ${stats.salaryLines.slice(0, 3).join('、')}` : '';
  if (view === 'client') {
    return [
      {
        body: summary,
        bullets: [
          `shortlist 候选人：${stats.showcaseCandidateNames.join('、')}`,
          `重点公司：${joinRankedLabels(stats.companies, 4)}`,
          `代表项目：${stats.showcaseProjectLabels.join('、') || joinRankedLabels(stats.projects, 3)}`,
        ].filter(Boolean),
      },
      {
        body: `本页优先展示更适合进入客户首轮沟通的候选人，主要来自 ${joinRankedLabels(stats.companies, 4)} 等企业背景。`,
        bullets: stats.candidateLines.slice(0, 5),
      },
      {
        body: `代表项目聚焦 ${stats.showcaseProjectLabels.join('、') || joinRankedLabels(stats.projects, 5)} 等方向，更适合用于客户场景映射和交付经验说明。`,
        bullets: stats.projectLines.slice(0, 5),
      },
      {
        body: `核心技能以 ${joinRankedLabels(stats.skills, 6)} 为主，覆盖后端交付、平台建设、产品协同等关键能力。`,
        bullets: stats.skillLines.slice(0, 5),
      },
      {
        body: `建议围绕 shortlist 候选人、相似项目场景和高频技能组合三条线做并行筛选${compensationText}。`,
        bullets: buildResumeClientRecommendationLines(stats),
      },
      { body: '当前页以知识库证据为主、AI归纳为辅，适合作为客户沟通和内部筛选的第一版展示页。', bullets: [
        '优先核验代表项目与最近公司是否与目标岗位高度相关',
        '当证据不足时，以保守描述替代自由补完',
      ] },
    ];
  }
  if (view === 'talent') {
    return [
      { body: summary, bullets: [joinRankedLabels(stats.skills, 4), joinRankedLabels(stats.companies, 4), `代表项目 ${joinRankedLabels(stats.projects, 3)}`].filter(Boolean) },
      { body: `代表候选人主要集中在 ${joinRankedLabels(stats.companies, 4)} 等背景公司，可直接用于客户展示与初筛沟通。`, bullets: stats.candidateLines.slice(0, 5) },
      { body: `代表项目主要覆盖 ${joinRankedLabels(stats.projects, 5)} 等方向，体现了平台搭建、交付实施和业务落地能力。`, bullets: stats.projectLines.slice(0, 5) },
      { body: `核心技能以 ${joinRankedLabels(stats.skills, 6)} 为主，兼顾项目实施、产品规划和业务协同。`, bullets: stats.skillLines.slice(0, 5) },
      { body: `建议优先根据岗位目标从公司背景、项目场景和技能组合三条线并行筛选${compensationText}。`, bullets: [
        '优先选择项目经历与客户业务场景接近的候选人',
        '对管理岗重点关注公司背景、团队带领与交付经历',
        '对技术岗重点关注高频技能组合与代表项目',
      ] },
      { body: '当前页以知识库证据为主、AI归纳为辅，适合作为客户沟通和内部筛选的第一版展示页。', bullets: [
        '优先核验代表项目与最近公司是否与目标岗位高度相关',
        '当证据不足时，以保守描述替代自由补完',
      ] },
    ];
  }
  if (view === 'company') {
    return [
      { body: summary, bullets: stats.companyLines.slice(0, 5) },
      { body: `重点项目主要覆盖 ${joinRankedLabels(stats.projects, 5)} 等方向，适合按公司维度查看候选人的项目沉淀。`, bullets: stats.projectLines.slice(0, 5) },
      { body: `当前候选人来源公司较为集中，代表背景包括 ${joinRankedLabels(stats.companies, 5)}。`, bullets: stats.candidateLines.slice(0, 5) },
      { body: `技术关键词主要集中在 ${joinRankedLabels(stats.skills, 6)}，说明候选人更偏平台型、交付型和解决方案型能力。`, bullets: stats.skillLines.slice(0, 5) },
      { body: '从公司维度看，页面适合快速评估候选人的行业贴近度与项目经验密度。', bullets: [
        '优先识别是否存在目标行业的连续经历',
        '当项目描述较短时，以项目主题而非业绩数字作为判断依据',
        '重点关注最近公司和代表项目的组合',
      ] },
      { body: '当前输出以知识库可见的公司、项目与技能线索为依据，避免扩写无法验证的业绩数字。', bullets: [
        '适合作为公司维度的人才盘点初稿',
        '如需更细颗粒度判断，可继续下钻到项目维度页面',
      ] },
    ];
  }
  if (view === 'project') {
    return [
      { body: summary, bullets: stats.projectLines.slice(0, 5) },
      { body: `项目所关联的公司主要包括 ${joinRankedLabels(stats.companies, 5)}。`, bullets: stats.companyLines.slice(0, 5) },
      { body: `参与候选人覆盖 ${stats.candidateCount} 位，代表候选人具备 ${joinRankedLabels(stats.skills, 5)} 等能力组合。`, bullets: stats.candidateLines.slice(0, 5) },
      { body: `技术关键词主要集中在 ${joinRankedLabels(stats.skills, 6)}。`, bullets: stats.skillLines.slice(0, 5) },
      { body: '交付信号主要来自简历中的项目主题、岗位角色和最近公司信息，适合用于项目匹配与候选人筛选。', bullets: [
        '优先关注与目标项目场景一致的候选人',
        '优先采信明确写出项目主题和角色职责的简历',
      ] },
      { body: '项目维度页面更适合做“项目找人”场景下的第一轮对齐，后续可再结合人才维度细看背景与稳定性。', bullets: [
        '同一项目主题可继续下钻到技能覆盖和公司背景',
      ] },
    ];
  }
  if (view === 'skill') {
    return [
      { body: summary, bullets: stats.skillLines.slice(0, 5) },
      { body: `高频技能主要集中在 ${joinRankedLabels(stats.skills, 6)}，可直接用于技能盘点和关键词检索。`, bullets: stats.candidateLines.slice(0, 5) },
      { body: `技能来源公司主要包括 ${joinRankedLabels(stats.companies, 5)}。`, bullets: stats.companyLines.slice(0, 5) },
      { body: `技能所关联的代表项目主要包括 ${joinRankedLabels(stats.projects, 5)}。`, bullets: stats.projectLines.slice(0, 5) },
      { body: '技能维度页面更适合回答“某类技能有哪些人、分布在哪些公司、对应哪些项目”。', bullets: [
        '优先看高频技能与最近公司的组合',
        '再看技能是否能落到具体项目和场景',
      ] },
      { body: '当前页面只保留知识库可见的技能、公司和项目线索，适合作为技能筛选和岗位匹配的证据层。', bullets: [
        '不把技能页误写成客户汇报页或人才总览页',
      ] },
    ];
  }
  return [
    { body: summary, bullets: stats.candidateLines.slice(0, 5) },
    { body: `学历与背景主要集中在 ${joinRankedLabels(stats.educations, 4) || '待补充'}，候选人覆盖 ${joinRankedLabels(stats.companies, 4)} 等公司背景${compensationText}。`, bullets: stats.educations.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
    { body: `最近公司主要集中在 ${joinRankedLabels(stats.companies, 5)}。`, bullets: stats.companyLines.slice(0, 5) },
    { body: `代表项目主要覆盖 ${joinRankedLabels(stats.projects, 5)}。`, bullets: stats.projectLines.slice(0, 5) },
    { body: `核心能力主要集中在 ${joinRankedLabels(stats.skills, 6)}。`, bullets: stats.skillLines.slice(0, 5) },
    { body: '人才维度页面适合作为候选人初筛页，优先看最近公司、项目场景与技能组合，再结合薪资和工作年限做匹配判断。', bullets: [
      '先看候选人背景是否贴近目标行业',
      '再看代表项目是否与目标岗位高度相关',
      '最后结合技能与薪资线索做初筛',
    ] },
  ];
}

function buildResumePageCharts(view: ResumeRequestView, stats: ResumePageStats) {
  if (view === 'company') {
    return [
      { title: '公司覆盖分布', items: stats.companies.slice(0, 8) },
      { title: '技能热点分布', items: stats.skills.slice(0, 8) },
    ];
  }
  if (view === 'project') {
    return [
      { title: '项目覆盖分布', items: stats.projects.slice(0, 8) },
      { title: '公司分布', items: stats.companies.slice(0, 8) },
    ];
  }
  if (view === 'skill') {
    return [
      { title: '技能覆盖分布', items: stats.skills.slice(0, 8) },
      { title: '公司覆盖分布', items: stats.companies.slice(0, 8) },
    ];
  }
  if (view === 'client') {
    return [
      { title: '技能热度', items: stats.skills.slice(0, 8) },
      { title: '公司背景分布', items: stats.companies.slice(0, 8) },
    ];
  }
  return [
    { title: '技能覆盖分布', items: stats.skills.slice(0, 8) },
    { title: '公司背景分布', items: stats.companies.slice(0, 8) },
  ];
}

function buildResumePageOutput(
  view: ResumeRequestView,
  documents: ParsedDocument[],
  envelope?: ReportTemplateEnvelope | null,
  displayProfiles: ResumeDisplayProfile[] = [],
): KnowledgePageOutput {
  const stats = buildResumePageStats(buildResumePageEntries(documents, displayProfiles));
  const summary = buildResumePageSummary(view, documents.length, stats);
  const shouldUseEnvelopeSections = Boolean(envelope?.pageSections?.length) && hasExpectedResumeTitle(view, envelope?.title || '');
  const sectionTitles = shouldUseEnvelopeSections ? (envelope?.pageSections || []) : defaultResumePageSections(view);
  const blueprints = buildResumeSectionBlueprints(view, summary, stats);

  return {
    type: 'page',
    title: buildResumePageTitle(view, envelope),
    content: summary,
    format: 'html',
    page: {
      summary,
      cards: buildResumePageCards(view, documents.length, stats),
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

function isOrderInventoryDocument(item: ParsedDocument) {
  const bizCategory = String(item.bizCategory || '').toLowerCase();
  const schemaType = String(item.schemaType || '').toLowerCase();
  if (bizCategory === 'order' || bizCategory === 'inventory') return true;
  if (schemaType === 'order') return true;
  if (schemaType === 'report' && containsAny(normalizeText([
    item.title,
    item.summary,
    item.excerpt,
    ...(item.topicTags || []),
  ].join(' ')), ['order', 'inventory', 'replenishment', 'stock', '订单', '库存', '补货', '备货'])) {
    return true;
  }
  return false;
}

function hasOrderPlatformSignal(text: string) {
  return containsAny(text, ['platform', 'channel', 'tmall', 'jd', 'douyin', 'amazon', 'shopify', '平台', '渠道', '天猫', '京东', '抖音']);
}

function hasOrderCategorySignal(text: string) {
  return containsAny(text, ['category', 'categories', 'sku', '品类', '类目', '商品']);
}

function hasOrderStockSignal(text: string) {
  return containsAny(text, ['inventory', 'stock', 'forecast', 'replenishment', 'restock', '库存', '补货', '备货', '缺货', '周转']);
}

function resolveOrderRequestView(requestText: string): OrderRequestView {
  const text = normalizeText(requestText);
  const hasStock = hasOrderStockSignal(text);
  const hasCategory = hasOrderCategorySignal(text);
  const hasPlatform = hasOrderPlatformSignal(text);
  const hasExplicitStockView = containsAny(text, [
    'inventory cockpit',
    'stock cockpit',
    '库存驾驶舱',
    '库存与补货驾驶舱',
    '补货驾驶舱',
  ]);
  const hasStockRiskFocus = containsAny(text, ['断货', '滞销', '高风险sku', '高风险 sku', '72小时', '72 小时', '周转']);
  if (hasExplicitStockView || (hasStock && !hasCategory && !hasPlatform) || (hasStock && hasStockRiskFocus && !hasPlatform)) {
    return 'stock';
  }
  if (hasCategory && hasPlatform) return 'generic';
  if (hasCategory) return 'category';
  if (hasPlatform) return 'platform';
  return 'generic';
}

function formatOrderSignalLabel(value: string) {
  const text = sanitizeText(value);
  if (!text) return '';
  const normalized = normalizeText(text);
  return ORDER_SIGNAL_LABEL_MAP.get(normalized) || ORDER_CHANNEL_LABEL_MAP.get(normalized) || text;
}

function collectOrderProfileStrings(item: ParsedDocument, keys: string[]) {
  const profile = isObject(item.structuredProfile) ? item.structuredProfile : {};
  return keys.flatMap((key) => {
    if (!(key in profile)) return [];
    return toStringArray(profile[key]);
  });
}

function extractOrderCsvTable(item: ParsedDocument, limit = 80) {
  const source = String(item.fullText || '')
    .replace(/\r/g, '')
    .trim();
  if (!source || !source.includes(',')) return null;

  const lines = source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const headers = lines[0]
    .split(',')
    .map((cell) => normalizeText(cell))
    .filter(Boolean);
  if (headers.length < 2) return null;

  const rows = lines
    .slice(1, limit + 1)
    .map((line) => line.split(',').map((cell) => sanitizeText(cell)))
    .filter((row) => row.some(Boolean));
  if (!rows.length) return null;

  return { headers, rows };
}

function findOrderHeaderIndex(headers: string[], aliases: string[]) {
  const aliasSet = new Set(aliases.map((alias) => normalizeText(alias)));
  for (let index = 0; index < headers.length; index += 1) {
    if (aliasSet.has(headers[index])) return index;
  }
  return -1;
}

function parseOrderNumericValue(value: unknown) {
  const text = sanitizeText(value).replace(/,/g, '');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function addOrderAmount(target: Map<string, { label: string; value: number }>, label: string, value: number) {
  const normalized = normalizeText(label);
  if (!normalized || !Number.isFinite(value)) return;
  const existing = target.get(normalized);
  if (existing) {
    existing.value += value;
    return;
  }
  target.set(normalized, { label, value });
}

function rankOrderAmounts(target: Map<string, { label: string; value: number }>, limit = 8) {
  return [...target.values()]
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'zh-CN'))
    .slice(0, limit);
}

function normalizeOrderPriority(value: unknown) {
  const text = sanitizeText(value).slice(0, 16).toUpperCase();
  const match = text.match(/P\d/);
  return match?.[0] || text;
}

function isHealthyOrderRisk(value: string) {
  return containsAny(normalizeText(value), ['healthy', 'normal', 'stable', 'ok', '正常', '健康']);
}

function scoreOrderRiskHighlight(
  risk: string,
  priority: string,
  inventoryIndex: number | null,
  daysOfCover: number | null,
) {
  let score = 0;
  const normalizedRisk = normalizeText(risk);
  if (containsAny(normalizedRisk, ['stockout', 'shortage', 'low stock', '缺货'])) score += 8;
  if (containsAny(normalizedRisk, ['overstock', 'slow moving', '滞销', '积压'])) score += 6;
  if (containsAny(normalizedRisk, ['risk', 'anomaly', '异常', '波动'])) score += 4;
  if (priority === 'P0') score += 7;
  else if (priority === 'P1') score += 5;
  else if (priority === 'P2') score += 3;
  if (inventoryIndex !== null) {
    if (inventoryIndex >= 1.4 || inventoryIndex <= 0.75) score += 4;
    else if (inventoryIndex >= 1.2 || inventoryIndex <= 0.9) score += 2;
  }
  if (daysOfCover !== null) {
    if (daysOfCover >= 120 || daysOfCover <= 15) score += 3;
    else if (daysOfCover >= 90 || daysOfCover <= 21) score += 1;
  }
  return score;
}

function shouldTreatOrderRiskAsMaterial(
  risk: string,
  priority: string,
  inventoryIndex: number | null,
  daysOfCover: number | null,
) {
  if (risk && !isHealthyOrderRisk(risk)) return true;
  if (priority === 'P0' || priority === 'P1') return true;
  if (inventoryIndex !== null && (inventoryIndex >= 1.2 || inventoryIndex <= 0.9)) return true;
  if (daysOfCover !== null && (daysOfCover >= 90 || daysOfCover <= 21)) return true;
  return false;
}

function pickTopOrderHighlights(items: Array<{ key?: string; text: string; score: number }>, limit = 4) {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const item of items
    .filter((entry) => entry.text)
    .sort((left, right) => right.score - left.score || left.text.localeCompare(right.text, 'zh-CN'))) {
    const normalized = normalizeText(item.key || item.text);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    results.push(item.text);
    if (results.length >= limit) break;
  }
  return results;
}

function mergeOrderHighlightBullets(primary: string[], secondary: string[], limit = 4) {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const value of [...primary, ...secondary]) {
    const text = sanitizeText(value).slice(0, 120).trim();
    const normalized = normalizeText(text);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(text);
    if (merged.length >= limit) break;
  }
  return merged;
}

function collectOrderCsvValues(
  item: ParsedDocument,
  headerAliases: string[],
  limit = 24,
  dedupe = true,
) {
  const table = extractOrderCsvTable(item, Math.max(limit * 4, 24));
  if (!table) return [];

  const aliases = new Set(headerAliases.map((alias) => normalizeText(alias)));
  const indexes = table.headers.flatMap((header, index) => (aliases.has(header) ? [index] : []));
  if (!indexes.length) return [];

  const seen = new Set<string>();
  const values: string[] = [];
  for (const row of table.rows) {
    for (const index of indexes) {
      const value = sanitizeText(row[index]);
      if (!value) continue;
      const key = normalizeText(value);
      if (dedupe && seen.has(key)) continue;
      if (dedupe) seen.add(key);
      values.push(value);
      if (values.length >= limit) return values;
    }
  }

  return values;
}

function collectOrderCsvMetricSignals(item: ParsedDocument) {
  const table = extractOrderCsvTable(item, 12);
  const csvSignals: string[] = [];
  if (table) {
    const headerSet = new Set(table.headers);
    const mappings = [
      { aliases: ['net_sales', 'net amount', 'net_amount'], label: '净销售额' },
      { aliases: ['gross_profit'], label: '毛利额' },
      { aliases: ['gross_margin'], label: '毛利率' },
      { aliases: ['avg_order_value'], label: '客单价' },
      { aliases: ['order_count'], label: '订单量' },
      { aliases: ['units_sold', 'quantity'], label: '销量' },
      { aliases: ['discount_total', 'discount_amount'], label: '折扣额' },
      { aliases: ['refund_total', 'refund_amount'], label: '退款额' },
      { aliases: ['inventory_index'], label: '库存指数' },
      { aliases: ['days_of_cover'], label: '库存覆盖天数' },
      { aliases: ['safety_stock'], label: '安全库存' },
      { aliases: ['inventory_before', 'inventory_after'], label: '库存水位' },
    ];
    for (const mapping of mappings) {
      if (mapping.aliases.some((alias) => headerSet.has(normalizeText(alias)))) {
        csvSignals.push(mapping.label);
      }
    }
  }

  return [
    ...collectOrderProfileStrings(item, ['metricSignals', 'keyMetrics']).map(formatOrderSignalLabel),
    ...csvSignals,
  ];
}

function collectOrderCsvSupportingLines(item: ParsedDocument, limit = 3) {
  const table = extractOrderCsvTable(item, Math.max(limit * 6, 12));
  if (!table) return [];

  const findValue = (row: string[], aliases: string[]) => {
    const aliasSet = new Set(aliases.map((alias) => normalizeText(alias)));
    for (let index = 0; index < table.headers.length; index += 1) {
      if (!aliasSet.has(table.headers[index])) continue;
      const value = sanitizeText(row[index]);
      if (value) return value;
    }
    return '';
  };

  const prioritizedRows = [...table.rows].sort((left, right) => {
    const leftScore = [findValue(left, ['risk_flag', 'risk', 'inventory_risk', 'anomaly_note']), findValue(left, ['replenishment_priority', 'recommendation'])].filter(Boolean).length;
    const rightScore = [findValue(right, ['risk_flag', 'risk', 'inventory_risk', 'anomaly_note']), findValue(right, ['replenishment_priority', 'recommendation'])].filter(Boolean).length;
    return rightScore - leftScore;
  });

  return prioritizedRows
    .slice(0, limit)
    .map((row) => {
      const platform = findValue(row, ['platform', 'platform_focus']) || '多渠道';
      const category = findValue(row, ['category']) || '重点品类';
      const sku = findValue(row, ['sku']) || '';
      const netSales = findValue(row, ['net_sales', 'net_amount']);
      const inventoryIndex = findValue(row, ['inventory_index', 'days_of_cover']);
      const risk = findValue(row, ['risk_flag', 'risk', 'inventory_risk', 'anomaly_note']);
      const action = findValue(row, ['replenishment_priority', 'recommendation']);
      return [
        platform,
        category,
        sku,
        netSales ? `净销售额 ${netSales}` : '',
        inventoryIndex ? `库存信号 ${inventoryIndex}` : '',
        risk ? `风险 ${risk}` : '',
        action ? `动作 ${action}` : '',
      ]
        .filter(Boolean)
        .join(' / ');
    })
    .filter(Boolean);
}

function buildOrderCsvDerivedFacts(documents: ParsedDocument[]) {
  const platformAmounts = new Map<string, { label: string; value: number }>();
  const categoryAmounts = new Map<string, { label: string; value: number }>();
  const riskEntries: Array<{ key?: string; text: string; score: number }> = [];
  const actionEntries: Array<{ key?: string; text: string; score: number }> = [];

  for (const item of documents) {
    const table = extractOrderCsvTable(item, 240);
    if (!table) continue;

    const platformIndex = findOrderHeaderIndex(table.headers, ['platform', 'platform_focus']);
    const categoryIndex = findOrderHeaderIndex(table.headers, ['category']);
    const skuIndex = findOrderHeaderIndex(table.headers, ['sku']);
    const netSalesIndex = findOrderHeaderIndex(table.headers, ['net_sales', 'net_amount']);
    const inventoryIndexIndex = findOrderHeaderIndex(table.headers, ['inventory_index']);
    const daysOfCoverIndex = findOrderHeaderIndex(table.headers, ['days_of_cover']);
    const riskIndex = findOrderHeaderIndex(table.headers, ['risk_flag', 'risk', 'inventory_risk']);
    const priorityIndex = findOrderHeaderIndex(table.headers, ['replenishment_priority']);
    const recommendationIndex = findOrderHeaderIndex(table.headers, ['recommendation']);

    for (const row of table.rows) {
      const platform = platformIndex >= 0 ? formatOrderSignalLabel(row[platformIndex] || '') : '';
      const category = categoryIndex >= 0 ? formatOrderSignalLabel(row[categoryIndex] || '') : '';
      const sku = skuIndex >= 0 ? sanitizeText(row[skuIndex]).slice(0, 60).trim() : '';
      const netSales = netSalesIndex >= 0 ? parseOrderNumericValue(row[netSalesIndex]) : null;
      const inventoryIndex = inventoryIndexIndex >= 0 ? parseOrderNumericValue(row[inventoryIndexIndex]) : null;
      const daysOfCover = daysOfCoverIndex >= 0 ? parseOrderNumericValue(row[daysOfCoverIndex]) : null;
      const risk = riskIndex >= 0 ? formatOrderSignalLabel(row[riskIndex] || '') : '';
      const priority = priorityIndex >= 0 ? normalizeOrderPriority(row[priorityIndex]) : '';
      const recommendation = recommendationIndex >= 0 ? sanitizeText(row[recommendationIndex]).slice(0, 80).trim() : '';

      if (platform && netSales !== null) addOrderAmount(platformAmounts, platform, netSales);
      if (category && netSales !== null) addOrderAmount(categoryAmounts, category, netSales);

      const subject = sanitizeText(sku || category || platform).slice(0, 60).trim();
      if (!subject) continue;

      const score = scoreOrderRiskHighlight(risk, priority, inventoryIndex, daysOfCover);
      const highlightKey = [normalizeText(subject), normalizeText(platform)].filter(Boolean).join('::');
      if (shouldTreatOrderRiskAsMaterial(risk, priority, inventoryIndex, daysOfCover)) {
        const text = [
          subject,
          platform && subject !== platform ? platform : '',
          risk ? `风险 ${risk}` : '',
          inventoryIndex !== null ? `库存指数 ${inventoryIndex.toFixed(2).replace(/\.00$/, '')}` : '',
          daysOfCover !== null ? `覆盖 ${Math.round(daysOfCover)} 天` : '',
        ]
          .filter(Boolean)
          .join(' / ');
        riskEntries.push({ key: highlightKey, text, score });
      }

      if (priority || recommendation) {
        const text = [
          subject,
          platform && subject !== platform ? platform : '',
          priority ? `优先级 ${priority}` : '',
          recommendation ? `建议 ${recommendation}` : '',
        ]
          .filter(Boolean)
          .join(' / ');
        actionEntries.push({ key: highlightKey, text, score: score + (recommendation ? 1 : 0) });
      }
    }
  }

  return {
    platformAmounts: rankOrderAmounts(platformAmounts, 8),
    categoryAmounts: rankOrderAmounts(categoryAmounts, 8),
    riskHighlights: pickTopOrderHighlights(riskEntries, 4),
    actionHighlights: pickTopOrderHighlights(actionEntries, 4),
  };
}

function collectOrderChannelSignals(item: ParsedDocument) {
  const text = normalizeText([item.title, item.summary, item.excerpt, item.name].join(' '));
  const inferred = [
    containsAny(text, ['tmall', '天猫']) ? 'Tmall' : '',
    containsAny(text, ['jd', '京东']) ? 'JD' : '',
    containsAny(text, ['douyin', '抖音']) ? 'Douyin' : '',
    containsAny(text, ['pinduoduo', '拼多多']) ? 'Pinduoduo' : '',
    containsAny(text, ['amazon']) ? 'Amazon' : '',
    containsAny(text, ['shopify']) ? 'Shopify' : '',
  ].filter(Boolean);

  return [
    ...collectOrderProfileStrings(item, ['platforms', 'platformSignals']).map(formatOrderSignalLabel),
    ...collectOrderCsvValues(item, ['platform', 'platform_focus'], 48, false).map(formatOrderSignalLabel),
    ...inferred,
  ];
}

function collectOrderCategorySignals(item: ParsedDocument) {
  const ignored = new Set([
    '订单分析',
    '库存监控',
    '经营复盘',
    '销量预测',
    '备货建议',
    'order',
    'inventory',
    'report',
    'dashboard',
  ]);

  return [
    ...toStringArray(item.topicTags),
    ...toStringArray(item.groups),
    ...collectOrderProfileStrings(item, ['categorySignals']),
    ...collectOrderCsvValues(item, ['category'], 48, false),
  ]
    .map((value) => sanitizeText(value).slice(0, 60).trim())
    .filter((value) => value && !ignored.has(value.toLowerCase()));
}

function collectOrderMetricSignals(item: ParsedDocument) {
  return collectOrderCsvMetricSignals(item);
}

function collectOrderReplenishmentSignals(item: ParsedDocument) {
  return [
    ...collectOrderProfileStrings(item, ['replenishmentSignals', 'forecastSignals', 'operatingSignals']).map(formatOrderSignalLabel),
    ...collectOrderCsvValues(item, ['replenishment_priority', 'recommendation']).map(formatOrderSignalLabel),
  ];
}

function collectOrderAnomalySignals(item: ParsedDocument) {
  return [
    ...collectOrderProfileStrings(item, ['anomalySignals']).map(formatOrderSignalLabel),
    ...collectOrderCsvValues(item, ['risk_flag', 'risk', 'inventory_risk']).map(formatOrderSignalLabel),
  ];
}

function buildOrderSupportingLines(documents: ParsedDocument[]) {
  const csvLines = documents.flatMap((item) => collectOrderCsvSupportingLines(item, 2));
  if (csvLines.length) return csvLines.slice(0, 6);

  return documents
    .slice(0, 5)
    .map((item) => {
      const title = sanitizeText(item.title || item.name || '订单/库存资料');
      const summary = sanitizeText(item.summary || item.excerpt || '').slice(0, 80).trim();
      return summary ? `${title}：${summary}` : title;
    })
    .filter(Boolean);
}

function buildOrderPageStats(documents: ParsedDocument[]): OrderPageStats {
  const derived = buildOrderCsvDerivedFacts(documents);
  return {
    documentCount: documents.length,
    channels: buildRankedLabelCounts(documents.flatMap(collectOrderChannelSignals), 8),
    categories: buildRankedLabelCounts(documents.flatMap(collectOrderCategorySignals), 8),
    metrics: buildRankedLabelCounts(documents.flatMap(collectOrderMetricSignals), 8),
    replenishment: buildRankedLabelCounts(documents.flatMap(collectOrderReplenishmentSignals), 8),
    anomalies: buildRankedLabelCounts(documents.flatMap(collectOrderAnomalySignals), 8),
    supportingLines: buildOrderSupportingLines(documents),
    platformAmounts: derived.platformAmounts,
    categoryAmounts: derived.categoryAmounts,
    riskHighlights: derived.riskHighlights,
    actionHighlights: derived.actionHighlights,
  };
}

function defaultOrderPageSections(view: OrderRequestView) {
  if (view === 'platform') {
    return ['经营总览', '渠道结构', '平台角色与增量来源', 'SKU动销焦点', '库存与补货', '异常波动解释', 'AI综合分析'];
  }
  if (view === 'category') {
    return ['经营总览', '品类梯队', 'SKU集中度', '动销与毛利焦点', '库存与补货', '异常波动解释', 'AI综合分析'];
  }
  if (view === 'stock') {
    return ['经营总览', '库存健康', '高风险SKU', '动销与周转', '补货优先级', '异常波动解释', 'AI综合分析'];
  }
  return ['经营总览', '渠道结构', 'SKU与品类焦点', '库存与补货', '异常波动解释', '行动建议', 'AI综合分析'];
}

function hasExpectedOrderTitle(view: OrderRequestView, title: string) {
  const normalized = normalizeText(title);
  if (!normalized) return false;
  if (view === 'platform') {
    return containsAny(normalized, ['platform', 'channel', '渠道', '平台']);
  }
  if (view === 'category') {
    return containsAny(normalized, ['category', 'sku', '品类', '类目', '商品']);
  }
  if (view === 'stock') {
    return containsAny(normalized, ['inventory', 'stock', 'replenishment', 'restock', '库存', '补货', '周转']);
  }
  const hasGenericSignal = containsAny(normalized, ['order', 'cockpit', 'dashboard', '经营', '驾驶舱', '多渠道']);
  const hasMultiChannelSignal = containsAny(normalized, ['multi channel', 'multi-channel', 'omni', '多渠道']);
  const hasSpecializedSignal = containsAny(normalized, [
    'inventory', 'stock', 'replenishment', 'restock', '库存', '补货', '周转',
    'category', 'sku', '品类', '类目', '商品',
    'platform', 'channel', '平台', '渠道',
  ]);
  if (!hasGenericSignal) return false;
  if (hasSpecializedSignal && !hasMultiChannelSignal) return false;
  return true;
}

function buildOrderPageTitle(view: OrderRequestView, envelope?: ReportTemplateEnvelope | null) {
  const envelopeTitle = sanitizeText(envelope?.title);
  if (envelopeTitle && hasExpectedOrderTitle(view, envelopeTitle)) return envelopeTitle;
  if (view === 'platform') return '订单渠道经营驾驶舱';
  if (view === 'category') return '订单品类/SKU经营驾驶舱';
  if (view === 'stock') return '库存与补货驾驶舱';
  return '多渠道订单经营驾驶舱';
}

function buildOrderPageSummary(view: OrderRequestView, stats: OrderPageStats) {
  const channelText = joinRankedLabels(stats.channels, 4) || '多渠道经营';
  const categoryText = joinRankedLabels(stats.categories, 4) || 'SKU结构与品类焦点';
  const metricText = joinRankedLabels(stats.metrics, 4) || '库存、动销与趋势信号';
  const actionText = joinRankedLabels(stats.replenishment, 4) || '补货与调拨动作';
  const channelAmountText = joinOrderAmountLabels(stats.platformAmounts, 3);
  const categoryAmountText = joinOrderAmountLabels(stats.categoryAmounts, 3);
  const riskLead = stats.riskHighlights[0] || '';
  const actionLead = stats.actionHighlights[0] || '';

  if (view === 'platform') {
    return `当前命中 ${stats.documentCount} 份订单/库存资料，${channelAmountText ? `渠道净销售额重心落在 ${channelAmountText}` : `渠道信号主要集中在 ${channelText}`}，建议按渠道角色、增量来源和补货动作组织经营驾驶舱，而不是继续做平台平均化复盘。`;
  }
  if (view === 'category') {
    return `当前命中 ${stats.documentCount} 份经营资料，${categoryAmountText ? `品类销售额重心落在 ${categoryAmountText}` : `主题主要落在 ${categoryText}`}，适合按品类梯队、英雄 SKU 集中度、库存压力和动作优先级组织页面。`;
  }
  if (view === 'stock') {
    return `当前命中 ${stats.documentCount} 份库存相关资料，${actionLead ? `最需要前置处理的动作集中在 ${actionLead}` : `风险与动作信号主要集中在 ${actionText}`}，页面应把库存健康、高风险 SKU 和 72 小时补货优先级放在前面。`;
  }
  return `当前命中 ${stats.documentCount} 份订单/库存资料，${channelAmountText ? `渠道净销售额重心落在 ${channelAmountText}` : `渠道重点在 ${channelText}`}，${categoryAmountText ? `品类销售额重心落在 ${categoryAmountText}` : `SKU/品类焦点在 ${categoryText}`}，${riskLead ? `当前最需要前置处理的是 ${riskLead}` : `经营驾驶舱应围绕 ${metricText} 与 ${actionText} 形成一屏可读的动作视图`}。`;
}

function buildOrderPageCards(view: OrderRequestView, stats: OrderPageStats) {
  const channelText = joinOrderAmountLabels(stats.platformAmounts, 2) || joinRankedLabels(stats.channels, 2) || '多渠道';
  const categoryText = joinOrderAmountLabels(stats.categoryAmounts, 2) || joinRankedLabels(stats.categories, 2) || 'SKU焦点';
  const riskText = stats.riskHighlights[0] || joinRankedLabels(stats.anomalies, 2) || joinRankedLabels(stats.replenishment, 2) || '风险信号';
  const metricText = stats.actionHighlights[0] || joinRankedLabels(stats.metrics, 2) || '库存视角';
  const actionText = stats.actionHighlights[0] || joinRankedLabels(stats.replenishment, 2) || '动作优先级';

  if (view === 'stock') {
    return [
      { label: '库存健康指数', value: `${Math.max(stats.metrics.length, 1)} 项`, note: metricText },
      { label: '断货风险SKU', value: `${Math.max(stats.anomalies.length, 1)} 类`, note: riskText },
      { label: '滞销库存池', value: `${Math.max(stats.categories.length, 1)} 组`, note: categoryText },
      { label: '72小时补货动作', value: `${Math.max(stats.replenishment.length, 1)} 条`, note: actionText },
      { label: '跨仓调拨队列', value: `${Math.max(stats.channels.length, 1)} 个渠道/仓别`, note: channelText },
    ];
  }

  if (view === 'category') {
    return [
      { label: '核心品类GMV', value: `${Math.max(stats.categories.length, 1)} 组`, note: categoryText },
      { label: '英雄SKU贡献', value: `${Math.max(stats.categories.length, 1)} 个焦点`, note: categoryText },
      { label: '尾部风险SKU', value: `${Math.max(stats.anomalies.length, 1)} 类`, note: riskText },
      { label: '库存压力', value: `${Math.max(stats.metrics.length, 1)} 项`, note: metricText },
      { label: '动作优先级', value: `${Math.max(stats.replenishment.length, 1)} 条`, note: actionText },
    ];
  }

  return [
    { label: '渠道GMV', value: `${Math.max(stats.channels.length, 1)} 渠道`, note: channelText },
    { label: '动销SKU', value: `${Math.max(stats.categories.length, 1)} 组焦点`, note: categoryText },
    { label: '高风险SKU', value: `${Math.max(stats.anomalies.length, 1)} 类`, note: riskText },
    { label: '库存健康', value: `${Math.max(stats.metrics.length, 1)} 项`, note: metricText },
    { label: '补货优先级', value: `${Math.max(stats.replenishment.length, 1)} 条`, note: actionText },
  ];
}

function buildOrderSectionBlueprints(view: OrderRequestView, summary: string, stats: OrderPageStats) {
  const channelText = joinRankedLabels(stats.channels, 4) || '多渠道经营';
  const categoryText = joinRankedLabels(stats.categories, 4) || 'SKU与品类焦点';
  const metricText = joinRankedLabels(stats.metrics, 4) || '库存与动销信号';
  const actionText = joinRankedLabels(stats.replenishment, 4) || '补货与调拨动作';
  const anomalyText = joinRankedLabels(stats.anomalies, 4) || '异常与波动';
  const channelAmountText = joinOrderAmountLabels(stats.platformAmounts, 4);
  const categoryAmountText = joinOrderAmountLabels(stats.categoryAmounts, 4);
  const riskHighlights = stats.riskHighlights.slice(0, 4);
  const actionHighlights = stats.actionHighlights.slice(0, 4);

  if (view === 'platform') {
    return [
      { body: summary, bullets: stats.supportingLines.slice(0, 3) },
      { body: `渠道角色已经开始分化，当前重点主要集中在 ${channelText}。页面应突出渠道贡献结构，而不是简单平铺平台数据。`, bullets: stats.channels.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `增量来源更适合按“渠道角色 + SKU焦点”理解，当前高频主题主要落在 ${categoryText}。`, bullets: stats.categories.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `库存与补货动作需要跟渠道节奏联动，当前动作信号主要集中在 ${actionText}。`, bullets: stats.replenishment.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `当前异常解释主要来自 ${anomalyText}，需要把短期波动和结构性风险拆开看。`, bullets: stats.anomalies.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: 'AI 综合分析应保持保守：先看渠道角色是否清晰，再看 SKU 焦点和补货动作是否同步，不做无证据的硬数字延伸。', bullets: [
        '优先围绕主渠道与主销 SKU 保证动作时效',
        '把渠道增量和库存压力拆成两条线分别管理',
      ] },
    ];
  }

  if (view === 'category') {
    return [
      { body: summary, bullets: stats.supportingLines.slice(0, 3) },
      { body: `当前品类与 SKU 焦点主要集中在 ${categoryText}，适合用梯队视角看增长结构。`, bullets: stats.categories.map((item) => `${item.label}：${item.value}`).slice(0, 5) },
      { body: '当前更需要识别英雄 SKU 集中度和尾部 SKU 拖累，而不是继续做平铺排行。', bullets: stats.categories.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `库存与补货要跟品类结构一起看，当前指标信号主要集中在 ${metricText}。`, bullets: stats.metrics.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `异常与波动主要来自 ${anomalyText}，需要把增长型焦点和清理型焦点拆开。`, bullets: stats.anomalies.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: 'AI 综合分析应落到品类动作：增长品类保供给，尾部品类控库存，避免继续做没有层次的 SKU 堆砌。', bullets: [
        '英雄 SKU 和尾部 SKU 不应使用同一套补货策略',
        '品类页优先体现结构动作，不要退回排行表视角',
      ] },
    ];
  }

  if (view === 'stock') {
    return [
      { body: summary, bullets: stats.supportingLines.slice(0, 3) },
      { body: `当前库存健康信号主要集中在 ${metricText}，需要把健康度、周转和安全库存放在同一页里看。`, bullets: stats.metrics.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `高风险 SKU 主要集中在 ${anomalyText}，适合形成明确的风险队列。`, bullets: stats.anomalies.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `动销与周转不能只看总库存，当前 SKU 焦点主要落在 ${categoryText}。`, bullets: stats.categories.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `补货优先级应围绕 ${actionText} 做动作编排，越接近头部 SKU，动作时效要求越高。`, bullets: stats.replenishment.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: 'AI 综合分析应把库存页保持在供应链控制室视角，不把它写成泛化销售复盘。', bullets: [
        '优先保障高动销 SKU 的不断货',
        '把长尾库存消化和快反补货拆成两条动作线',
      ] },
    ];
  }

  return [
    { body: summary, bullets: stats.supportingLines.slice(0, 3) },
    {
      body: channelAmountText
        ? `渠道销售额重心已经拉开，当前主要集中在 ${channelAmountText}，页面应先呈现成交重心，再解释渠道角色分工。`
        : `渠道结构当前主要集中在 ${channelText}，应先形成角色分工，再看结构变化。`,
      bullets: (stats.platformAmounts.length
        ? stats.platformAmounts.map((item) => `${item.label}：${formatOrderAmount(item.value)}`)
        : stats.channels.map((item) => `${item.label}：${item.value}`)).slice(0, 4),
    },
    {
      body: categoryAmountText
        ? `品类销售额已经出现明显分层，当前重点主要落在 ${categoryAmountText}，说明经营资源已经向少数主销焦点集中。`
        : `SKU 与品类焦点主要集中在 ${categoryText}，说明经营重心已经偏向少数主销焦点。`,
      bullets: (stats.categoryAmounts.length
        ? stats.categoryAmounts.map((item) => `${item.label}：${formatOrderAmount(item.value)}`)
        : stats.categories.map((item) => `${item.label}：${item.value}`)).slice(0, 4),
    },
    {
      body: actionHighlights[0]
        ? `库存与补货不应只看总库存，当前最需要前置编排的动作集中在 ${actionHighlights[0]}，应同步跟踪库存健康和动作优先级。`
        : `库存与补货信号主要集中在 ${metricText} 与 ${actionText}，应同步看库存健康和动作优先级。`,
      bullets: mergeOrderHighlightBullets(actionHighlights, riskHighlights, 4).length
        ? mergeOrderHighlightBullets(actionHighlights, riskHighlights, 4)
        : stats.replenishment.map((item) => `${item.label}：${item.value}`).slice(0, 4),
    },
    {
      body: riskHighlights[0]
        ? `当前异常波动更像结构性风险而不是单点噪声，最突出的风险集中在 ${riskHighlights[0]}${riskHighlights[1] ? `，以及 ${riskHighlights[1]}` : ''}。`
        : `异常波动主要集中在 ${anomalyText}，需要把活动峰值和结构性压力区分处理。`,
      bullets: riskHighlights.length
        ? riskHighlights
        : stats.anomalies.map((item) => `${item.label}：${item.value}`).slice(0, 4),
    },
    {
      body: actionHighlights[0]
        ? `行动建议应优先把 ${actionHighlights[0]} 放进 72 小时动作清单，再根据渠道角色和主销品类分层安排补货、调拨和去库存。`
        : '行动建议应优先围绕“保主销、控尾部、分渠道角色”三件事展开，而不是继续做泛化经营摘要。',
      bullets: actionHighlights.length
        ? actionHighlights
        : [
            '主渠道与主销 SKU 优先保证动作时效',
            '补货、调拨和去库存动作分层处理',
          ],
    },
      { body: 'AI 综合分析以知识库证据为主，用于帮助经营页形成更清晰的决策节奏，不补写无依据的硬指标。', bullets: [
        '页面适合用于经营复盘、动作共识和客户展示',
      ] },
  ];
}

function buildOrderPageCharts(view: OrderRequestView, stats: OrderPageStats) {
  if (view === 'stock') {
    return [
      { title: '库存健康指数', items: stats.metrics.slice(0, 6) },
      { title: '断货/超库存风险队列', items: stats.anomalies.slice(0, 6) },
      { title: 'SKU周转压力', items: stats.categories.slice(0, 6) },
      { title: '72小时补货优先级', items: stats.replenishment.slice(0, 6) },
    ].filter((item) => item.items.length);
  }

  if (view === 'category') {
    return [
      { title: '品类梯队结构', items: (stats.categoryAmounts.length ? stats.categoryAmounts : stats.categories).slice(0, 6) },
      { title: 'SKU集中度', items: (stats.categoryAmounts.length ? stats.categoryAmounts : stats.categories).slice(0, 6) },
      { title: '库存与周转压力', items: stats.metrics.slice(0, 6) },
      { title: '动作优先级', items: stats.replenishment.slice(0, 6) },
    ].filter((item) => item.items.length);
  }

  if (view === 'platform') {
    return [
      { title: '渠道贡献结构', items: (stats.platformAmounts.length ? stats.platformAmounts : stats.channels).slice(0, 6) },
      { title: 'SKU动销焦点', items: (stats.categoryAmounts.length ? stats.categoryAmounts : stats.categories).slice(0, 6) },
      { title: '库存/趋势信号', items: stats.metrics.slice(0, 6) },
      { title: '补货动作优先级', items: stats.replenishment.slice(0, 6) },
    ].filter((item) => item.items.length);
  }

  return [
    { title: '渠道贡献结构', items: (stats.platformAmounts.length ? stats.platformAmounts : stats.channels).slice(0, 6) },
    { title: 'SKU与品类焦点', items: (stats.categoryAmounts.length ? stats.categoryAmounts : stats.categories).slice(0, 6) },
    { title: '库存与趋势信号', items: stats.metrics.slice(0, 6) },
    { title: '补货动作优先级', items: stats.replenishment.slice(0, 6) },
  ].filter((item) => item.items.length);
}

function normalizeStockCardShell(cards: NonNullable<KnowledgePageOutput['page']['cards']>) {
  return cards.map((card) => {
    const label = sanitizeText(card.label);
    if (label === '库存健康') return { ...card, label: '库存健康指数' };
    if (label === '高风险SKU') return { ...card, label: '断货风险SKU' };
    if (label === '缺货风险SKU') return { ...card, label: '断货风险SKU' };
    if (label === '滞销库存占比') return { ...card, label: '滞销库存池' };
    if (label === '补货优先级') return { ...card, label: '72小时补货动作' };
    if (label === '建议补货量') return { ...card, label: '72小时补货动作' };
    if (label === '跨仓调拨') return { ...card, label: '跨仓调拨队列' };
    return card;
  });
}

function normalizeStockChartShell(charts: NonNullable<KnowledgePageOutput['page']['charts']>) {
  return charts.map((chart) => {
    const title = sanitizeText(chart.title);
    if (title === '库存健康信号') return { ...chart, title: '库存健康指数' };
    if (title === '高风险SKU队列') return { ...chart, title: '断货/超库存风险队列' };
    if (title === 'SKU周转/库存压力') return { ...chart, title: 'SKU周转压力' };
    return chart;
  });
}

function looksLikeJsonEchoText(value: string) {
  const text = sanitizeText(value);
  if (!text) return false;
  return text.startsWith('{')
    || text.startsWith('[')
    || /"(?:title|summary|page|cards|sections|charts|items)"\s*:/.test(text);
}

function normalizeGenericCardShell(cards: NonNullable<KnowledgePageOutput['page']['cards']>) {
  return cards.map((card) => {
    const label = normalizeText(card.label || '');
    if (label === normalizeText('\u5e93\u5b58\u5065\u5eb7')) {
      return { ...card, label: '\u5e93\u5b58\u5065\u5eb7\u6307\u6570' };
    }
    if (label === normalizeText('\u0037\u0032\u5c0f\u65f6\u8865\u8d27\u52a8\u4f5c')) {
      return { ...card, label: '\u8865\u8d27\u4f18\u5148\u7ea7' };
    }
    return card;
  });
}

function normalizeGenericChartShell(charts: NonNullable<KnowledgePageOutput['page']['charts']>) {
  return charts.map((chart) => {
    const title = normalizeText(chart.title || '');
    if (title === normalizeText('\u0053\u004b\u0055\u4e0e\u54c1\u7c7b\u7126\u70b9')) {
      return { ...chart, title: '\u54c1\u7c7b\u68af\u961f\u4e0e\u82f1\u96c4SKU' };
    }
    if (title === normalizeText('\u5e93\u5b58\u4e0e\u8d8b\u52bf\u4fe1\u53f7')) {
      return { ...chart, title: '\u5e93\u5b58\u5065\u5eb7\u4e0e\u8865\u8d27\u4f18\u5148\u7ea7' };
    }
    return chart;
  });
}

function dedupePageCards(cards: NonNullable<KnowledgePageOutput['page']['cards']>) {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = normalizeText(card.label || card.value || card.note || '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildStockShellCards(
  primary: NonNullable<KnowledgePageOutput['page']['cards']>,
  fallback: NonNullable<KnowledgePageOutput['page']['cards']>,
) {
  const preferredOrder = [
    '库存健康指数',
    '断货风险SKU',
    '滞销库存池',
    '72小时补货动作',
    '跨仓调拨队列',
  ];
  const byLabel = new Map<string, { label?: string; value?: string; note?: string }>();
  for (const card of normalizeStockCardShell(fallback)) {
    const key = normalizeText(card.label || '');
    if (key) byLabel.set(key, card);
  }
  for (const card of normalizeStockCardShell(primary)) {
    const key = normalizeText(card.label || '');
    if (key) byLabel.set(key, card);
  }
  return preferredOrder
    .map((label) => byLabel.get(normalizeText(label)))
    .filter(Boolean) as NonNullable<KnowledgePageOutput['page']['cards']>;
}

function buildStockShellCharts(
  primary: NonNullable<KnowledgePageOutput['page']['charts']>,
  fallback: NonNullable<KnowledgePageOutput['page']['charts']>,
) {
  const preferredOrder = [
    '库存健康指数',
    '断货/超库存风险队列',
  ];
  const byTitle = new Map<string, { title?: string; items?: Array<{ label?: string; value?: number }> }>();
  for (const chart of normalizeStockChartShell(fallback)) {
    const key = normalizeText(chart.title || '');
    if (key) byTitle.set(key, chart);
  }
  for (const chart of normalizeStockChartShell(primary)) {
    const key = normalizeText(chart.title || '');
    if (key) byTitle.set(key, chart);
  }
  return preferredOrder
    .map((title) => byTitle.get(normalizeText(title)))
    .filter(Boolean) as NonNullable<KnowledgePageOutput['page']['charts']>;
}

function buildGenericShellCards(
  primary: NonNullable<KnowledgePageOutput['page']['cards']>,
  fallback: NonNullable<KnowledgePageOutput['page']['cards']>,
) {
  const preferredOrder = [
    '\u6e20\u9053GMV',
    '\u52a8\u9500SKU',
    '\u9ad8\u98ce\u9669SKU',
    '\u8865\u8d27\u4f18\u5148\u7ea7',
    '\u5e93\u5b58\u5065\u5eb7\u6307\u6570',
  ];
  const byLabel = new Map<string, { label?: string; value?: string; note?: string }>();
  for (const card of normalizeGenericCardShell(fallback)) {
    const key = normalizeText(card.label || '');
    if (key) byLabel.set(key, card);
  }
  for (const card of normalizeGenericCardShell(primary)) {
    const key = normalizeText(card.label || '');
    if (key) byLabel.set(key, card);
  }
  return preferredOrder
    .map((label) => byLabel.get(normalizeText(label)))
    .filter(Boolean) as NonNullable<KnowledgePageOutput['page']['cards']>;
}

function buildGenericShellCharts(
  primary: NonNullable<KnowledgePageOutput['page']['charts']>,
  fallback: NonNullable<KnowledgePageOutput['page']['charts']>,
) {
  const preferredOrder = [
    '\u6e20\u9053\u8d21\u732e\u7ed3\u6784',
    '\u54c1\u7c7b\u68af\u961f\u4e0e\u82f1\u96c4SKU',
    '\u5e93\u5b58\u5065\u5eb7\u4e0e\u8865\u8d27\u4f18\u5148\u7ea7',
  ];
  const byTitle = new Map<string, { title?: string; items?: Array<{ label?: string; value?: number }> }>();
  for (const chart of normalizeGenericChartShell(fallback)) {
    const key = normalizeText(chart.title || '');
    if (key) byTitle.set(key, chart);
  }
  for (const chart of normalizeGenericChartShell(primary)) {
    const key = normalizeText(chart.title || '');
    if (key) byTitle.set(key, chart);
  }
  return preferredOrder
    .map((title) => byTitle.get(normalizeText(title)))
    .filter(Boolean) as NonNullable<KnowledgePageOutput['page']['charts']>;
}

function mergeOrderPageSections(
  primary: NonNullable<KnowledgePageOutput['page']['sections']>,
  fallback: NonNullable<KnowledgePageOutput['page']['sections']>,
) {
  return fallback.map((fallbackSection, index) => {
    const source = primary[index];
    if (!source) return fallbackSection;
    const body = sanitizeText(source.body);
    const useFallbackBody = !body || looksLikeJsonEchoText(body);
    const bullets = (source.bullets || []).filter((item) => sanitizeText(item));
    return {
      title: sanitizeText(source.title) || fallbackSection.title,
      body: useFallbackBody ? fallbackSection.body : source.body,
      bullets: bullets.length ? bullets : fallbackSection.bullets,
    };
  });
}

function buildOrderPageOutput(
  view: OrderRequestView,
  documents: ParsedDocument[],
  envelope?: ReportTemplateEnvelope | null,
): KnowledgePageOutput {
  const stats = buildOrderPageStats(documents);
  const summary = buildOrderPageSummary(view, stats);
  const sectionTitles = envelope?.pageSections?.length ? envelope.pageSections : defaultOrderPageSections(view);
  const blueprints = buildOrderSectionBlueprints(view, summary, stats);

  return {
    type: 'page',
    title: buildOrderPageTitle(view, envelope),
    content: summary,
    format: 'html',
    page: {
      summary,
      cards: buildOrderPageCards(view, stats),
      sections: sectionTitles.map((title, index) => {
        const section = blueprints[index] || { body: '', bullets: [] as string[] };
        return {
          title,
          body: section.body || (index === 0 ? summary : ''),
          bullets: section.bullets || [],
        };
      }),
      charts: buildOrderPageCharts(view, stats),
    },
  };
}

function hydrateOrderPageVisualShell(
  view: OrderRequestView,
  documents: ParsedDocument[],
  envelope: ReportTemplateEnvelope | null | undefined,
  page: KnowledgePageOutput['page'],
) {
  const fallbackPage = buildOrderPageOutput(view, documents, envelope).page;
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

  return {
    summary: page.summary || fallbackPage.summary,
    cards: view === 'stock'
      ? buildStockShellCards(page.cards || [], fallbackPage.cards || [])
      : buildGenericShellCards(
          mergeCards(page.cards || [], fallbackPage.cards || [], 5),
          fallbackPage.cards || [],
        ),
    sections: page.sections?.length
      ? mergeOrderPageSections(page.sections, fallbackPage.sections || [])
      : fallbackPage.sections,
    charts: view === 'stock'
      ? buildStockShellCharts(
          mergeCharts(page.charts || [], fallbackPage.charts || [], 2),
          fallbackPage.charts || [],
        )
      : buildGenericShellCharts(
          mergeCharts(page.charts || [], fallbackPage.charts || [], 3),
          fallbackPage.charts || [],
        ),
  };
}

function countResumePipeEchoSections(sections: Array<{ title?: string; body?: string; bullets?: string[] }>) {
  return sections.filter((section) => (
    sanitizeText(section.body).includes(' | ')
    || (section.bullets || []).some((item) => sanitizeText(item).includes(' | '))
  )).length;
}

function hasExpectedResumeTitle(view: ResumeRequestView, title: string) {
  const normalized = normalizeText(title);
  if (!normalized) return false;
  if (view === 'client') {
    return containsAny(normalized, ['client', 'customer', '\u5ba2\u6237', '\u6c47\u62a5', '\u63a8\u8350', '\u5339\u914d']);
  }
  if (view === 'skill') return containsAny(normalized, ['skill', '\u6280\u80fd']);
  if (view === 'company') return containsAny(normalized, ['company', '\u516c\u53f8']);
  if (view === 'project') return containsAny(normalized, ['project', '\u9879\u76ee']);
  return containsAny(normalized, ['talent', 'candidate', '\u4eba\u624d', '\u5019\u9009\u4eba']);
}

function hasSuspiciousResumeHardMetrics(view: ResumeRequestView, text: string) {
  if (view !== 'company' && view !== 'project' && view !== 'client') return false;
  return /(?:\d+(?:\.\d+)?%|\d+(?:\.\d+)?(?:亿|万|k|K)|\d+\+)/.test(text);
}

function shouldUseResumePageFallback(
  view: ResumeRequestView,
  title: string,
  page: NonNullable<Exclude<ChatOutput, { type: 'answer' }>['page']>,
) {
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
  if (!hasExpectedResumeTitle(view, title)) return true;
  if ((view === 'client' || view === 'skill') && pipeEchoSections >= 2) return true;
  if (pipeEchoSections >= 3 && charts.length <= 1) return true;
  if (hasSuspiciousResumeHardMetrics(view, pageText)) return true;
  return false;
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
  displayProfiles: ResumeDisplayProfile[] = [],
): ChatOutput {
  const view = resolveResumeRequestView(requestText);
  const resumeDocuments = documents.filter((item) => item.schemaType === 'resume');
  const orderDocuments = documents.filter(isOrderInventoryDocument);
  const orderView = orderDocuments.length ? resolveOrderRequestView(requestText) : 'generic';

  if (resumeDocuments.length) {
    if (kind === 'page' || kind === 'pdf' || kind === 'ppt') {
      const page = buildResumePageOutput(view, resumeDocuments, envelope, displayProfiles);
      return wrapPageOutputAsKind(kind, page);
    }

    if (kind === 'table') {
      if (view === 'company') {
        const rows = buildResumeCompanyProjectRows(resumeDocuments, displayProfiles);
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
        const rows = buildResumeProjectRows(resumeDocuments, displayProfiles);
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
        const rows = buildResumeSkillRows(resumeDocuments, displayProfiles);
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
        const rows = buildResumeTalentRows(resumeDocuments, displayProfiles);
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

  if (orderDocuments.length && (kind === 'page' || kind === 'pdf' || kind === 'ppt')) {
    const page = buildOrderPageOutput(orderView, orderDocuments, envelope);
    return wrapPageOutputAsKind(kind, page);
  }

  return buildGenericFallbackOutput(kind, requestText, '', envelope);
}

export function normalizeReportOutput(
  kind: 'table' | 'page' | 'pdf' | 'ppt',
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
  const title = pickString(envelope?.title, effectivePayload.title, payload.title, root.title, buildDefaultTitle(kind));
  const content = pickString(
    effectivePayload.content,
    effectivePayload.summary,
    payload.content,
    payload.summary,
    root.content,
    rawContent,
  );

  if (kind === 'page' || kind === 'pdf' || kind === 'ppt') {
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
      return buildSupplyEchoPageOutput(kind, title, supplyEchoSource, envelope);
    }

    const summary = pickString(pageSource.summary, effectivePayload.summary, payload.summary, root.summary, content);
    const cards = normalizeCards(pageSource.cards || effectivePayload.cards || payload.cards || root.cards);
    const rawSections = normalizeSections(pageSource.sections || effectivePayload.sections || payload.sections || root.sections);
    const alignedSections = envelope?.pageSections?.length
      ? alignSectionsToEnvelope(rawSections, envelope.pageSections, summary)
      : rawSections;
    const charts = normalizeCharts(pageSource.charts || effectivePayload.charts || payload.charts || root.charts);
    const effectiveSections = alignedSections.length ? alignedSections : rawSections;
    const resumeDocuments = documents.filter((item) => item.schemaType === 'resume');
    const orderDocuments = documents.filter(isOrderInventoryDocument);
    const resumeView = resumeDocuments.length ? resolveResumeRequestView(requestText) : 'generic';
    const orderView = orderDocuments.length ? resolveOrderRequestView(requestText) : 'generic';

    if (looksLikePromptEchoPage(requestText, summary, content, cards, effectiveSections)) {
      if (orderDocuments.length) {
        return buildKnowledgeFallbackOutput(kind, requestText, orderDocuments, envelope, displayProfiles);
      }
      if (resumeDocuments.length) {
        return buildKnowledgeFallbackOutput(kind, requestText, resumeDocuments, envelope, displayProfiles);
      }
      return buildPromptEchoFallbackOutput(kind, title, requestText, envelope);
    }
    const normalizedTitle = resumeDocuments.length
      ? buildResumePageTitle(resumeView, envelope)
      : orderDocuments.length
        ? buildOrderPageTitle(orderView, envelope)
        : title;

    const normalizedOutput: ChatOutput = {
      type: kind === 'page' ? 'page' : kind,
      title: normalizedTitle,
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

    if (resumeDocuments.length && normalizedOutput.page) {
      normalizedOutput.page = hydrateResumePageVisualShell(
        resumeView,
        resumeDocuments,
        envelope,
        displayProfiles,
        normalizedOutput.page,
      );
    }

    if (!resumeDocuments.length && orderDocuments.length && normalizedOutput.page) {
      normalizedOutput.page = hydrateOrderPageVisualShell(
        orderView,
        orderDocuments,
        envelope,
        normalizedOutput.page,
      );
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
  const view = resolveResumeRequestView(requestText);
  return shouldUseResumePageFallback(view, output.title, output.page);
}
