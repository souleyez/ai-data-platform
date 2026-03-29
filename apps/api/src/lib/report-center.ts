import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import { loadDocumentLibraries } from './document-libraries.js';
import type { ParsedDocument } from './document-parser.js';
import { loadParsedDocuments, matchDocumentsByPrompt } from './document-store.js';
import { normalizeReportOutput } from './knowledge-output.js';
import { buildReportPlan, inferReportPlanTaskHint } from './report-planner.js';
import { adaptTemplateEnvelopeForRequest } from './report-template-adapter.js';
import { isOpenClawGatewayConfigured, runOpenClawChat } from './openclaw-adapter.js';
import { STORAGE_CONFIG_DIR, STORAGE_FILES_DIR, STORAGE_ROOT } from './paths.js';

const REPORT_CONFIG_DIR = STORAGE_CONFIG_DIR;
const REPORT_REFERENCE_DIR = path.join(STORAGE_FILES_DIR, 'report-references');
const REPORT_STATE_FILE = path.join(REPORT_CONFIG_DIR, 'report-center.json');

export type ReportTemplateType = 'table' | 'static-page' | 'ppt' | 'document';

export type ReportReferenceSourceType = 'word' | 'ppt' | 'spreadsheet' | 'image' | 'web-link' | 'other';

export type ReportReferenceImage = {
  id: string;
  fileName: string;
  originalName: string;
  uploadedAt: string;
  relativePath: string;
  kind?: 'file' | 'link';
  sourceType?: ReportReferenceSourceType;
  mimeType?: string;
  size?: number;
  url?: string;
};

export type ReportGroupTemplate = {
  key: string;
  label: string;
  type: ReportTemplateType;
  description: string;
  supported: boolean;
};

export type ReportGroup = {
  key: string;
  label: string;
  description: string;
  triggerKeywords: string[];
  defaultTemplateKey: string;
  templates: ReportGroupTemplate[];
  referenceImages: ReportReferenceImage[];
};

export type SharedReportTemplate = {
  key: string;
  label: string;
  type: ReportTemplateType;
  description: string;
  supported: boolean;
  isDefault?: boolean;
  origin?: 'system' | 'user';
  createdAt?: string;
  referenceImages: ReportReferenceImage[];
};

export type ReportTemplateEnvelope = {
  title: string;
  fixedStructure: string[];
  variableZones: string[];
  outputHint: string;
  tableColumns?: string[];
  pageSections?: string[];
};

export type ReportDynamicSource = {
  enabled: boolean;
  request: string;
  outputType: 'table' | 'page' | 'ppt' | 'pdf';
  conceptMode?: boolean;
  templateKey?: string;
  templateLabel?: string;
  timeRange?: string;
  contentFocus?: string;
  libraries: Array<{ key?: string; label?: string }>;
  updatedAt?: string;
  lastRenderedAt?: string;
  sourceFingerprint?: string;
  sourceDocumentCount?: number;
  sourceUpdatedAt?: string;
  planAudience?: string;
  planObjective?: string;
  planTemplateMode?: string;
  planSectionTitles?: string[];
  planCardLabels?: string[];
  planChartTitles?: string[];
  planUpdatedAt?: string;
};

export type ReportOutputRecord = {
  id: string;
  groupKey: string;
  groupLabel: string;
  templateKey: string;
  templateLabel: string;
  title: string;
  outputType: string;
  kind?: 'table' | 'page' | 'ppt' | 'pdf';
  format?: string;
  createdAt: string;
  status: 'ready';
  summary: string;
  triggerSource: 'report-center' | 'chat';
  content?: string;
  table?: {
    columns?: string[];
    rows?: Array<Array<string | number | null>>;
    title?: string;
  } | null;
  page?: {
    summary?: string;
    cards?: Array<{ label?: string; value?: string; note?: string }>;
    sections?: Array<{ title?: string; body?: string; bullets?: string[] }>;
    charts?: Array<{ title?: string; items?: Array<{ label?: string; value?: number }> }>;
  } | null;
  libraries?: Array<{ key?: string; label?: string }>;
  downloadUrl?: string;
  dynamicSource?: ReportDynamicSource | null;
};

function getExtensionFromPathLike(value: string) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  const pathname = normalized.split('?')[0].split('#')[0];
  return path.extname(pathname);
}

function normalizeReferenceUrl(rawUrl: string) {
  const value = String(rawUrl || '').trim();
  if (!value) throw new Error('reference url is required');

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('reference url is invalid');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('reference url must use http or https');
  }

  return parsed.toString();
}

export function inferReportReferenceSourceType(input: {
  fileName?: string;
  mimeType?: string;
  url?: string;
}): ReportReferenceSourceType {
  const normalizedMimeType = String(input.mimeType || '').trim().toLowerCase();
  const normalizedUrl = String(input.url || '').trim();
  const extension = getExtensionFromPathLike(input.fileName || normalizedUrl);

  if (normalizedUrl && !extension) {
    return 'web-link';
  }

  if (['.doc', '.docx', '.rtf', '.odt'].includes(extension)) return 'word';
  if (['.ppt', '.pptx', '.pptm', '.key'].includes(extension)) return 'ppt';
  if (['.xls', '.xlsx', '.csv', '.tsv', '.ods'].includes(extension)) return 'spreadsheet';
  if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'].includes(extension)) return 'image';

  if (normalizedMimeType.includes('word') || normalizedMimeType.includes('officedocument.wordprocessingml')) return 'word';
  if (normalizedMimeType.includes('presentation') || normalizedMimeType.includes('powerpoint')) return 'ppt';
  if (normalizedMimeType.includes('spreadsheet') || normalizedMimeType.includes('excel') || normalizedMimeType.includes('csv')) return 'spreadsheet';
  if (normalizedMimeType.startsWith('image/')) return 'image';

  return normalizedUrl ? 'web-link' : 'other';
}

export function inferReportTemplateTypeFromSource(input: {
  fileName?: string;
  mimeType?: string;
  url?: string;
  sourceType?: ReportReferenceSourceType;
}): ReportTemplateType {
  const sourceType = input.sourceType || inferReportReferenceSourceType(input);
  if (sourceType === 'ppt') return 'ppt';
  if (sourceType === 'spreadsheet') return 'table';
  if (sourceType === 'word') return 'document';
  if (sourceType === 'image' || sourceType === 'web-link') return 'static-page';
  return 'document';
}

function normalizeReportReferenceImage(reference: Partial<ReportReferenceImage> | null | undefined): ReportReferenceImage | null {
  if (!reference) return null;

  const url = String(reference.url || '').trim();
  const kind = url ? 'link' : (reference.kind === 'link' ? 'link' : 'file');
  const normalizedUrl = kind === 'link' && url ? normalizeReferenceUrl(url) : '';
  const sourceType =
    reference.sourceType
    || inferReportReferenceSourceType({
      fileName: reference.originalName || reference.fileName,
      mimeType: reference.mimeType,
      url: normalizedUrl,
    });

  return {
    id: String(reference.id || buildId('ref')),
    fileName: String(reference.fileName || '').trim(),
    originalName: String(reference.originalName || reference.fileName || normalizedUrl || '未命名上传内容').trim(),
    uploadedAt: String(reference.uploadedAt || '').trim() || new Date().toISOString(),
    relativePath: String(reference.relativePath || '').trim(),
    kind,
    sourceType,
    mimeType: String(reference.mimeType || '').trim(),
    size: Number(reference.size || 0) || 0,
    url: normalizedUrl,
  };
}

function normalizePath(filePath: string) {
  return path.resolve(String(filePath || ''));
}

function startsWithPath(filePath: string, rootPath: string) {
  const normalizedFile = normalizePath(filePath).toLowerCase();
  const normalizedRoot = normalizePath(rootPath).toLowerCase();
  return normalizedFile === normalizedRoot || normalizedFile.startsWith(`${normalizedRoot}${path.sep}`.toLowerCase());
}

function normalizeReferenceName(value: string) {
  return String(value || '').trim().toLowerCase();
}

export function isUserSharedReportTemplate(template: Pick<SharedReportTemplate, 'key' | 'origin'> | null | undefined) {
  const origin = String(template?.origin || '').trim().toLowerCase();
  if (origin) return origin === 'user';
  return !String(template?.key || '').startsWith('shared-');
}

export function findDuplicateSharedTemplateReference(
  templates: SharedReportTemplate[],
  input: {
    fileName?: string;
    url?: string;
  },
) {
  const normalizedFileName = normalizeReferenceName(input.fileName || '');
  const normalizedUrl = String(input.url || '').trim() ? normalizeReferenceUrl(String(input.url || '').trim()) : '';
  if (!normalizedFileName && !normalizedUrl) return null;

  for (const template of templates || []) {
    if (!isUserSharedReportTemplate(template)) continue;
    for (const reference of template.referenceImages || []) {
      const referenceName = normalizeReferenceName(reference.originalName || reference.fileName || '');
      const referenceUrl = String(reference.url || '').trim();
      const duplicated =
        (normalizedFileName && referenceName === normalizedFileName)
        || (normalizedUrl && referenceUrl === normalizedUrl);

      if (duplicated) {
        return {
          templateKey: template.key,
          templateLabel: template.label,
          referenceId: reference.id,
          uploadName: reference.url || reference.originalName || reference.fileName || template.label,
        };
      }
    }
  }

  return null;
}

function resolveReferenceFilePath(reference: ReportReferenceImage) {
  const relativePath = String(reference.relativePath || '').trim();
  if (!relativePath || reference.kind === 'link' || reference.url) return '';

  const resolved = normalizePath(path.resolve(STORAGE_ROOT, relativePath));
  return startsWithPath(resolved, REPORT_REFERENCE_DIR) ? resolved : '';
}

async function deleteStoredReferenceFile(reference: ReportReferenceImage) {
  const filePath = resolveReferenceFilePath(reference);
  if (!filePath) return false;

  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false;
    throw error;
  }
}

function summarizeTableForAnalysis(table?: ReportOutputRecord['table']) {
  const columns = Array.isArray(table?.columns) ? table.columns : [];
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const previewRows = rows.slice(0, 6).map((row) => row.map((cell) => String(cell ?? '')).join(' | '));
  return [
    columns.length ? `表头：${columns.join('、')}` : '',
    rows.length ? `数据行数：${rows.length}` : '',
    previewRows.length ? `样例数据：\n${previewRows.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function summarizePageForAnalysis(page?: ReportOutputRecord['page']) {
  const cards = Array.isArray(page?.cards) ? page.cards : [];
  const sections = Array.isArray(page?.sections) ? page.sections : [];
  const charts = Array.isArray(page?.charts) ? page.charts : [];
  return [
    page?.summary ? `摘要：${page.summary}` : '',
    cards.length ? `指标卡片：${cards.map((item) => `${item.label || ''}${item.value ? `=${item.value}` : ''}`).join('；')}` : '',
    sections.length ? `分节：${sections.map((item) => item.title).filter(Boolean).join('、')}` : '',
    charts.length ? `图表：${charts.map((item) => item.title).filter(Boolean).join('、')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildLocalReportAnalysis(record: {
  groupLabel: string;
  templateLabel: string;
  kind?: 'table' | 'page' | 'ppt' | 'pdf';
  table?: ReportOutputRecord['table'];
  page?: ReportOutputRecord['page'];
  content?: string;
}) {
  if (record.kind === 'page') {
    const cards = record.page?.cards || [];
    const strongestCard = cards[0];
    return [
      `${record.groupLabel} 的当前输出已经按 ${record.templateLabel} 组织完成。`,
      strongestCard?.label && strongestCard?.value
        ? `当前最值得优先关注的是 ${strongestCard.label}，样例值为 ${strongestCard.value}。`
        : '当前最值得优先关注的是经营摘要、核心指标和异常波动之间的关系。',
      '建议结合知识库证据继续补充关键原因、风险点和下一步动作，使结果更适合直接汇报或转发。',
    ].join('');
  }

  const rowCount = Array.isArray(record.table?.rows) ? record.table.rows.length : 0;
  const firstColumn = Array.isArray(record.table?.columns) ? record.table?.columns?.[0] : '';
  return [
    `${record.groupLabel} 的当前输出已经按 ${record.templateLabel} 形成结构化表格。`,
    rowCount ? `当前共整理 ${rowCount} 行核心内容` : '当前已整理出核心条目',
    firstColumn ? `，建议优先复核“${firstColumn}”这一主维度下的结论一致性。` : '，建议优先复核主要结论与证据的一致性。',
    '如果需要进一步增强，可继续补充筛选范围、排序逻辑或重点字段。',
  ].join('');
}

async function buildCloudReportAnalysis(record: {
  groupLabel: string;
  templateLabel: string;
  kind?: 'table' | 'page' | 'ppt' | 'pdf';
  table?: ReportOutputRecord['table'];
  page?: ReportOutputRecord['page'];
  content?: string;
  libraries?: ReportOutputRecord['libraries'];
}) {
  if (!isOpenClawGatewayConfigured()) {
    return '';
  }

  const context = [
    record.kind === 'page' ? summarizePageForAnalysis(record.page) : summarizeTableForAnalysis(record.table),
    record.content ? `正文：${record.content}` : '',
    Array.isArray(record.libraries) && record.libraries.length
      ? `知识库：${record.libraries.map((item) => item.label || item.key).filter(Boolean).join('、')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  if (!context) return '';

  try {
    const response = await runOpenClawChat({
      prompt: [
        `请基于以下${record.kind === 'page' ? '静态页' : '报表'}内容，输出一段“AI综合分析”。`,
        '要求：',
        '1. 只输出一段自然中文，不要标题，不要编号，不要 Markdown。',
        '2. 聚焦核心发现、风险点、可执行建议。',
        '3. 120 到 220 字。',
        '',
        context,
      ].join('\n'),
      systemPrompt: [
        '你是企业知识分析助手。',
        '你的任务是根据已经整理好的报表内容，生成一段克制、专业、适合业务阅读的综合分析。',
        '不要重复表格原文，不要使用括号、星号、井号、分隔线。',
      ].join('\n'),
    });

    return String(response.content || '').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

async function attachReportAnalysis(record: ReportOutputRecord) {
  const analysis =
    (await buildCloudReportAnalysis(record)) ||
    buildLocalReportAnalysis(record);

  if (!analysis) return record;

  if (record.kind === 'page') {
    const sections = Array.isArray(record.page?.sections) ? [...record.page.sections] : [];
    const filteredSections = sections.filter((item) => String(item?.title || '').trim() !== 'AI综合分析');
    filteredSections.push({
      title: 'AI综合分析',
      body: analysis,
      bullets: [],
    });
    return {
      ...record,
      page: {
        ...(record.page || {}),
        sections: filteredSections,
      },
    };
  }

  const table = record.table || { columns: ['结论', '说明'], rows: [] };
  const columns = Array.isArray(table.columns) && table.columns.length ? table.columns : ['结论', '说明'];
  const rows = Array.isArray(table.rows) ? [...table.rows] : [];
  const filteredRows = rows.filter((row) => String(row?.[0] || '').trim() !== 'AI综合分析');
  const analysisRow =
    columns.length === 1
      ? [`AI综合分析：${analysis}`]
      : ['AI综合分析', analysis, ...new Array(Math.max(0, columns.length - 2)).fill('')];
  filteredRows.push(analysisRow);

  return {
    ...record,
    table: {
      ...table,
      columns,
      rows: filteredRows,
    },
  };
}

function attachLocalReportAnalysis(record: ReportOutputRecord) {
  const analysis = buildLocalReportAnalysis(record);
  if (!analysis) return record;

  if (record.kind === 'page') {
    const sections = Array.isArray(record.page?.sections) ? [...record.page.sections] : [];
    if (!sections.some((item) => String(item?.title || '').trim() === 'AI综合分析')) {
      sections.push({ title: 'AI综合分析', body: analysis, bullets: [] });
    }
    return {
      ...record,
      page: {
        ...(record.page || {}),
        sections,
      },
    };
  }

  const table = record.table || { columns: ['结论', '说明'], rows: [] };
  const columns = Array.isArray(table.columns) && table.columns.length ? table.columns : ['结论', '说明'];
  const rows = Array.isArray(table.rows) ? [...table.rows] : [];
  if (!rows.some((row) => String(row?.[0] || '').trim() === 'AI综合分析')) {
    rows.push(columns.length === 1 ? [`AI综合分析：${analysis}`] : ['AI综合分析', analysis, ...new Array(Math.max(0, columns.length - 2)).fill('')]);
  }
  return {
    ...record,
    table: {
      ...table,
      columns,
      rows,
    },
  };
}

function normalizeDynamicSource(
  dynamicSource: Partial<ReportDynamicSource> | null | undefined,
  fallback: {
    request?: string;
    kind?: ReportOutputRecord['kind'];
    templateKey?: string;
    templateLabel?: string;
    libraries?: ReportOutputRecord['libraries'];
  },
): ReportDynamicSource | null {
  const enabled = Boolean(dynamicSource?.enabled) || fallback.kind === 'page';
  const outputType = (dynamicSource?.outputType || fallback.kind || 'page') as 'table' | 'page' | 'ppt' | 'pdf';
  const conceptMode = Boolean(dynamicSource?.conceptMode)
    || (outputType === 'page' && !String(dynamicSource?.templateKey || '').trim());
  const libraries = Array.isArray(dynamicSource?.libraries) && dynamicSource?.libraries.length
    ? dynamicSource.libraries
    : Array.isArray(fallback.libraries)
      ? fallback.libraries
      : [];

  if (!enabled || !libraries.length) return null;

  return {
    enabled: true,
    request: String(dynamicSource?.request || fallback.request || '').trim(),
    outputType,
    conceptMode,
    templateKey: conceptMode ? '' : String(dynamicSource?.templateKey || fallback.templateKey || '').trim(),
    templateLabel: conceptMode ? '' : String(dynamicSource?.templateLabel || fallback.templateLabel || '').trim(),
    timeRange: String(dynamicSource?.timeRange || '').trim(),
    contentFocus: String(dynamicSource?.contentFocus || '').trim(),
    libraries: libraries
      .map((item) => ({
        key: String(item?.key || '').trim(),
        label: String(item?.label || '').trim(),
      }))
      .filter((item) => item.key || item.label),
    updatedAt: String(dynamicSource?.updatedAt || new Date().toISOString()).trim(),
    lastRenderedAt: String(dynamicSource?.lastRenderedAt || '').trim(),
    sourceFingerprint: String(dynamicSource?.sourceFingerprint || '').trim(),
    sourceDocumentCount: Number(dynamicSource?.sourceDocumentCount || 0),
    sourceUpdatedAt: String(dynamicSource?.sourceUpdatedAt || '').trim(),
    planAudience: String(dynamicSource?.planAudience || '').trim(),
    planObjective: String(dynamicSource?.planObjective || '').trim(),
    planTemplateMode: String(dynamicSource?.planTemplateMode || '').trim(),
    planSectionTitles: Array.isArray(dynamicSource?.planSectionTitles)
      ? dynamicSource.planSectionTitles.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    planCardLabels: Array.isArray(dynamicSource?.planCardLabels)
      ? dynamicSource.planCardLabels.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    planChartTitles: Array.isArray(dynamicSource?.planChartTitles)
      ? dynamicSource.planChartTitles.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    planUpdatedAt: String(dynamicSource?.planUpdatedAt || '').trim(),
  };
}

function buildConceptPageEnvelope(group: ReportGroup | null, requestText: string) {
  const baseEnvelope: ReportTemplateEnvelope = {
    title: '数据可视化静态页',
    fixedStructure: [
      '页面结构由当前知识库意图和证据决定，优先组织成可直接阅读和转发的业务页面。',
      '优先展示摘要、指标卡片、重点分析、图表和结论，不强制套用共享模板骨架。',
      '页面内容必须以当前库内资料为依据，不补造库外事实。',
    ],
    variableZones: ['页面标题', '卡片指标', '重点分节', '图表分布', '行动建议', 'AI综合分析'],
    outputHint: 'Concept page generated from current knowledge evidence.',
    pageSections: ['摘要', '核心指标', '重点分析', '行动建议', 'AI综合分析'],
  };

  return group
    ? adaptTemplateEnvelopeForRequest(group, baseEnvelope, 'page', requestText)
    : baseEnvelope;
}

function buildDocumentTimestamp(item: {
  detailParsedAt?: string;
  cloudStructuredAt?: string;
  retainedAt?: string;
  categoryConfirmedAt?: string;
}) {
  const timestamps = [item.detailParsedAt, item.cloudStructuredAt, item.retainedAt, item.categoryConfirmedAt]
    .map((value) => {
      const date = value ? new Date(value) : null;
      return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
    })
    .filter(Boolean);
  return timestamps.length ? Math.max(...timestamps) : 0;
}

function matchesDynamicLibraries(
  item: { groups?: string[]; confirmedGroups?: string[]; suggestedGroups?: string[] },
  libraries: Array<{ key?: string; label?: string }>,
) {
  const names = new Set(
    libraries
      .flatMap((entry) => [entry.key, entry.label])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  );
  if (!names.size) return false;

  const documentGroups = [
    ...(Array.isArray(item.groups) ? item.groups : []),
    ...(Array.isArray(item.confirmedGroups) ? item.confirmedGroups : []),
    ...(Array.isArray(item.suggestedGroups) ? item.suggestedGroups : []),
  ];

  return documentGroups.some((group) => names.has(String(group || '').trim()));
}

function matchesTimeRange(
  item: { detailParsedAt?: string; cloudStructuredAt?: string; retainedAt?: string; categoryConfirmedAt?: string },
  timeRange?: string,
) {
  const text = String(timeRange || '').trim();
  if (!text || /(全部|所有|不限|all)/i.test(text)) return true;

  const timestamp = buildDocumentTimestamp(item);
  if (!timestamp) return true;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  if (/(今天|今日|today)/i.test(text)) return now - timestamp <= dayMs;
  if (/(本周|这周|近一周|最近一周|week)/i.test(text)) return now - timestamp <= dayMs * 7;
  if (/(本月|这个月|近一个月|最近一个月|month)/i.test(text)) return now - timestamp <= dayMs * 31;
  if (/(最近|最新|recent)/i.test(text)) return now - timestamp <= dayMs * 14;
  return true;
}

function countTopValues(values: string[]) {
  const counter = new Map<string, number>();
  for (const value of values) {
    const key = String(value || '').trim();
    if (!key) continue;
    counter.set(key, (counter.get(key) || 0) + 1);
  }
  return [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
}

function summarizeDocuments(documents: Array<{ title?: string; name?: string; summary?: string }>, limit = 3) {
  return documents
    .slice(0, limit)
    .map((item) => {
      const title = String(item.title || item.name || '').trim() || '未命名文档';
      const summary = String(item.summary || '').trim();
      return summary ? `${title}：${summary}` : title;
    })
    .join('；');
}

function normalizePlannerMetricText(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasPlannerMetricKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(normalizePlannerMetricText(keyword)));
}

function buildDynamicPlanSummary(input: {
  title: string;
  libraries: Array<{ key?: string; label?: string }>;
  documentCount: number;
  detailedCount: number;
  topTopics: Array<[string, number]>;
  latestUpdatedAt: string;
}) {
  const librarySummary = input.libraries.map((item) => item.label || item.key).filter(Boolean).join('、') || '当前知识库';
  const topicSummary = input.topTopics.map(([name]) => name).slice(0, 4).join('、') || '暂无明确主题';
  const updatedAt = input.latestUpdatedAt ? `最近更新为 ${input.latestUpdatedAt.slice(0, 10)}。` : '';
  return `当前已按「${input.title || '数据可视化静态页'}」结构，基于 ${librarySummary} 中 ${input.documentCount} 份资料动态生成页面，其中 ${input.detailedCount} 份已完成进阶解析。当前重点主题包括 ${topicSummary}。${updatedAt}`.trim();
}

function buildDynamicPlanCard(
  label: string,
  source: ReportDynamicSource,
  latestDocuments: Array<Record<string, unknown>>,
  detailedCount: number,
  topTopics: Array<[string, number]>,
  topSchemas: Array<[string, number]>,
  latestUpdatedAt: string,
) {
  const normalizedLabel = normalizePlannerMetricText(label);
  const primaryTopic = topTopics[0]?.[0] || '暂无明确主题';
  const primarySchema = topSchemas[0]?.[0] || '未识别';
  const updatedDate = latestUpdatedAt ? latestUpdatedAt.slice(0, 10) : '-';

  if (hasPlannerMetricKeyword(normalizedLabel, ['资料', '数量', '覆盖', 'evidence'])) {
    return {
      label,
      value: String(latestDocuments.length),
      note: '当前参与动态页面生成的库内文档数',
    };
  }
  if (hasPlannerMetricKeyword(normalizedLabel, ['进阶', '详细', '解析', 'detailed'])) {
    return {
      label,
      value: String(detailedCount),
      note: '已完成详细解析的资料数',
    };
  }
  if (hasPlannerMetricKeyword(normalizedLabel, ['类型', 'schema', '结构'])) {
    return {
      label,
      value: primarySchema,
      note: topSchemas.map(([name, count]) => `${name} ${count}`).join('、') || '暂无稳定类型',
    };
  }
  if (hasPlannerMetricKeyword(normalizedLabel, ['更新', '时间', '日期'])) {
    return {
      label,
      value: updatedDate,
      note: source.timeRange || '默认全量范围',
    };
  }
  if (hasPlannerMetricKeyword(normalizedLabel, ['建议', '行动', '优先', '应答'])) {
    return {
      label,
      value: source.contentFocus || primaryTopic,
      note: source.request || '按当前动态页目标持续筛选重点材料',
    };
  }
  return {
    label,
    value: primaryTopic,
    note: topTopics.map(([name, count]) => `${name} ${count}`).join('、') || '暂无高频主题',
  };
}

function buildDynamicPlanChartItems(
  title: string,
  topTopics: Array<[string, number]>,
  topSchemas: Array<[string, number]>,
) {
  const normalizedTitle = normalizePlannerMetricText(title);
  const useSchemas = hasPlannerMetricKeyword(normalizedTitle, ['文档', '类型', 'schema']);
  const items = useSchemas ? topSchemas : topTopics;
  return items.map(([label, value]) => ({ label, value }));
}

function buildDynamicPlanMetadata(plan: ReturnType<typeof buildReportPlan>) {
  return {
    planAudience: plan.audience,
    planObjective: plan.objective,
    planTemplateMode: plan.templateMode,
    planSectionTitles: plan.sections.map((item) => item.title),
    planCardLabels: plan.cards.map((item) => item.label),
    planChartTitles: plan.charts.map((item) => item.title),
  };
}

function buildDynamicSectionBody(
  title: string,
  source: ReportDynamicSource,
  documents: Array<Record<string, unknown>>,
  topTopics: Array<[string, number]>,
  topSchemas: Array<[string, number]>,
) {
  const normalizedTitle = String(title || '').trim();
  const latestSummary = summarizeDocuments(documents as Array<{ title?: string; name?: string; summary?: string }>, 3);
  const topicSummary = topTopics.length ? topTopics.map(([name, count]) => `${name}(${count})`).join('、') : '暂无稳定主题';
  const schemaSummary = topSchemas.length ? topSchemas.map(([name, count]) => `${name}(${count})`).join('、') : '暂无稳定类型';

  if (/摘要|概况|总览/.test(normalizedTitle)) {
    return `本次页面基于 ${documents.length} 份库内资料动态生成。当前请求重点为“${source.request || '当前知识库内容'}”，最近资料概览为：${latestSummary || '暂无可用资料摘要'}。`;
  }
  if (/指标|对比|趋势|图表/.test(normalizedTitle)) {
    return `当前知识库的主要文档类型为 ${schemaSummary}，高频主题包括 ${topicSummary}。页面中的图表和指标会随着库内资料变化自动更新。`;
  }
  if (/风险|异常/.test(normalizedTitle)) {
    return `当前更值得关注的是 ${topicSummary}。建议优先复核最近新增资料中的变化点、证据一致性和异常波动说明。`;
  }
  if (/建议|行动|备货/.test(normalizedTitle)) {
    return `建议继续围绕“${source.contentFocus || source.request || '当前目标'}”筛选重点材料，并优先处理 ${topicSummary || schemaSummary}。`;
  }
  return latestSummary || `当前可用资料主要围绕 ${topicSummary || schemaSummary} 展开。`;
}

function buildDynamicPageRecord(
  record: ReportOutputRecord,
  group: ReportGroup | null,
  template: SharedReportTemplate | null,
  documents: Array<Record<string, unknown>>,
) {
  const source = normalizeDynamicSource(record.dynamicSource, {
    request: record.title || record.summary || '',
    kind: record.kind,
    templateKey: record.templateKey,
    templateLabel: record.templateLabel,
    libraries: record.libraries,
  });
  if (!source) return record;

  const scopedDocuments = documents
    .filter((item) => matchesDynamicLibraries(item as { groups?: string[]; confirmedGroups?: string[]; suggestedGroups?: string[] }, source.libraries))
    .filter((item) => matchesTimeRange(item as { detailParsedAt?: string; cloudStructuredAt?: string; retainedAt?: string; categoryConfirmedAt?: string }, source.timeRange));

  const query = [source.contentFocus, source.request].filter(Boolean).join(' ').trim();
  const rankedDocuments = query
    ? matchDocumentsByPrompt(scopedDocuments as ParsedDocument[], query, Math.min(scopedDocuments.length, 30))
    : scopedDocuments;
  const latestDocuments = [...(rankedDocuments.length ? rankedDocuments : scopedDocuments)].sort(
    (left, right) => buildDocumentTimestamp(right as never) - buildDocumentTimestamp(left as never),
  );

  const topSchemas = countTopValues(latestDocuments.map((item) => String(item.schemaType || item.category || 'generic')));
  const topTopics = countTopValues(latestDocuments.flatMap((item) => Array.isArray(item.topicTags) ? item.topicTags : []));
  const detailedCount = latestDocuments.filter((item) => item.parseStage === 'detailed').length;
  const latestTimestamp = latestDocuments.length ? buildDocumentTimestamp(latestDocuments[0] as never) : 0;
  const latestUpdatedAt = latestTimestamp ? new Date(latestTimestamp).toISOString() : '';
  const sourceFingerprint = latestDocuments
    .slice(0, 24)
    .map((item) => `${String(item.path || item.name || '')}:${String(item.detailParsedAt || item.cloudStructuredAt || item.summary || '').slice(0, 48)}`)
    .join('|');

  const conceptMode = Boolean(source.conceptMode) || !String(source.templateKey || '').trim();
  const envelope = conceptMode
    ? buildConceptPageEnvelope(group, source.request || record.title || record.summary || '')
    : group && template
      ? adaptTemplateEnvelopeForRequest(group, buildSharedTemplateEnvelope(template), 'page', source.request || record.title || record.summary || '')
      : template
        ? buildSharedTemplateEnvelope(template)
        : buildConceptPageEnvelope(group, source.request || record.title || record.summary || '');
  const templateTaskHint = inferReportPlanTaskHint({
    requestText: source.request || record.title || record.summary || '',
    groupKey: group?.key,
    groupLabel: group?.label,
    templateKey: conceptMode ? '' : (template?.key || source.templateKey || record.templateKey),
    templateLabel: conceptMode ? '' : (template?.label || source.templateLabel || record.templateLabel),
    kind: 'page',
  });
  const reportPlan = buildReportPlan({
    requestText: source.request || record.title || record.summary || '',
    templateTaskHint,
    conceptPageMode: conceptMode,
    baseEnvelope: envelope,
    retrieval: {
      documents: latestDocuments as ParsedDocument[],
      evidenceMatches: [],
      meta: {
        stages: ['rule'],
        vectorEnabled: false,
        candidateCount: latestDocuments.length,
        rerankedCount: latestDocuments.length,
        intent: 'generic',
        templateTask: templateTaskHint || 'general',
      },
    } as Parameters<typeof buildReportPlan>[0]['retrieval'],
    libraries: source.libraries,
  });
  const planMetadata = buildDynamicPlanMetadata(reportPlan);

  if (
    sourceFingerprint
    && source.sourceFingerprint === sourceFingerprint
    && JSON.stringify({
      planAudience: source.planAudience || '',
      planObjective: source.planObjective || '',
      planTemplateMode: source.planTemplateMode || '',
      planSectionTitles: source.planSectionTitles || [],
      planCardLabels: source.planCardLabels || [],
      planChartTitles: source.planChartTitles || [],
    }) === JSON.stringify(planMetadata)
  ) {
    return record;
  }

  const displayTemplateLabel = conceptMode
    ? '数据可视化静态页'
    : (source.templateLabel || template?.label || record.templateLabel || '数据可视化静态页');
  const summary = latestDocuments.length
    ? buildDynamicPlanSummary({
      title: reportPlan.envelope.title,
      libraries: source.libraries,
      documentCount: latestDocuments.length,
      detailedCount,
      topTopics,
      latestUpdatedAt,
    })
    : '当前知识库中暂无符合条件的资料，页面保持空状态。';
  const sections = (reportPlan.sections.length
    ? reportPlan.sections.map((item) => item.title)
    : (envelope.pageSections || ['摘要', '重点分析', '行动建议', 'AI综合分析'])).map((title) => ({
    title,
    body: title === 'AI综合分析'
      ? `该页面会随着知识库内容变化自动刷新，当前最值得优先关注的是 ${topTopics.map(([name]) => name).slice(0, 2).join('、') || '资料质量与更新频率'}。`
      : buildDynamicSectionBody(title, source, latestDocuments, topTopics, topSchemas),
    bullets: title === 'AI综合分析'
      ? []
      : latestDocuments
          .slice(0, 3)
          .map((item) => String(item.title || item.name || '').trim())
          .filter(Boolean),
  }));
  const cards = (reportPlan.cards.length ? reportPlan.cards : [
    { label: '资料数量' },
    { label: '进阶解析' },
    { label: '主要类型' },
    { label: '最近更新' },
  ]).map((card) => buildDynamicPlanCard(
    card.label,
    source,
    latestDocuments,
    detailedCount,
    topTopics,
    topSchemas,
    latestUpdatedAt,
  ));
  const charts = reportPlan.charts
    .map((chart) => ({
      title: chart.title,
      items: buildDynamicPlanChartItems(chart.title, topTopics, topSchemas),
    }))
    .filter((chart) => chart.items.length);

  return attachLocalReportAnalysis({
    ...record,
    content: summary,
    summary: `${displayTemplateLabel} 已按当前知识库内容动态刷新。`,
    page: {
      summary,
      cards,
      sections,
      charts,
    },
    dynamicSource: {
      ...source,
      outputType: 'page',
      conceptMode,
      templateKey: conceptMode ? '' : (source.templateKey || template?.key || ''),
      templateLabel: conceptMode ? '' : (source.templateLabel || template?.label || ''),
      lastRenderedAt: new Date().toISOString(),
      sourceFingerprint,
      sourceDocumentCount: latestDocuments.length,
      sourceUpdatedAt: latestUpdatedAt,
      ...planMetadata,
      planUpdatedAt: new Date().toISOString(),
    },
  });
}

function resolveTemplateTypeFromKind(kind?: 'table' | 'page' | 'ppt' | 'pdf'): ReportTemplateType | null {
  if (kind === 'table') return 'table';
  if (kind === 'page') return 'static-page';
  if (kind === 'ppt' || kind === 'pdf') return 'ppt';
  return null;
}

function resolveOutputTypeLabel(kind?: 'table' | 'page' | 'ppt' | 'pdf', templateType?: ReportTemplateType) {
  if (kind === 'table') return '表格';
  if (kind === 'page') return '静态页';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'ppt') return 'PPT';
  if (templateType === 'table') return '表格';
  if (templateType === 'static-page') return '静态页';
  return 'PPT';
}

type PersistedState = {
  version: number;
  groups: Array<Pick<ReportGroup, 'key' | 'label' | 'description' | 'triggerKeywords' | 'defaultTemplateKey' | 'templates' | 'referenceImages'>>;
  templates: SharedReportTemplate[];
  outputs: ReportOutputRecord[];
};

type LegacyPersistedState = Partial<PersistedState> & {
  version?: number;
};

export const REPORT_STATE_VERSION = 1;

function buildId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureDirs() {
  await fs.mkdir(REPORT_CONFIG_DIR, { recursive: true });
  await fs.mkdir(REPORT_REFERENCE_DIR, { recursive: true });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTextField(value: unknown) {
  return String(value || '').trim();
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => normalizeTextField(item)).filter(Boolean)
    : [];
}

function normalizeStoredTemplateType(value: unknown): ReportTemplateType {
  const normalized = normalizeTextField(value);
  return ['table', 'static-page', 'ppt', 'document'].includes(normalized)
    ? (normalized as ReportTemplateType)
    : 'document';
}

function normalizeStoredReferenceSourceType(value: unknown): ReportReferenceSourceType | undefined {
  const normalized = normalizeTextField(value);
  return ['word', 'ppt', 'spreadsheet', 'image', 'web-link', 'other'].includes(normalized)
    ? (normalized as ReportReferenceSourceType)
    : undefined;
}

function normalizeStoredGroupTemplate(value: unknown): ReportGroupTemplate | null {
  if (!isRecord(value)) return null;

  const key = normalizeTextField(value.key);
  if (!key) return null;

  return {
    key,
    label: normalizeTextField(value.label) || key,
    type: normalizeStoredTemplateType(value.type),
    description: normalizeTextField(value.description),
    supported: value.supported !== false,
  };
}

function normalizeStoredGroup(value: unknown): PersistedState['groups'][number] | null {
  if (!isRecord(value)) return null;

  const key = normalizeTextField(value.key);
  if (!key) return null;

  return {
    key,
    label: normalizeTextField(value.label) || key,
    description: normalizeTextField(value.description),
    triggerKeywords: normalizeStringList(value.triggerKeywords),
    defaultTemplateKey: normalizeTextField(value.defaultTemplateKey),
    templates: Array.isArray(value.templates)
      ? value.templates.map((item) => normalizeStoredGroupTemplate(item)).filter(Boolean) as ReportGroupTemplate[]
      : [],
    referenceImages: Array.isArray(value.referenceImages)
      ? value.referenceImages.map((item) => normalizeReportReferenceImage(item as Partial<ReportReferenceImage>)).filter(Boolean) as ReportReferenceImage[]
      : [],
  };
}

function normalizeStoredSharedTemplate(value: unknown): SharedReportTemplate | null {
  if (!isRecord(value)) return null;

  const key = normalizeTextField(value.key);
  if (!key) return null;

  return {
    key,
    label: normalizeTextField(value.label) || key,
    type: normalizeStoredTemplateType(value.type),
    description: normalizeTextField(value.description),
    supported: value.supported !== false,
    isDefault: Boolean(value.isDefault),
    origin: normalizeTextField(value.origin) === 'system' ? 'system' : 'user',
    createdAt: normalizeTextField(value.createdAt),
    referenceImages: Array.isArray(value.referenceImages)
      ? value.referenceImages.map((item) => normalizeReportReferenceImage(item as Partial<ReportReferenceImage>)).filter(Boolean) as ReportReferenceImage[]
      : [],
  };
}

function normalizeStoredLibraries(value: unknown): Array<{ key?: string; label?: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      const key = normalizeTextField(item.key);
      const label = normalizeTextField(item.label);
      return key || label ? { key, label } : null;
    })
    .filter(Boolean) as Array<{ key?: string; label?: string }>;
}

function normalizeStoredPageCard(value: unknown) {
  if (!isRecord(value)) return null;
  const label = normalizeTextField(value.label);
  const rawValue = normalizeTextField(value.value);
  const note = normalizeTextField(value.note);
  return label || rawValue || note
    ? { label, value: rawValue, note }
    : null;
}

function normalizeStoredPageSection(value: unknown) {
  if (!isRecord(value)) return null;
  const title = normalizeTextField(value.title);
  const body = normalizeTextField(value.body);
  const bullets = normalizeStringList(value.bullets);
  return title || body || bullets.length
    ? { title, body, bullets }
    : null;
}

function normalizeStoredPageChart(value: unknown) {
  if (!isRecord(value)) return null;
  const title = normalizeTextField(value.title);
  const items = Array.isArray(value.items)
    ? value.items
      .map((item) => {
        if (!isRecord(item)) return null;
        const label = normalizeTextField(item.label);
        const numericValue = Number(item.value);
        return label
          ? {
            label,
            value: Number.isFinite(numericValue) ? numericValue : 0,
          }
          : null;
      })
      .filter(Boolean) as Array<{ label?: string; value?: number }>
    : [];

  return title || items.length ? { title, items } : null;
}

function normalizeStoredPage(value: unknown): ReportOutputRecord['page'] | null {
  if (!isRecord(value)) return null;

  const summary = normalizeTextField(value.summary);
  const cards: Array<{ label?: string; value?: string; note?: string }> = Array.isArray(value.cards)
    ? value.cards.map((item) => normalizeStoredPageCard(item)).filter(Boolean) as Array<{ label?: string; value?: string; note?: string }>
    : [];
  const sections: Array<{ title?: string; body?: string; bullets?: string[] }> = Array.isArray(value.sections)
    ? value.sections.map((item) => normalizeStoredPageSection(item)).filter(Boolean) as Array<{ title?: string; body?: string; bullets?: string[] }>
    : [];
  const charts: Array<{ title?: string; items?: Array<{ label?: string; value?: number }> }> = Array.isArray(value.charts)
    ? value.charts.map((item) => normalizeStoredPageChart(item)).filter(Boolean) as Array<{ title?: string; items?: Array<{ label?: string; value?: number }> }>
    : [];

  return summary || cards.length || sections.length || charts.length
    ? { summary, cards, sections, charts }
    : null;
}

function normalizeStoredTable(value: unknown): ReportOutputRecord['table'] | null {
  if (!isRecord(value)) return null;

  const columns = normalizeStringList(value.columns);
  const rows = Array.isArray(value.rows)
    ? value.rows
      .filter((item) => Array.isArray(item))
      .map((row) => (row as unknown[]).map((cell) => {
        if (cell == null) return null;
        if (typeof cell === 'number') return cell;
        return String(cell);
      }))
    : [];
  const title = normalizeTextField(value.title);

  return columns.length || rows.length || title
    ? { columns, rows, title }
    : null;
}

function normalizeStoredOutputKind(value: unknown): ReportOutputRecord['kind'] | undefined {
  const normalized = normalizeTextField(value);
  return ['table', 'page', 'ppt', 'pdf'].includes(normalized)
    ? (normalized as ReportOutputRecord['kind'])
    : undefined;
}

function normalizeStoredOutput(value: unknown): ReportOutputRecord | null {
  if (!isRecord(value)) return null;

  const id = normalizeTextField(value.id);
  const groupKey = normalizeTextField(value.groupKey) || normalizeTextField(value.groupLabel);
  if (!id || !groupKey) return null;

  const groupLabel = normalizeTextField(value.groupLabel) || groupKey;
  const templateKey = normalizeTextField(value.templateKey);
  const templateLabel = normalizeTextField(value.templateLabel) || templateKey || '数据可视化静态页';
  const kind = normalizeStoredOutputKind(value.kind || value.outputType);
  const outputType = normalizeTextField(value.outputType) || kind || 'page';
  const title = normalizeTextField(value.title) || `${groupLabel} 输出`;
  const summary = normalizeTextField(value.summary) || normalizeTextField(value.content);
  const libraries = normalizeStoredLibraries(value.libraries);

  return {
    id,
    groupKey,
    groupLabel,
    templateKey,
    templateLabel,
    title,
    outputType,
    kind,
    format: normalizeTextField(value.format),
    createdAt: normalizeTextField(value.createdAt) || '1970-01-01T00:00:00.000Z',
    status: 'ready',
    summary,
    triggerSource: normalizeTextField(value.triggerSource) === 'chat' ? 'chat' : 'report-center',
    content: normalizeTextField(value.content),
    table: normalizeStoredTable(value.table),
    page: normalizeStoredPage(value.page),
    libraries,
    downloadUrl: normalizeTextField(value.downloadUrl),
    dynamicSource: normalizeDynamicSource(
      isRecord(value.dynamicSource) ? value.dynamicSource as Partial<ReportDynamicSource> : null,
      {
        request: title || summary,
        kind,
        templateKey,
        templateLabel,
        libraries,
      },
    ),
  };
}

export function normalizePersistedReportState(raw: unknown): PersistedState {
  const state = isRecord(raw) ? raw as LegacyPersistedState : {};
  return {
    version: REPORT_STATE_VERSION,
    groups: Array.isArray(state.groups)
      ? state.groups.map((item) => normalizeStoredGroup(item)).filter(Boolean) as PersistedState['groups']
      : [],
    templates: Array.isArray(state.templates)
      ? state.templates.map((item) => normalizeStoredSharedTemplate(item)).filter(Boolean) as SharedReportTemplate[]
      : [],
    outputs: Array.isArray(state.outputs)
      ? state.outputs.map((item) => normalizeStoredOutput(item)).filter(Boolean) as ReportOutputRecord[]
      : [],
  };
}

async function readState(): Promise<{ state: PersistedState; migrated: boolean }> {
  try {
    const raw = await fs.readFile(REPORT_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const state = normalizePersistedReportState(parsed);
    return {
      state,
      migrated: JSON.stringify(parsed) !== JSON.stringify(state),
    };
  } catch {
    return {
      state: normalizePersistedReportState(null),
      migrated: false,
    };
  }
}

async function writeState(state: PersistedState) {
  await ensureDirs();
  await fs.writeFile(
    REPORT_STATE_FILE,
    JSON.stringify(normalizePersistedReportState(state), null, 2),
    'utf8',
  );
}

function isFormulaLibrary(label: string, key: string) {
  const text = `${label} ${key}`.toLowerCase();
  return text.includes('奶粉配方') || text.includes('配方建议') || text.includes('formula');
}

function isResumeLibrary(label: string, key: string) {
  const text = `${label} ${key}`.toLowerCase();
  return text.includes('resume') || text.includes('cv') || text.includes('简历') || text.includes('候选人');
}

function isOrderLibrary(label: string, key: string) {
  const text = `${label} ${key}`.toLowerCase();
  return text.includes('order') || text.includes('订单') || text.includes('销售') || text.includes('电商') || text.includes('库存');
}

function isBidLibrary(label: string, key: string) {
  const text = `${label} ${key}`.toLowerCase();
  return text.includes('bids') || text.includes('bid') || text.includes('tender') || text.includes('标书') || text.includes('招标') || text.includes('投标');
}

function isPaperLibrary(label: string, key: string) {
  const text = `${label} ${key}`.toLowerCase();
  return text.includes('paper') || text.includes('论文') || text.includes('学术') || text.includes('研究');
}

function isIotLibrary(label: string, key: string) {
  const text = `${label} ${key}`.toLowerCase();
  return text.includes('iot') || text.includes('物联网') || text.includes('设备') || text.includes('网关') || text.includes('解决方案');
}

function buildTemplatesForLibrary(label: string, key: string) {
  if (isFormulaLibrary(label, key)) {
    return {
      defaultTemplateKey: `${key}-table`,
      triggerKeywords: [label, '奶粉配方', '配方建议', '健脑', '抗抑郁', 'formula'],
      description: `${label} 分组固定以配方表格为主，可上传参考图辅助后续输出样式。`,
      templates: [
        {
          key: `${key}-table`,
          label: '配方表格',
          type: 'table' as const,
          description: '按模块、建议原料、添加量、核心作用和配方说明输出。',
          supported: true,
        },
        {
          key: `${key}-static-page`,
          label: '数据可视化静态页',
          type: 'static-page' as const,
          description: '后续扩展为固定可视化页面。',
          supported: true,
        },
        {
          key: `${key}-ppt`,
          label: 'PPT',
          type: 'ppt' as const,
          description: '后续扩展为固定汇报稿。',
          supported: true,
        },
      ],
    };
  }

  if (isResumeLibrary(label, key)) {
    return {
      defaultTemplateKey: `${key}-table`,
      triggerKeywords: [label, 'resume', 'cv', '简历', '候选人'],
      description: `${label} 分组固定以简历对比表格为主。`,
      templates: [
        {
          key: `${key}-table`,
          label: '简历对比表格',
          type: 'table' as const,
          description: '按第一学历、就职公司、核心能力、年龄等维度输出简历对比结果。',
          supported: true,
        },
        {
          key: `${key}-ppt`,
          label: 'PPT',
          type: 'ppt' as const,
          description: '后续扩展为候选人汇报稿。',
          supported: true,
        },
      ],
    };
  }

  if (isOrderLibrary(label, key)) {
    return {
      defaultTemplateKey: `${key}-static-page`,
      triggerKeywords: [label, 'order', '订单', '销售', '电商', '库存'],
      description: `${label} 分组固定以多品类多平台经营静态页为主。`,
      templates: [
        {
          key: `${key}-static-page`,
          label: '订单经营静态页',
          type: 'static-page' as const,
          description: '体现多品类、多平台、同比环比、预测销量、库存指数、备货推荐和异常波动。',
          supported: true,
        },
        {
          key: `${key}-table`,
          label: '订单分析表格',
          type: 'table' as const,
          description: '按平台、品类和库存建议输出结构化表格。',
          supported: true,
        },
        {
          key: `${key}-ppt`,
          label: 'PPT',
          type: 'ppt' as const,
          description: '后续扩展为经营汇报简报。',
          supported: true,
        },
      ],
    };
  }

  if (isBidLibrary(label, key)) {
    return {
      defaultTemplateKey: `${key}-table`,
      triggerKeywords: [label, 'bids', 'bid', 'tender', '标书', '招标', '投标'],
      description: `${label} 分组固定以标书应答表格为主。`,
      templates: [
        {
          key: `${key}-table`,
          label: '标书应答表格',
          type: 'table' as const,
          description: '按章节、应答重点、需补充材料、风险提示和证据来源输出标书应答表格。',
          supported: true,
        },
        {
          key: `${key}-static-page`,
          label: '标书摘要静态页',
          type: 'static-page' as const,
          description: '输出适合团队传阅的标书摘要静态页。',
          supported: true,
        },
        {
          key: `${key}-ppt`,
          label: '标书汇报提纲',
          type: 'ppt' as const,
          description: '输出适合投标汇报使用的结构化提纲。',
          supported: true,
        },
      ],
    };
  }

  if (isPaperLibrary(label, key)) {
    return {
      defaultTemplateKey: `${key}-static-page`,
      triggerKeywords: [label, 'paper', '论文', '学术', '研究', '期刊', '文献'],
      description: `${label} 分组固定以论文综述静态页为主。`,
      templates: [
        {
          key: `${key}-static-page`,
          label: '论文综述静态页',
          type: 'static-page' as const,
          description: '按研究主题、方法设计、核心结论、关键指标和局限性输出可视化综述页面。',
          supported: true,
        },
        {
          key: `${key}-table`,
          label: '论文结论表格',
          type: 'table' as const,
          description: '按论文标题、研究对象、方法设计、核心结论、关键指标和证据来源输出结构化表格。',
          supported: true,
        },
        {
          key: `${key}-ppt`,
          label: '论文汇报提纲',
          type: 'ppt' as const,
          description: '输出适合论文汇报和研究复盘的结构化提纲。',
          supported: true,
        },
      ],
    };
  }

  if (isIotLibrary(label, key)) {
    return {
      defaultTemplateKey: `${key}-static-page`,
      triggerKeywords: [label, 'iot', '物联网', '设备', '网关', '平台', '解决方案'],
      description: `${label} 分组固定以 IOT 方案静态页为主。`,
      templates: [
        {
          key: `${key}-static-page`,
          label: 'IOT解决方案静态页',
          type: 'static-page' as const,
          description: '按方案概览、核心模块、平台与接口、实施路径、业务价值和风险提示输出可视化静态页。',
          supported: true,
        },
        {
          key: `${key}-table`,
          label: 'IOT方案表格',
          type: 'table' as const,
          description: '按模块、能力说明、设备网关、平台接口、实施要点和证据来源输出结构化表格。',
          supported: true,
        },
        {
          key: `${key}-ppt`,
          label: 'IOT方案汇报提纲',
          type: 'ppt' as const,
          description: '输出适合方案汇报和售前讲解的结构化提纲。',
          supported: true,
        },
      ],
    };
  }

  return {
    defaultTemplateKey: `${key}-table`,
    triggerKeywords: [label],
    description: `${label} 分组的固定输出模板。`,
    templates: [
      {
        key: `${key}-table`,
        label: '表格',
        type: 'table' as const,
        description: `按 ${label} 分组输出结构化表格结果。`,
        supported: true,
      },
      {
        key: `${key}-static-page`,
        label: '数据可视化静态页',
        type: 'static-page' as const,
        description: `按 ${label} 分组生成静态页。`,
        supported: true,
      },
      {
        key: `${key}-ppt`,
        label: 'PPT',
        type: 'ppt' as const,
        description: `按 ${label} 分组生成汇报稿。`,
        supported: true,
      },
    ],
  };
}

function buildDefaultSharedTemplates(): SharedReportTemplate[] {
  return [
    {
      key: 'shared-static-page-default',
      label: '默认数据可视化静态页',
      type: 'static-page',
      description: '默认用于生成可转发的数据可视化静态页，强调摘要、核心指标、图表和行动建议。',
      supported: true,
      isDefault: true,
      origin: 'system',
      referenceImages: [],
    },
    {
      key: 'shared-ppt-default',
      label: '默认PPT提纲',
      type: 'ppt',
      description: '默认用于生成汇报型PPT提纲，强调标题页、关键结论、分章节要点和行动建议。',
      supported: true,
      isDefault: true,
      origin: 'system',
      referenceImages: [],
    },
    {
      key: 'shared-table-default',
      label: '默认结构化表格',
      type: 'table',
      description: '默认用于生成结构稳定的表格报表，强调结论、说明、证据来源等固定列。',
      supported: true,
      isDefault: true,
      origin: 'system',
      referenceImages: [],
    },
    {
      key: 'shared-document-default',
      label: '默认文档输出',
      type: 'document',
      description: '默认用于生成正文型文档输出，强调标题、摘要、分节和结论建议。',
      supported: true,
      isDefault: true,
      origin: 'system',
      referenceImages: [],
    },
  ];
}

function mergeSharedTemplates(storedTemplates: SharedReportTemplate[] | undefined) {
  const defaults = buildDefaultSharedTemplates();
  const merged = new Map<string, SharedReportTemplate>();

  for (const template of defaults) {
    merged.set(template.key, template);
  }

  for (const template of storedTemplates || []) {
    if (!template?.key) continue;
    const fallback = merged.get(template.key);
    merged.set(template.key, {
      ...(fallback || {}),
      ...template,
      origin:
        template.origin
        || fallback?.origin
        || (String(template.key || '').startsWith('shared-') ? 'system' : 'user'),
      createdAt: String(template.createdAt || fallback?.createdAt || '').trim(),
      referenceImages: (Array.isArray(template.referenceImages) ? template.referenceImages : (fallback?.referenceImages || []))
        .map((item) => normalizeReportReferenceImage(item))
        .filter(Boolean) as ReportReferenceImage[],
    });
  }

  const values = Array.from(merged.values());
  for (const type of ['static-page', 'ppt', 'table', 'document'] as ReportTemplateType[]) {
    const sameType = values.filter((item) => item.type === type);
    if (!sameType.length) continue;
    if (!sameType.some((item) => item.isDefault)) {
      sameType[0].isDefault = true;
    }
  }
  return values;
}

function looksLikeResumeTemplate(template: SharedReportTemplate) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('简历') || text.includes('resume') || text.includes('cv') || text.includes('候选人');
}

function looksLikeBidTemplate(template: SharedReportTemplate) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('标书') || text.includes('招标') || text.includes('投标') || text.includes('bid') || text.includes('tender');
}

function looksLikeOrderTemplate(template: SharedReportTemplate) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('订单') || text.includes('销售') || text.includes('库存') || text.includes('电商') || text.includes('order');
}

function looksLikeFormulaTemplate(template: SharedReportTemplate) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('配方') || text.includes('奶粉') || text.includes('formula');
}

function looksLikePaperTemplate(template: SharedReportTemplate) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('paper') || text.includes('论文') || text.includes('学术') || text.includes('研究');
}

function looksLikeIotTemplate(template: SharedReportTemplate) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('iot') || text.includes('物联网') || text.includes('设备') || text.includes('网关') || text.includes('解决方案');
}

export function buildSharedTemplateEnvelope(template: SharedReportTemplate): ReportTemplateEnvelope {
  if (template.type === 'static-page') {
    if (looksLikeOrderTemplate(template)) {
      return {
        title: template.label,
        fixedStructure: [
          '页面结构必须稳定，优先包含经营摘要、核心指标卡片、平台对比、品类对比、库存与备货建议、异常波动说明。',
          '必须体现多品类、多平台、同比、环比、预测销量、库存指数和备货建议。',
          '内容适合直接转发，不带平台入口与回链。',
        ],
        variableZones: ['经营摘要文本', '指标卡片数值', '平台与品类图表数据', '异常波动解释', '备货建议细节', 'AI综合分析'],
        outputHint: template.description,
        pageSections: ['经营摘要', '平台对比', '品类对比', '库存与备货建议', '异常波动说明', 'AI综合分析'],
      };
    }

    if (looksLikeBidTemplate(template)) {
      return {
        title: template.label,
        fixedStructure: [
          '页面结构应稳定，优先包含项目概况、资格条件、关键时间节点、应答重点、风险提醒。',
          '内容必须适合团队转发查看，不带平台入口和技术说明。',
          '输出应接近正式投标摘要页，而不是聊天回答。',
        ],
        variableZones: ['项目摘要', '时间节点', '关键要求', '风险与待补材料', '证据引用细节', 'AI综合分析'],
        outputHint: template.description,
        pageSections: ['项目概况', '资格条件', '关键时间节点', '应答重点', '风险提醒', 'AI综合分析'],
      };
    }

    if (looksLikeFormulaTemplate(template)) {
      return {
        title: template.label,
        fixedStructure: [
          '页面结构稳定，先给方案摘要，再给核心成分、适用人群、作用机制、证据依据和风险提示。',
          '输出必须保留专业性，适合继续讨论配方方案。',
          '不要把页面写成纯聊天回答。',
        ],
        variableZones: ['方案摘要', '核心成分与菌株', '适用人群', '作用归纳', '证据说明', 'AI综合分析'],
        outputHint: template.description,
        pageSections: ['方案摘要', '核心成分', '适用人群', '作用机制', '证据依据', 'AI综合分析'],
      };
    }

    if (looksLikePaperTemplate(template)) {
      return {
        title: template.label,
        fixedStructure: [
          '页面结构稳定，优先呈现研究概览、方法设计、核心结论、关键指标、局限与风险。',
          '内容应适合研究复盘、团队讨论和学术资料转发，不写成聊天回复。',
          '证据优先来自知识库论文正文、摘要和结构化解析结果。',
        ],
        variableZones: ['研究主题摘要', '方法设计与样本信息', '核心结论', '关键指标与证据', '局限与风险', 'AI综合分析'],
        outputHint: template.description,
        pageSections: ['研究概览', '方法设计', '核心结论', '关键指标与证据', '局限与风险', 'AI综合分析'],
      };
    }

    if (looksLikeIotTemplate(template)) {
      return {
        title: template.label,
        fixedStructure: [
          '页面结构稳定，优先呈现方案概览、核心模块、平台与接口、实施路径、业务价值和风险提示。',
          '内容适合方案交流、售前讲解和内部评审，不要写成聊天回复。',
          '证据优先来自知识库中的设备、平台、接口和实施材料。',
        ],
        variableZones: ['方案概览', '核心模块', '平台与接口', '实施路径', '业务价值', 'AI综合分析'],
        outputHint: template.description,
        pageSections: ['方案概览', '核心模块', '平台与接口', '实施路径', '业务价值', 'AI综合分析'],
      };
    }

    return {
      title: template.label,
      fixedStructure: [
        '页面结构优先保持稳定，先给摘要，再给核心指标卡片、重点分节、图表和行动建议。',
        '页面适合直接转发，不带平台入口或回链。',
        '尽量把信息组织成可读的业务页面，而不是聊天回答。',
      ],
      variableZones: ['摘要内容', '图表指标', '重点分节内容', '行动建议', 'AI综合分析'],
      outputHint: template.description,
      pageSections: ['摘要', '核心指标', '重点分析', '行动建议', 'AI综合分析'],
    };
  }

  if (template.type === 'ppt') {
    return {
      title: template.label,
      fixedStructure: [
        '输出应是适合汇报的结构化提纲，而不是聊天正文。',
        '优先包含标题页、结论摘要、关键分析、行动建议。',
        '章节顺序保持稳定，便于继续转成正式PPT。',
      ],
      variableZones: ['标题', '章节要点', '数据亮点', '行动建议'],
      outputHint: template.description,
      pageSections: ['标题页', '结论摘要', '关键分析', '行动建议'],
    };
  }

  if (template.type === 'document') {
    return {
      title: template.label,
      fixedStructure: [
        '输出应保持文档正文形态，优先包含摘要、正文分节、结论和建议。',
        '不要改成表格或碎片式聊天回答。',
        '结构稳定，适合导出为正式文档。',
      ],
      variableZones: ['文档标题', '摘要', '正文分节', '结论建议'],
      outputHint: template.description,
      pageSections: ['摘要', '正文分析', '结论建议'],
    };
  }

  if (looksLikeResumeTemplate(template)) {
    return {
      title: template.label,
      fixedStructure: [
        '输出必须保持表格化，列结构稳定，优先包含候选人、第一学历、最近就职公司、核心能力、年龄、工作年限、匹配判断、证据来源。',
        '每一行只对应一位候选人，不要混合多位候选人的信息。',
        '字段缺失可以留空，但不要自行补造。',
      ],
      variableZones: ['筛选范围', '核心能力归纳', '匹配判断', '证据引用细节', 'AI综合分析'],
      outputHint: template.description,
      tableColumns: ['候选人', '第一学历', '最近就职公司', '核心能力', '年龄', '工作年限', '匹配判断', '证据来源'],
    };
  }

  if (looksLikeBidTemplate(template)) {
    return {
      title: template.label,
      fixedStructure: [
        '输出必须保持表格化，列结构稳定，优先包含章节、应答重点、需补充材料、风险提示、证据来源。',
        '每一行只对应一个章节或应答要点，不要把多个章节混在同一行。',
        '优先依据知识库中的招标文件和模板文档组织内容。',
      ],
      variableZones: ['章节拆分方式', '应答重点', '需补充材料', '风险提示', '证据引用细节', 'AI综合分析'],
      outputHint: template.description,
      tableColumns: ['章节', '应答重点', '需补充材料', '风险提示', '证据来源'],
    };
  }

  if (looksLikeFormulaTemplate(template)) {
    return {
      title: template.label,
      fixedStructure: [
        '输出必须保持表格化，优先包含模块、建议原料或菌株、添加量或剂量、核心作用、适用人群、证据来源、备注。',
        '每一行应对应一个明确的配方建议单元，不要把多个建议混在同一格。',
        '证据来源尽量来自知识库文档，不足时才补充常识性说明。',
      ],
      variableZones: ['模块拆分方式', '建议原料或菌株', '剂量建议', '卖点归纳', '证据引用细节', 'AI综合分析'],
      outputHint: template.description,
      tableColumns: ['模块', '建议原料或菌株', '添加量或剂量', '核心作用', '适用人群', '证据来源', '备注'],
    };
  }

  if (looksLikePaperTemplate(template)) {
    return {
      title: template.label,
      fixedStructure: [
        '输出必须保持表格化，优先包含论文标题、研究对象、方法设计、核心结论、关键指标、证据来源。',
        '每一行对应一篇论文或一条稳定研究结论，不要把多篇论文混在同一行。',
        '证据优先来自论文摘要、正文证据块和结构化解析结果。',
      ],
      variableZones: ['论文标题', '研究对象', '方法设计', '核心结论', '关键指标', '证据来源', 'AI综合分析'],
      outputHint: template.description,
      tableColumns: ['论文标题', '研究对象', '方法设计', '核心结论', '关键指标', '证据来源'],
    };
  }

  if (looksLikeIotTemplate(template)) {
    return {
      title: template.label,
      fixedStructure: [
        '输出必须保持表格化，优先包含模块、能力说明、设备/网关、平台/接口、实施要点、证据来源。',
        '每一行对应一个稳定模块或方案单元，不要把多个模块混在同一行。',
        '证据优先来自知识库中的方案材料、接口说明和实施资料。',
      ],
      variableZones: ['模块', '能力说明', '设备/网关', '平台/接口', '实施要点', '证据来源', 'AI综合分析'],
      outputHint: template.description,
      tableColumns: ['模块', '能力说明', '设备/网关', '平台/接口', '实施要点', '证据来源'],
    };
  }

  return {
    title: template.label,
    fixedStructure: [
      '输出必须保持表格化，不要改成散文。',
      '列结构要稳定，先给结论，再给说明和证据。',
      '知识库证据优先，不足时才做克制补充。',
    ],
    variableZones: ['具体列名', '每行内容细节', '补充说明强度', 'AI综合分析'],
    outputHint: template.description,
    tableColumns: ['结论', '说明', '证据来源'],
  };
}

export function buildTemplateEnvelope(group: ReportGroup, template: ReportGroupTemplate): ReportTemplateEnvelope {
  if (template.type === 'table') {
    if (isResumeLibrary(group.label, group.key)) {
      return {
        title: `${group.label} 简历对比模板`,
        fixedStructure: [
          '列结构应稳定，优先包含候选人、第一学历、最近就职公司、核心能力、年龄、工作年限、匹配判断、证据来源。',
          '每一行只代表一位候选人，不要把多位候选人的信息混在一行。',
          '字段缺失可以留空，但不要自行补造。',
        ],
        variableZones: ['筛选范围', '核心能力归纳', '匹配判断', '证据引用细节'],
        outputHint: '输出应适合招聘筛选和简历横向比较。',
        tableColumns: ['候选人', '第一学历', '最近就职公司', '核心能力', '年龄', '工作年限', '匹配判断', '证据来源'],
      };
    }

    if (isFormulaLibrary(group.label, group.key)) {
      return {
        title: `${group.label} 配方表格模板`,
        fixedStructure: [
          '列结构应稳定，优先包含模块、建议原料或菌株、添加量或剂量、核心作用、适用人群、证据来源、备注。',
          '每一行应对应一个明确的配方建议单元，不要把多个建议混在一格。',
          '证据来源尽量来自知识库文档，不足时才补充常识性说明。',
        ],
        variableZones: ['模块拆分方式', '建议原料或菌株', '剂量建议', '卖点归纳', '证据引用细节'],
        outputHint: '输出应适合专家级配方建议表格，结构稳定，便于继续迭代。',
        tableColumns: ['模块', '建议原料或菌株', '添加量或剂量', '核心作用', '适用人群', '证据来源', '备注'],
      };
    }

    if (isBidLibrary(group.label, group.key)) {
      return {
        title: `${group.label} 标书应答模板`,
        fixedStructure: [
          '列结构必须稳定，优先包含章节、应答重点、需补充材料、风险提示、证据来源。',
          '每一行只对应一个标书章节或应答要点，不要把多个章节混在同一行。',
          '优先依据知识库中的招标文件和模板文档组织内容，不足时才补充通用表述。',
        ],
        variableZones: ['章节拆分方式', '应答重点', '需补充材料', '风险提示', '证据引用细节'],
        outputHint: '输出应接近正式标书应答底稿，适合继续人工补充和迭代。',
        tableColumns: ['章节', '应答重点', '需补充材料', '风险提示', '证据来源'],
      };
    }

    if (isPaperLibrary(group.label, group.key)) {
      return {
        title: `${group.label} 论文结论模板`,
        fixedStructure: [
          '列结构应稳定，优先包含论文标题、研究对象、方法设计、核心结论、关键指标、证据来源。',
          '每一行对应一篇论文或一条稳定研究结论，不要把多篇论文混在一行。',
          '证据优先来自知识库中的论文摘要、正文证据块和结构化解析结果。',
        ],
        variableZones: ['论文标题', '研究对象', '方法设计', '核心结论', '关键指标', '证据来源'],
        outputHint: '输出应适合论文综述、研究复盘和资料研读。',
        tableColumns: ['论文标题', '研究对象', '方法设计', '核心结论', '关键指标', '证据来源'],
      };
    }

    if (isIotLibrary(group.label, group.key)) {
      return {
        title: `${group.label} IOT方案表格模板`,
        fixedStructure: [
          '列结构应稳定，优先包含模块、能力说明、设备/网关、平台/接口、实施要点、证据来源。',
          '每一行对应一个稳定方案模块，不要把多个模块混在同一行。',
          '证据优先来自知识库中的方案资料、接口材料和实施说明。',
        ],
        variableZones: ['模块', '能力说明', '设备/网关', '平台/接口', '实施要点', '证据来源'],
        outputHint: '输出应适合方案梳理、售前交流和项目评审。',
        tableColumns: ['模块', '能力说明', '设备/网关', '平台/接口', '实施要点', '证据来源'],
      };
    }

    return {
      title: `${group.label} 表格模板`,
      fixedStructure: [
        '输出必须保持表格化，不要改成散文。',
        '列结构要稳定，先给结论，再给说明或证据。',
        '知识库证据优先，不足时才做克制补充。',
      ],
      variableZones: ['具体列名', '每行内容细节', '补充说明强度'],
      outputHint: '输出保持整洁、克制，便于后续继续追问优化。',
      tableColumns: ['结论', '说明', '证据来源'],
    };
  }

  if (template.type === 'static-page') {
    if (isOrderLibrary(group.label, group.key)) {
      return {
        title: `${group.label} 订单经营静态页模板`,
        fixedStructure: [
          '页面结构应稳定，优先包含经营摘要、核心指标卡片、平台对比、品类对比、库存与备货建议、异常波动说明。',
          '必须体现多品类、多平台、同比、环比、预测销量、库存指数和备货推荐。',
          '内容适合直接转发，不带平台入口与回链。',
        ],
        variableZones: ['经营摘要文本', '指标卡片数值', '平台与品类图表数据', '异常波动解释', '备货建议细节'],
        outputHint: '输出应接近正式经营分析静态页，而不是聊天回答。',
        pageSections: ['经营摘要', '平台对比', '品类对比', '库存与备货建议', '异常波动说明'],
      };
    }

    if (isBidLibrary(group.label, group.key)) {
      return {
        title: `${group.label} 标书摘要静态页模板`,
        fixedStructure: [
          '页面结构应稳定，优先包含项目概况、资格条件、关键时间节点、应答重点、风险提醒。',
          '必须适合转发查看，不带平台入口或技术说明。',
          '内容应接近正式投标摘要页，而不是聊天回答。',
        ],
        variableZones: ['项目摘要', '时间节点', '关键要求', '风险与待补材料', '证据引用细节'],
        outputHint: '输出应适合团队内部传阅，用于快速判断是否进入正式标书编制。',
        pageSections: ['项目概况', '资格条件', '关键时间节点', '应答重点', '风险提醒'],
      };
    }

    if (isPaperLibrary(group.label, group.key)) {
      return {
        title: `${group.label} 论文综述静态页模板`,
        fixedStructure: [
          '页面结构稳定，优先包含研究概览、方法设计、核心结论、关键指标与证据、局限与风险。',
          '内容应适合论文研读和团队复盘，不写成聊天回复。',
          '证据优先来自知识库中的论文正文和结构化解析结果。',
        ],
        variableZones: ['研究主题摘要', '方法设计与样本信息', '核心结论', '关键指标与证据', '局限与风险'],
        outputHint: '输出应适合研究复盘、论文综述和知识分享。',
        pageSections: ['研究概览', '方法设计', '核心结论', '关键指标与证据', '局限与风险'],
      };
    }

    if (isIotLibrary(group.label, group.key)) {
      return {
        title: `${group.label} IOT方案静态页模板`,
        fixedStructure: [
          '页面结构稳定，优先包含方案概览、核心模块、平台与接口、实施路径、业务价值和风险提示。',
          '内容适合方案讲解、售前交流和内部评审，不要写成聊天回复。',
          '证据优先来自知识库中的方案材料、设备说明和平台接口资料。',
        ],
        variableZones: ['方案概览', '核心模块', '平台与接口', '实施路径', '业务价值'],
        outputHint: '输出应适合方案汇报、售前展示和项目讨论。',
        pageSections: ['方案概览', '核心模块', '平台与接口', '实施路径', '业务价值'],
      };
    }

    return {
      title: `${group.label} 静态页模板`,
      fixedStructure: [
        '页面结构稳定，优先包含摘要、核心卡片、分节正文、简单图表。',
        '禁止出现平台入口或回链。',
        '信息组织必须接近正式对外静态页，而不是聊天回答。',
      ],
      variableZones: ['摘要文本', '核心指标卡片', '分节内容', '图表数据项'],
      outputHint: '输出应适合复制链接直接转发。',
      pageSections: ['摘要', '核心指标', '重点分析', '补充说明'],
    };
  }

  return {
    title: `${group.label} 汇报模板`,
    fixedStructure: [
      '优先输出结构化摘要与分节要点。',
      '不要自由改变输出形态。',
    ],
    variableZones: ['摘要内容', '章节要点'],
    outputHint: '保持适合后续导出为 PDF/PPT 的结构。',
  };
}

function buildGroupFromLibrary(label: string, key: string): ReportGroup {
  const config = buildTemplatesForLibrary(label, key);
  return {
    key,
    label,
    description: config.description,
    triggerKeywords: config.triggerKeywords,
    defaultTemplateKey: config.defaultTemplateKey,
    templates: config.templates,
    referenceImages: [],
  };
}

function reconcileOutputRecords(outputs: ReportOutputRecord[], groups: ReportGroup[]) {
  let changed = false;
  const formulaGroup = groups.find((group) => isFormulaLibrary(group.label, group.key));

  const nextOutputs = outputs
    .map((record) => {
      let nextRecord: ReportOutputRecord = { ...record };
      const directGroup = groups.find((group) => group.key === record.groupKey);
      if (!nextRecord.content && !nextRecord.table && !nextRecord.page) {
        nextRecord = {
          ...nextRecord,
          content: [
            nextRecord.summary || '该报表为历史记录，当前未保存正文内容。',
            nextRecord.groupLabel ? `知识库：${nextRecord.groupLabel}` : '',
            nextRecord.templateLabel ? `输出模板：${nextRecord.templateLabel}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        };
        changed = true;
      }

      const withLocalAnalysis = attachLocalReportAnalysis(nextRecord);
      if (withLocalAnalysis !== nextRecord) {
        nextRecord = withLocalAnalysis;
        changed = true;
      }

      if (directGroup) return nextRecord;

      const looksLikeFormulaRecord = isFormulaLibrary(record.groupLabel || '', record.groupKey || '');
      if (looksLikeFormulaRecord && formulaGroup) {
        changed = true;
        const template = formulaGroup.templates.find((item) => item.key === formulaGroup.defaultTemplateKey) || formulaGroup.templates[0];
        return {
          ...nextRecord,
          groupKey: formulaGroup.key,
          groupLabel: formulaGroup.label,
          templateKey: template?.key || record.templateKey,
          templateLabel: template?.label || record.templateLabel,
          title: record.title.replace(record.groupLabel, formulaGroup.label),
          summary: `${formulaGroup.label} 分组已按 ${template?.label || record.templateLabel} 模板生成成型报表。`,
        };
      }

      changed = true;
      return null;
    })
    .filter(Boolean) as ReportOutputRecord[];

  return { outputs: nextOutputs, changed };
}

function normalizeReportGroupToken(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();
}

export function resolveReportGroup(groups: ReportGroup[], groupKeyOrLabel: string) {
  const raw = String(groupKeyOrLabel || '').trim();
  if (!raw) return null;

  const normalized = normalizeReportGroupToken(raw);
  return groups.find((group) => {
    const key = String(group.key || '').trim();
    const label = String(group.label || '').trim();
    return (
      key === raw
      || label === raw
      || normalizeReportGroupToken(key) === normalized
      || normalizeReportGroupToken(label) === normalized
    );
  }) || null;
}

async function saveGroupsAndOutputs(groups: ReportGroup[], outputs: ReportOutputRecord[], templates?: SharedReportTemplate[]) {
  await writeState({
    version: REPORT_STATE_VERSION,
    groups: groups.map((group) => ({
      key: group.key,
      label: group.label,
      description: group.description,
      triggerKeywords: group.triggerKeywords,
      defaultTemplateKey: group.defaultTemplateKey,
      templates: group.templates,
      referenceImages: group.referenceImages,
    })),
    templates: Array.isArray(templates) ? templates : [],
    outputs: Array.isArray(outputs) ? outputs : [],
  });
}

export async function loadReportCenterState() {
  const [{ state, migrated }, libraries] = await Promise.all([readState(), loadDocumentLibraries()]);
  const storedGroups = Array.isArray(state.groups) ? state.groups : [];
  const groups = libraries.map((library) => {
    const base = buildGroupFromLibrary(library.label, library.key);
    const stored = storedGroups.find((item) => item.key === library.key);
    if (!stored) return base;

    const storedTemplates = Array.isArray(stored.templates) && stored.templates.length ? stored.templates : base.templates;
    const resolvedDefaultTemplateKey = storedTemplates.some((item) => item.key === base.defaultTemplateKey)
      ? base.defaultTemplateKey
      : stored.defaultTemplateKey || base.defaultTemplateKey;

    return {
      ...base,
      description: stored.description || base.description,
      triggerKeywords: Array.isArray(stored.triggerKeywords) && stored.triggerKeywords.length ? stored.triggerKeywords : base.triggerKeywords,
      defaultTemplateKey: resolvedDefaultTemplateKey,
      templates: storedTemplates,
      referenceImages: (Array.isArray(stored.referenceImages) ? stored.referenceImages : [])
        .map((item) => normalizeReportReferenceImage(item))
        .filter(Boolean) as ReportReferenceImage[],
    };
  });

  const templates = mergeSharedTemplates(Array.isArray(state.templates) ? state.templates : []);
  const rawOutputs = Array.isArray(state.outputs) ? state.outputs : [];
  const { outputs, changed } = reconcileOutputRecords(rawOutputs, groups);
  let nextOutputs = outputs;
  let refreshedChanged = false;
  if (nextOutputs.some((item) => item.kind === 'page' && item.dynamicSource?.enabled)) {
    const documentState = await loadParsedDocuments(400, false);
    nextOutputs = nextOutputs.map((item) => {
      if (!(item.kind === 'page' && item.dynamicSource?.enabled)) return item;
      const conceptMode = Boolean(item.dynamicSource?.conceptMode)
        || !String(item.dynamicSource?.templateKey || '').trim();
      const template = conceptMode
        ? null
        : templates.find((entry) => entry.key === (item.dynamicSource?.templateKey || item.templateKey))
          || templates.find((entry) => entry.key === item.templateKey)
          || templates.find((entry) => entry.type === 'static-page' && entry.isDefault)
          || templates.find((entry) => entry.type === 'static-page');
      if (!template && !conceptMode) return item;
      const group =
        resolveReportGroup(groups, item.groupKey)
        || resolveReportGroup(groups, item.groupLabel);
      const refreshed = buildDynamicPageRecord(item, group || null, template || null, documentState.items as Array<Record<string, unknown>>);
      if (JSON.stringify({
        content: refreshed.content,
        summary: refreshed.summary,
        page: refreshed.page,
        dynamicSource: refreshed.dynamicSource,
      }) !== JSON.stringify({
        content: item.content,
        summary: item.summary,
        page: item.page,
        dynamicSource: item.dynamicSource,
      })) {
        refreshedChanged = true;
      }
      return refreshed;
    });
  }

  if (migrated || changed || refreshedChanged) {
    await saveGroupsAndOutputs(groups, nextOutputs, templates);
  }

  return { groups, outputs: nextOutputs, templates };
}

export async function createReportOutput(input: {
  groupKey: string;
  templateKey?: string;
  title?: string;
  triggerSource?: 'report-center' | 'chat';
  kind?: 'table' | 'page' | 'ppt' | 'pdf';
  format?: string;
  content?: string;
  table?: ReportOutputRecord['table'];
  page?: ReportOutputRecord['page'];
  libraries?: ReportOutputRecord['libraries'];
  downloadUrl?: string;
  dynamicSource?: Partial<ReportDynamicSource> | null;
}) {
  const state = await loadReportCenterState();
  const group = resolveReportGroup(state.groups, input.groupKey);
  if (!group) throw new Error('report group not found');

  const preferredTemplateType = resolveTemplateTypeFromKind(input.kind) || 'static-page';
  const template =
    (input.templateKey ? state.templates.find((item) => item.key === input.templateKey) : null)
    || state.templates.find((item) => item.type === preferredTemplateType && item.isDefault)
    || state.templates.find((item) => item.type === preferredTemplateType)
    || state.templates[0];
  if (!template) throw new Error('shared report template not found');

  const createdAt = new Date().toISOString();
  const baseRecord: ReportOutputRecord = {
    id: buildId('report'),
    groupKey: group.key,
    groupLabel: group.label,
    templateKey: template.key,
    templateLabel: template.label,
    title: input.title?.trim() || `${group.label}-${template.label}-${createdAt.slice(0, 10)}`,
    outputType:
      template.type === 'table'
        ? '表格'
        : template.type === 'static-page'
          ? '静态页'
          : template.type === 'document'
            ? '文档'
            : 'PPT',
    kind:
      input.kind
      || (template.type === 'table'
        ? 'table'
        : template.type === 'static-page'
          ? 'page'
          : template.type === 'document'
            ? 'pdf'
            : 'ppt'),
    format:
      input.format
      || (template.type === 'table'
        ? 'csv'
        : template.type === 'static-page'
          ? 'html'
          : template.type === 'document'
            ? 'docx'
            : 'ppt'),
    createdAt,
    status: 'ready',
    summary: `${group.label} 分组已按 ${template.label} 模板生成成型报表。`,
    triggerSource: input.triggerSource || 'report-center',
    content: input.content || '',
    table: input.table || null,
    page: input.page || null,
    libraries: Array.isArray(input.libraries) ? input.libraries : [],
    downloadUrl: input.downloadUrl || '',
    dynamicSource: normalizeDynamicSource(input.dynamicSource, {
      request: input.title || group.label,
      kind:
        input.kind
        || (template.type === 'table'
          ? 'table'
          : template.type === 'static-page'
            ? 'page'
            : template.type === 'document'
              ? 'pdf'
              : 'ppt'),
      templateKey: template.key,
      templateLabel: template.label,
      libraries: Array.isArray(input.libraries) && input.libraries.length
        ? input.libraries
        : [{ key: group.key, label: group.label }],
    }),
  };

  const record = await attachReportAnalysis(baseRecord);

  const nextOutputs = [record, ...state.outputs].slice(0, 100);
  await saveGroupsAndOutputs(state.groups, nextOutputs, state.templates);
  return record;
}

export async function deleteReportOutput(outputId: string) {
  const state = await loadReportCenterState();
  const nextOutputs = state.outputs.filter((item) => item.id !== outputId);
  if (nextOutputs.length === state.outputs.length) {
    throw new Error('report output not found');
  }
  await saveGroupsAndOutputs(state.groups, nextOutputs, state.templates);
}

export async function updateReportGroupTemplate(groupKey: string, templateKey: string) {
  const state = await loadReportCenterState();
  const group = resolveReportGroup(state.groups, groupKey);
  if (!group) throw new Error('report group not found');

  const template = group.templates.find((item) => item.key === templateKey);
  if (!template) throw new Error('report template not found');

  group.defaultTemplateKey = template.key;
  await saveGroupsAndOutputs(state.groups, state.outputs, state.templates);
  return { group, template };
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || `reference-${Date.now()}`;
}

export async function uploadReportReferenceImage(groupKey: string, file: MultipartFile) {
  const state = await loadReportCenterState();
  const group = resolveReportGroup(state.groups, groupKey);
  if (!group) throw new Error('report group not found');

  await ensureDirs();
  const safeName = sanitizeFileName(file.filename || 'reference.png');
  const id = buildId('ref');
  const ext = path.extname(safeName) || '.png';
  const outputName = `${id}${ext}`;
  const fullPath = path.join(REPORT_REFERENCE_DIR, outputName);
  await pipeline(file.file, createWriteStream(fullPath));

  const stats = await fs.stat(fullPath);
  const image = normalizeReportReferenceImage({
    id,
    fileName: outputName,
    originalName: safeName,
    uploadedAt: new Date().toISOString(),
    relativePath: path.relative(STORAGE_ROOT, fullPath).replace(/\\/g, '/'),
    kind: 'file',
    sourceType: inferReportReferenceSourceType({ fileName: safeName, mimeType: file.mimetype }),
    mimeType: String(file.mimetype || '').trim(),
    size: stats.size,
  });
  if (!image) throw new Error('reference image is invalid');

  group.referenceImages = [image, ...group.referenceImages].slice(0, 12);
  await saveGroupsAndOutputs(state.groups, state.outputs, state.templates);
  return image;
}

export function findReportGroupForPrompt(groups: ReportGroup[], prompt: string) {
  const text = prompt.toLowerCase();
  return groups.find((group) => group.triggerKeywords.some((keyword) => text.includes(String(keyword).toLowerCase())));
}

export async function createSharedReportTemplate(input: {
  label: string;
  type?: ReportTemplateType;
  sourceType?: ReportReferenceSourceType;
  description?: string;
  isDefault?: boolean;
}) {
  const state = await loadReportCenterState();
  const label = String(input.label || '').trim();
  const type = input.type || inferReportTemplateTypeFromSource({ sourceType: input.sourceType });
  if (!label) throw new Error('template label is required');
  if (!['table', 'static-page', 'ppt', 'document'].includes(type)) {
    throw new Error('template type is invalid');
  }

  const template: SharedReportTemplate = {
    key: buildId('template'),
    label,
    type,
    description: String(input.description || '').trim() || `${label} 模板`,
    supported: true,
    isDefault: Boolean(input.isDefault),
    origin: 'user',
    createdAt: new Date().toISOString(),
    referenceImages: [],
  };

  const nextTemplates = state.templates.map((item) => (
    item.type === type && template.isDefault ? { ...item, isDefault: false } : item
  ));
  nextTemplates.push(template);
  await saveGroupsAndOutputs(state.groups, state.outputs, nextTemplates);
  return template;
}

export async function updateSharedReportTemplate(templateKey: string, patch: {
  label?: string;
  description?: string;
  isDefault?: boolean;
}) {
  const state = await loadReportCenterState();
  const template = state.templates.find((item) => item.key === templateKey);
  if (!template) throw new Error('shared report template not found');

  const nextTemplates = state.templates.map((item) => {
    if (item.key === templateKey) {
      return {
        ...item,
        label: patch.label ? String(patch.label).trim() || item.label : item.label,
        description: patch.description !== undefined ? String(patch.description).trim() || item.description : item.description,
        isDefault: patch.isDefault !== undefined ? Boolean(patch.isDefault) : item.isDefault,
      };
    }
    if (patch.isDefault && item.type === template.type) {
      return { ...item, isDefault: false };
    }
    return item;
  });

  await saveGroupsAndOutputs(state.groups, state.outputs, nextTemplates);
  return nextTemplates.find((item) => item.key === templateKey)!;
}

export async function uploadSharedTemplateReference(templateKey: string, file: MultipartFile) {
  const state = await loadReportCenterState();
  const template = state.templates.find((item) => item.key === templateKey);
  if (!template) throw new Error('shared report template not found');
  if (!isUserSharedReportTemplate(template)) throw new Error('system template cannot accept uploaded references');

  const safeName = sanitizeFileName(file.filename || 'template-reference');
  const duplicate = findDuplicateSharedTemplateReference(state.templates, { fileName: safeName });
  if (duplicate) {
    throw new Error(`template reference already exists in ${duplicate.templateLabel}`);
  }

  await ensureDirs();
  const id = buildId('tmplref');
  const ext = path.extname(safeName) || '.dat';
  const outputName = `${id}${ext}`;
  const fullPath = path.join(REPORT_REFERENCE_DIR, outputName);
  await pipeline(file.file, createWriteStream(fullPath));

  const stats = await fs.stat(fullPath);
  const uploaded = normalizeReportReferenceImage({
    id,
    fileName: outputName,
    originalName: safeName,
    uploadedAt: new Date().toISOString(),
    relativePath: path.relative(STORAGE_ROOT, fullPath).replace(/\\/g, '/'),
    kind: 'file',
    sourceType: inferReportReferenceSourceType({ fileName: safeName, mimeType: file.mimetype }),
    mimeType: String(file.mimetype || '').trim(),
    size: stats.size,
  });
  if (!uploaded) throw new Error('shared template reference is invalid');

  const nextTemplates = state.templates.map((item) => (
    item.key === templateKey
      ? { ...item, referenceImages: [uploaded, ...item.referenceImages].slice(0, 16) }
      : item
  ));
  await saveGroupsAndOutputs(state.groups, state.outputs, nextTemplates);
  return uploaded;
}

export async function addSharedTemplateReferenceLink(templateKey: string, input: {
  url: string;
  label?: string;
}) {
  const state = await loadReportCenterState();
  const template = state.templates.find((item) => item.key === templateKey);
  if (!template) throw new Error('shared report template not found');
  if (!isUserSharedReportTemplate(template)) throw new Error('system template cannot accept uploaded references');

  const normalizedUrl = normalizeReferenceUrl(input.url);
  const duplicate = findDuplicateSharedTemplateReference(state.templates, { url: normalizedUrl });
  if (duplicate) {
    throw new Error(`template reference already exists in ${duplicate.templateLabel}`);
  }
  const uploaded = normalizeReportReferenceImage({
    id: buildId('tmplref'),
    fileName: '',
    originalName: String(input.label || normalizedUrl).trim(),
    uploadedAt: new Date().toISOString(),
    relativePath: '',
    kind: 'link',
    sourceType: inferReportReferenceSourceType({ url: normalizedUrl }),
    url: normalizedUrl,
  });
  if (!uploaded) throw new Error('shared template reference is invalid');

  const nextTemplates = state.templates.map((item) => (
    item.key === templateKey
      ? { ...item, referenceImages: [uploaded, ...item.referenceImages].slice(0, 16) }
      : item
  ));
  await saveGroupsAndOutputs(state.groups, state.outputs, nextTemplates);
  return uploaded;
}

export async function deleteSharedReportTemplate(templateKey: string) {
  const state = await loadReportCenterState();
  const template = state.templates.find((item) => item.key === templateKey);
  if (!template) throw new Error('shared report template not found');
  if (!isUserSharedReportTemplate(template)) throw new Error('system template cannot be deleted');

  for (const reference of template.referenceImages || []) {
    await deleteStoredReferenceFile(reference);
  }

  const nextTemplates = state.templates
    .filter((item) => item.key !== templateKey)
    .map((item) => ({ ...item }));

  if (template.isDefault) {
    const sameType = nextTemplates.filter((item) => item.type === template.type);
    if (sameType.length && !sameType.some((item) => item.isDefault)) {
      sameType[0].isDefault = true;
    }
  }

  await saveGroupsAndOutputs(state.groups, state.outputs, nextTemplates);
  return template;
}

export async function deleteSharedTemplateReference(templateKey: string, referenceId: string) {
  const state = await loadReportCenterState();
  const template = state.templates.find((item) => item.key === templateKey);
  if (!template) throw new Error('shared report template not found');
  if (!isUserSharedReportTemplate(template)) throw new Error('system template references cannot be deleted');

  const reference = (template.referenceImages || []).find((item) => item.id === referenceId);
  if (!reference) throw new Error('template reference not found');

  await deleteStoredReferenceFile(reference);

  const nextTemplates = state.templates.map((item) => (
    item.key === templateKey
      ? { ...item, referenceImages: (item.referenceImages || []).filter((entry) => entry.id !== referenceId) }
      : item
  ));

  await saveGroupsAndOutputs(state.groups, state.outputs, nextTemplates);
  return reference;
}

export async function readSharedTemplateReferenceFile(templateKey: string, referenceId: string) {
  const state = await loadReportCenterState();
  const template = state.templates.find((item) => item.key === templateKey);
  if (!template) throw new Error('shared report template not found');

  const reference = (template.referenceImages || []).find((item) => item.id === referenceId);
  if (!reference) throw new Error('template reference not found');
  if (reference.kind === 'link' || reference.url) throw new Error('template reference is not a file');

  const absolutePath = resolveReferenceFilePath(reference);
  if (!absolutePath) throw new Error('template reference file path is invalid');

  try {
    await fs.access(absolutePath);
  } catch {
    throw new Error('template reference file not found');
  }

  return {
    template,
    reference,
    absolutePath,
  };
}

export async function reviseReportOutput(outputId: string, instruction: string) {
  const state = await loadReportCenterState();
  const record = state.outputs.find((item) => item.id === outputId);
  if (!record) throw new Error('report output not found');

  const normalizedInstruction = String(instruction || '').trim();
  if (!normalizedInstruction) throw new Error('instruction is required');

  const template =
    state.templates.find((item) => item.key === record.templateKey)
    || state.templates.find((item) => item.type === resolveTemplateTypeFromKind(record.kind) && item.isDefault)
    || state.templates.find((item) => item.type === resolveTemplateTypeFromKind(record.kind))
    || state.templates[0];
  if (!template) throw new Error('shared report template not found');
  const group =
    resolveReportGroup(state.groups, record.groupKey)
    || resolveReportGroup(state.groups, record.groupLabel);
  const conceptMode = record.kind === 'page' && Boolean(record.dynamicSource?.conceptMode);

  const envelope = conceptMode
    ? buildConceptPageEnvelope(group || null, normalizedInstruction || record.title || '')
    : buildSharedTemplateEnvelope(template);
  const currentMaterial = [
    record.content ? `当前正文：${record.content}` : '',
    record.table ? `当前表格：\n${summarizeTableForAnalysis(record.table)}` : '',
    record.page ? `当前页面：\n${summarizePageForAnalysis(record.page)}` : '',
    record.summary ? `当前摘要：${record.summary}` : '',
    Array.isArray(record.libraries) && record.libraries.length
      ? `关联知识库：${record.libraries.map((item) => item.label || item.key).filter(Boolean).join('、')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  let revisedBase: ReportOutputRecord;
  try {
    const cloud = await runOpenClawChat({
      prompt: [
        `请根据当前报表内容和用户调整要求，重写这份${record.outputType}。`,
        `用户要求：${normalizedInstruction}`,
        '',
        currentMaterial,
      ].join('\n'),
      systemPrompt: [
        '你是企业知识分析助手。',
        '请在不脱离当前报表主题和知识库范围的前提下，根据用户要求调整已生成报表。',
        '优先保持既有输出形式不变，只调整结构、重点和表达。',
        conceptMode ? '当前静态页使用概念供料模式，不需要强制贴合共享模板。' : `模板标题：${envelope.title}`,
        `固定结构：${envelope.fixedStructure.join('；')}`,
        `可变区域：${envelope.variableZones.join('；')}`,
        `输出提示：${envelope.outputHint}`,
      ].join('\n'),
    });

    const normalized = normalizeReportOutput(
      record.kind === 'page' ? 'page' : record.kind === 'ppt' ? 'ppt' : record.kind === 'pdf' ? 'pdf' : 'table',
      normalizedInstruction,
      cloud.content,
      envelope,
    );

    const nextTable = 'table' in normalized ? normalized.table || null : null;
    const nextPage = 'page' in normalized ? normalized.page || null : null;
    const nextFormat = 'format' in normalized ? normalized.format || record.format : record.format;

    revisedBase = {
      ...record,
      summary: `${record.templateLabel} 已根据自然语言要求更新。`,
      content: normalized.content,
      table: nextTable,
      page: nextPage,
      format: nextFormat,
      kind: record.kind,
    };
  } catch {
    revisedBase = {
      ...record,
      summary: `${record.templateLabel} 已记录新的调整要求：${normalizedInstruction}`,
      content: record.content || normalizedInstruction,
    };
  }

  const revisedRecord = await attachReportAnalysis(revisedBase);

  const nextOutputs = state.outputs.map((item) => (item.id === outputId ? revisedRecord : item));
  await saveGroupsAndOutputs(state.groups, nextOutputs, state.templates);
  return revisedRecord;
}
