import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import { loadDocumentCategoryConfig } from './document-config.js';
import { loadDocumentLibraries } from './document-libraries.js';
import type { ParsedDocument } from './document-parser.js';
import { ingestExistingLocalFiles } from './document-upload-ingest.js';
import { DEFAULT_SCAN_DIR, loadParsedDocuments, matchDocumentsByPrompt } from './document-store.js';
import { normalizeReportOutput } from './knowledge-output.js';
import { buildReportPlan, inferReportPlanTaskHint, type ReportPlanDatavizSlot, type ReportPlanLayoutVariant, type ReportPlanPageSpec } from './report-planner.js';
import { attachDatavizRendersToPage } from './report-dataviz.js';
import { buildSpecializedDraftForRecord } from './report-draft-composers.js';
import { inferSectionDisplayMode, inferSectionDisplayModeFromTitle } from './report-visual-intent.js';
import {
  buildDefaultSystemTemplates,
  expandDatasourceGovernanceProfile,
  resolveDatasourceGovernanceProfile,
  resolveTemplateEnvelopeProfile,
} from './report-governance.js';
import { adaptTemplateEnvelopeForRequest } from './report-template-adapter.js';
import { isOpenClawGatewayConfigured, runOpenClawChat } from './openclaw-adapter.js';
import { scheduleOpenClawMemoryCatalogSync } from './openclaw-memory-sync.js';
import { STORAGE_CONFIG_DIR, STORAGE_FILES_DIR, STORAGE_ROOT } from './paths.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';

const REPORT_CONFIG_DIR = STORAGE_CONFIG_DIR;
const REPORT_REFERENCE_DIR = path.join(STORAGE_FILES_DIR, 'report-references');
const REPORT_LIBRARY_EXPORT_DIR = path.join(STORAGE_FILES_DIR, 'generated-report-library');
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
  preferredLayoutVariant?: ReportPlanLayoutVariant;
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
  outputType: 'table' | 'page' | 'ppt' | 'pdf' | 'doc' | 'md';
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
  planDatavizSlots?: ReportPlanDatavizSlot[];
  planPageSpec?: ReportPlanPageSpec;
  planUpdatedAt?: string;
};

export type ReportOutputStatus =
  | 'processing'
  | 'draft_planned'
  | 'draft_generated'
  | 'draft_reviewing'
  | 'final_generating'
  | 'ready'
  | 'failed';

export type ReportVisualStylePreset =
  | 'signal-board'
  | 'midnight-glass'
  | 'editorial-brief'
  | 'minimal-canvas';

export type ReportDraftModuleType =
  | 'hero'
  | 'summary'
  | 'metric-grid'
  | 'insight-list'
  | 'table'
  | 'chart'
  | 'timeline'
  | 'comparison'
  | 'cta'
  | 'appendix';

export type ReportDraftModuleStatus = 'generated' | 'edited' | 'disabled';

export type ReportDraftReviewStatus = 'draft_generated' | 'draft_reviewing' | 'approved';
export type ReportDraftReadiness = 'ready' | 'needs_attention' | 'blocked';
export type ReportDraftChecklistStatus = 'pass' | 'warning' | 'fail';

export type ReportDraftChecklistItem = {
  key: string;
  label: string;
  status: ReportDraftChecklistStatus;
  detail?: string;
  blocking?: boolean;
};

export type ReportDraftEvidenceCoverage = {
  coveredModules: number;
  totalModules: number;
  ratio: number;
};

export type ReportDraftModule = {
  moduleId: string;
  moduleType: ReportDraftModuleType;
  title: string;
  purpose: string;
  contentDraft: string;
  evidenceRefs: string[];
  chartIntent?: {
    title?: string;
    preferredChartType?: ReportPlanDatavizSlot['preferredChartType'];
    items?: Array<{ label?: string; value?: number }>;
  } | null;
  cards?: Array<{ label?: string; value?: string; note?: string }>;
  bullets?: string[];
  enabled: boolean;
  status: ReportDraftModuleStatus;
  order: number;
  layoutType?: string;
};

export type ReportOutputDraft = {
  reviewStatus: ReportDraftReviewStatus;
  version: number;
  modules: ReportDraftModule[];
  lastEditedAt?: string;
  approvedAt?: string;
  audience?: string;
  objective?: string;
  layoutVariant?: ReportPlanLayoutVariant;
  visualStyle?: ReportVisualStylePreset;
  mustHaveModules?: string[];
  optionalModules?: string[];
  evidencePriority?: string[];
  audienceTone?: string;
  riskNotes?: string[];
  readiness?: ReportDraftReadiness;
  qualityChecklist?: ReportDraftChecklistItem[];
  missingMustHaveModules?: string[];
  evidenceCoverage?: ReportDraftEvidenceCoverage;
};

export type ReportOutputRecord = {
  id: string;
  groupKey: string;
  groupLabel: string;
  templateKey: string;
  templateLabel: string;
  title: string;
  outputType: string;
  kind?: 'table' | 'page' | 'ppt' | 'pdf' | 'doc' | 'md';
  format?: string;
  createdAt: string;
  status: ReportOutputStatus;
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
    sections?: Array<{ title?: string; body?: string; bullets?: string[]; displayMode?: string }>;
    datavizSlots?: ReportPlanDatavizSlot[];
    pageSpec?: ReportPlanPageSpec;
    visualStyle?: ReportVisualStylePreset;
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
  libraries?: Array<{ key?: string; label?: string }>;
  downloadUrl?: string;
  dynamicSource?: ReportDynamicSource | null;
  draft?: ReportOutputDraft | null;
};

type ReportPageChart = NonNullable<NonNullable<ReportOutputRecord['page']>['charts']>[number];

function normalizeDraftChartType(value: unknown): ReportPlanDatavizSlot['preferredChartType'] | undefined {
  if (value === 'horizontal-bar' || value === 'line' || value === 'bar') return value;
  return undefined;
}

function normalizeVisualStylePreset(value: unknown): ReportVisualStylePreset | undefined {
  const normalized = String(value || '').trim();
  if (
    normalized === 'signal-board'
    || normalized === 'midnight-glass'
    || normalized === 'editorial-brief'
    || normalized === 'minimal-canvas'
  ) {
    return normalized;
  }
  return undefined;
}

function resolveDefaultReportVisualStyle(layoutVariant?: ReportPlanLayoutVariant | string, title?: string): ReportVisualStylePreset {
  const normalizedLayout = String(layoutVariant || '').trim();
  const normalizedTitle = String(title || '').trim().toLowerCase();
  if (normalizedLayout === 'operations-cockpit') return 'signal-board';
  if (normalizedLayout === 'research-brief' || normalizedLayout === 'risk-brief') return 'editorial-brief';
  if (normalizedLayout === 'talent-showcase') return 'minimal-canvas';
  if (/workspace|overview|dashboard|cockpit|总览|经营|运营/.test(normalizedTitle)) return 'signal-board';
  return 'midnight-glass';
}

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

function sanitizeMarkdownTableCell(value: unknown) {
  return String(value ?? '')
    .replace(/\r\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

function buildTableMarkdownBlock(table?: ReportOutputRecord['table']) {
  const columns = Array.isArray(table?.columns) ? table.columns.map((item) => String(item || '').trim()).filter(Boolean) : [];
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  if (!columns.length && !rows.length) return '';

  const effectiveColumns = columns.length
    ? columns
    : rows[0]?.map((_, index) => `列${index + 1}`) || [];

  const headerRow = `| ${effectiveColumns.map(sanitizeMarkdownTableCell).join(' | ')} |`;
  const separatorRow = `| ${effectiveColumns.map(() => '---').join(' | ')} |`;
  const bodyRows = rows.map((row) => {
    const cells = Array.isArray(row) ? row : [];
    return `| ${effectiveColumns.map((_, index) => sanitizeMarkdownTableCell(cells[index])).join(' | ')} |`;
  });

  const lines: string[] = ['## 表格内容'];
  if (table?.title) {
    lines.push('', table.title);
  }
  lines.push('', headerRow, separatorRow, ...bodyRows);
  return lines.join('\n').trim();
}

function buildPageMarkdownBlock(page?: ReportOutputRecord['page']) {
  if (!page) return '';

  const lines: string[] = [];
  if (page.summary) {
    lines.push('## 摘要', '', String(page.summary || '').trim());
  }

  if (Array.isArray(page.cards) && page.cards.length) {
    lines.push(lines.length ? '' : '', '## 关键指标', '');
    lines.push(
      ...page.cards.map((item) => {
        const label = String(item?.label || '指标').trim();
        const value = String(item?.value || '').trim();
        const note = String(item?.note || '').trim();
        return `- ${label}${value ? `：${value}` : ''}${note ? ` (${note})` : ''}`;
      }),
    );
  }

  for (const section of page.sections || []) {
    const title = String(section?.title || '').trim() || '内容';
    const body = String(section?.body || '').trim();
    const bullets = Array.isArray(section?.bullets) ? section.bullets.map((item) => String(item || '').trim()).filter(Boolean) : [];
    lines.push(lines.length ? '' : '', `## ${title}`);
    if (body) {
      lines.push('', body);
    }
    if (bullets.length) {
      lines.push('', ...bullets.map((item) => `- ${item}`));
    }
  }

  if (Array.isArray(page.charts) && page.charts.length) {
    lines.push(lines.length ? '' : '', '## 图表数据');
    for (const chart of page.charts) {
      const title = String(chart?.title || '').trim() || '图表';
      lines.push('', `### ${title}`);
      const items = Array.isArray(chart?.items) ? chart.items : [];
      if (items.length) {
        lines.push('', ...items.map((item) => `- ${String(item?.label || '项').trim()}：${Number(item?.value || 0)}`));
      }
    }
  }

  return lines.join('\n').trim();
}

function buildReportOutputKnowledgeMarkdown(record: ReportOutputRecord) {
  const lines: string[] = [
    `# ${record.title}`,
    '',
    `- 报表ID：${record.id}`,
    `- 分组：${record.groupLabel}`,
    `- 模板：${record.templateLabel}`,
    `- 生成时间：${record.createdAt}`,
    `- 原始格式：${record.kind || record.outputType || 'unknown'}/${record.format || 'unknown'}`,
  ];

  const libraryLabels = (record.libraries || [])
    .map((item) => String(item?.label || item?.key || '').trim())
    .filter(Boolean);
  if (libraryLabels.length) {
    lines.push(`- 对应知识库：${libraryLabels.join('、')}`);
  }
  if (record.summary) {
    lines.push(`- 生成摘要：${record.summary}`);
  }

  const sections: string[] = [];
  if (record.kind === 'table' && record.table) {
    sections.push(buildTableMarkdownBlock(record.table));
  } else if (record.kind === 'page' && record.page) {
    sections.push(buildPageMarkdownBlock(record.page));
  }

  const normalizedContent = String(record.content || '').trim();
  if (normalizedContent && (record.kind === 'md' || record.kind === 'doc' || record.kind === 'pdf' || record.kind === 'ppt' || !sections.length)) {
    sections.unshift(normalizedContent);
  }
  if (!sections.length && record.summary) {
    sections.push(`## 内容\n\n${record.summary}`);
  }

  if (sections.length) {
    lines.push('', ...sections.filter(Boolean));
  }

  return `${lines.join('\n').trim()}\n`;
}

function resolveReportOutputLibraryKeys(
  record: ReportOutputRecord,
  libraries: Awaited<ReturnType<typeof loadDocumentLibraries>>,
) {
  const knownKeys = new Set(libraries.map((item) => item.key));
  const keys = new Set<string>();

  for (const entry of record.libraries || []) {
    const key = String(entry?.key || '').trim();
    const label = String(entry?.label || '').trim();
    if (key && knownKeys.has(key)) {
      keys.add(key);
      continue;
    }
    if (label) {
      const matched = libraries.find((item) => item.label === label);
      if (matched) keys.add(matched.key);
    }
  }

  if (!keys.size) {
    if (record.groupKey && knownKeys.has(record.groupKey)) {
      keys.add(record.groupKey);
    } else if (record.groupLabel) {
      const matched = libraries.find((item) => item.label === record.groupLabel);
      if (matched) keys.add(matched.key);
    }
  }

  return [...keys];
}

async function syncReportOutputToKnowledgeLibrary(record: ReportOutputRecord) {
  if (record.status !== 'ready') return null;

  const libraries = await loadDocumentLibraries();
  const libraryKeys = resolveReportOutputLibraryKeys(record, libraries);
  if (!libraryKeys.length) return null;

  const documentConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const markdown = buildReportOutputKnowledgeMarkdown(record);
  await fs.mkdir(REPORT_LIBRARY_EXPORT_DIR, { recursive: true });
  const outputPath = path.join(REPORT_LIBRARY_EXPORT_DIR, `report-output-${record.id}.md`);
  await fs.writeFile(outputPath, markdown, 'utf8');

  const ingestResult = await ingestExistingLocalFiles({
    filePaths: [outputPath],
    documentConfig,
    libraries,
    preferredLibraryKeys: libraryKeys,
    forcedLibraryKeys: libraryKeys,
  });

  return {
    outputPath,
    libraryKeys,
    ingestResult,
  };
}

async function syncReportOutputToKnowledgeLibrarySafely(record: ReportOutputRecord) {
  try {
    return await syncReportOutputToKnowledgeLibrary(record);
  } catch (error) {
    console.warn('[report-center] failed to sync report output into knowledge library', {
      reportOutputId: record.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
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
  kind?: 'table' | 'page' | 'ppt' | 'pdf' | 'doc' | 'md';
  table?: ReportOutputRecord['table'];
  page?: ReportOutputRecord['page'];
  content?: string;
}) {
  if (record.kind && record.kind !== 'table') {
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
  kind?: 'table' | 'page' | 'ppt' | 'pdf' | 'doc' | 'md';
  table?: ReportOutputRecord['table'];
  page?: ReportOutputRecord['page'];
  content?: string;
  libraries?: ReportOutputRecord['libraries'];
}) {
  if (!isOpenClawGatewayConfigured()) {
    return '';
  }

  const context = [
    record.kind && record.kind !== 'table' ? summarizePageForAnalysis(record.page) : summarizeTableForAnalysis(record.table),
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
        `请基于以下${record.kind && record.kind !== 'table' ? '叙事型输出' : '表格报表'}内容，输出一段“AI综合分析”。`,
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
  if (record.status !== 'ready' || record.kind === 'md') return record;
  const analysis =
    (await buildCloudReportAnalysis(record)) ||
    buildLocalReportAnalysis(record);

  if (!analysis) return record;

  if (isNarrativeReportKind(record.kind)) {
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

async function attachReportDataviz(record: ReportOutputRecord) {
  if (!isNarrativeReportKind(record.kind) || !record.page) return record;
  const page = await attachDatavizRendersToPage(record.page, {
    slots: Array.isArray(record.page?.datavizSlots) && record.page.datavizSlots.length
      ? record.page.datavizSlots
      : Array.isArray(record.dynamicSource?.planDatavizSlots)
        ? record.dynamicSource?.planDatavizSlots
        : [],
  });
  return page ? { ...record, page } : record;
}

function buildDraftChartIntentFromChart(
  chart: ReportPageChart | null | undefined,
  slot: ReportPlanDatavizSlot | null | undefined,
) {
  if (!chart && !slot) return null;
  return {
    title: String(chart?.title || slot?.title || '').trim(),
    preferredChartType: normalizeDraftChartType(chart?.render?.chartType) || slot?.preferredChartType || 'bar',
    items: Array.isArray(chart?.items) ? chart.items : [],
  };
}

function normalizeDraftSlotKey(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function buildPageDraftModules(record: ReportOutputRecord): ReportDraftModule[] {
  if (!isNarrativeReportKind(record.kind) || !record.page) return [];
  const page = record.page;
  const planPageSpec = page.pageSpec || record.dynamicSource?.planPageSpec || null;
  const plannedSlots = Array.isArray(page.datavizSlots) && page.datavizSlots.length
    ? page.datavizSlots
    : (record.dynamicSource?.planDatavizSlots || []);
  const slotByKey = new Map(
    plannedSlots
      .map((slot) => [String(slot.key || '').trim(), slot] as const)
      .filter(([key]) => key),
  );
  const modules: ReportDraftModule[] = [];
  let order = 0;

  if (String(page.summary || '').trim()) {
    modules.push({
      moduleId: buildId('draftmod'),
      moduleType: 'hero',
      title: '页面摘要',
      purpose: record.dynamicSource?.planObjective || 'Open with a concise page summary.',
      contentDraft: String(page.summary || '').trim(),
      evidenceRefs: [],
      chartIntent: null,
      cards: [],
      bullets: [],
      enabled: true,
      status: 'generated',
      order: order++,
      layoutType: 'hero',
    });
  }

  if (Array.isArray(page.cards) && page.cards.length) {
    modules.push({
      moduleId: buildId('draftmod'),
      moduleType: 'metric-grid',
      title: '关键指标',
      purpose: 'Highlight the most important page metrics first.',
      contentDraft: '',
      evidenceRefs: [],
      chartIntent: null,
      cards: page.cards,
      bullets: [],
      enabled: true,
      status: 'generated',
      order: order++,
      layoutType: 'metric-grid',
    });
  }

  const sectionSpecs = Array.isArray(planPageSpec?.sections) ? planPageSpec.sections : [];
  const sectionSpecByTitle = new Map(sectionSpecs.map((item) => [String(item.title || '').trim(), item] as const));
  const sectionDatavizTitles = new Set<string>();
  for (const spec of sectionSpecs) {
    for (const slotKey of spec.datavizSlotKeys || []) {
      const slot = slotByKey.get(String(slotKey || '').trim());
      const title = String(slot?.title || '').trim();
      if (title) sectionDatavizTitles.add(title);
    }
  }

  for (const section of page.sections || []) {
    const title = String(section?.title || '').trim() || '内容模块';
    const spec = sectionSpecByTitle.get(title);
    modules.push({
      moduleId: buildId('draftmod'),
      moduleType: Array.isArray(section?.bullets) && section.bullets.length ? 'insight-list' : 'summary',
      title,
      purpose: String(spec?.purpose || '').trim(),
      contentDraft: String(section?.body || '').trim(),
      evidenceRefs: [],
      chartIntent: null,
      cards: [],
      bullets: Array.isArray(section?.bullets) ? section.bullets : [],
      enabled: true,
      status: 'generated',
      order: order++,
      layoutType: Array.isArray(section?.bullets) && section.bullets.length ? 'insight-list' : 'summary',
    });
  }

  for (const chart of page.charts || []) {
    const title = String(chart?.title || '').trim() || '图表模块';
    const plannedSlot = plannedSlots.find((slot) => String(slot?.title || '').trim() === title)
      || plannedSlots.find((slot) => String(slot?.key || '').trim() && (planPageSpec?.heroDatavizSlotKeys || []).includes(String(slot.key || '').trim()) && String(slot?.title || '').trim() === title)
      || null;
    const chartModuleType: ReportDraftModuleType =
      sectionDatavizTitles.has(title) ? 'chart' : 'chart';
    modules.push({
      moduleId: buildId('draftmod'),
      moduleType: chartModuleType,
      title,
      purpose: String(plannedSlot?.purpose || '').trim(),
      contentDraft: '',
      evidenceRefs: [],
      chartIntent: buildDraftChartIntentFromChart(chart, plannedSlot),
      cards: [],
      bullets: [],
      enabled: true,
      status: 'generated',
      order: order++,
      layoutType: 'chart',
    });
  }

  return modules;
}

function buildDraftForRecord(record: ReportOutputRecord): ReportOutputDraft | null {
  if (!isNarrativeReportKind(record.kind) || !record.page) return null;
  const fallbackVisualStyle = record.page?.visualStyle || resolveDefaultReportVisualStyle(
    record.page?.pageSpec?.layoutVariant || record.dynamicSource?.planPageSpec?.layoutVariant,
    record.title,
  );
  const specializedDraft = buildSpecializedDraftForRecord(record, fallbackVisualStyle);
  if (specializedDraft) return hydrateDraftQuality(specializedDraft);
  const modules = buildPageDraftModules(record);
  if (!modules.length) return null;
  const layoutVariant = record.page?.pageSpec?.layoutVariant || record.dynamicSource?.planPageSpec?.layoutVariant;
  return hydrateDraftQuality({
    reviewStatus: 'draft_generated',
    version: 1,
    modules,
    lastEditedAt: record.createdAt,
    approvedAt: '',
    audience: String(record.dynamicSource?.planAudience || 'client').trim(),
    objective: String(record.dynamicSource?.planObjective || '').trim(),
    layoutVariant,
    visualStyle: fallbackVisualStyle,
    mustHaveModules: (record.dynamicSource?.planSectionTitles || []).slice(0, 8),
    optionalModules: [],
    evidencePriority: (record.dynamicSource?.planCardLabels || []).slice(0, 8),
    audienceTone: 'client-facing',
    riskNotes: [],
  });
}

function draftModulesToPage(draft: ReportOutputDraft, record: ReportOutputRecord): NonNullable<ReportOutputRecord['page']> | null {
  const enabledModules = (draft.modules || [])
    .filter((item) => item.enabled !== false && item.status !== 'disabled')
    .sort((left, right) => left.order - right.order);
  if (!enabledModules.length) return null;

  const summaryModule = enabledModules.find((item) => item.moduleType === 'hero')
    || enabledModules.find((item) => item.moduleType === 'summary')
    || null;

  const cards = enabledModules
    .filter((item) => item.moduleType === 'metric-grid')
    .flatMap((item) => item.cards || []);

  const sections = enabledModules
    .filter((item) => item.moduleType !== 'metric-grid' && item.moduleType !== 'chart')
    .map((item) => ({
      title: item.title,
      body: item.contentDraft,
      bullets: Array.isArray(item.bullets) ? item.bullets.filter(Boolean) : [],
      displayMode: inferSectionDisplayMode(item.moduleType),
    }))
    .filter((item) => item.title || item.body || item.bullets.length);

  const charts = enabledModules
    .filter((item) => item.moduleType === 'chart')
    .map((item) => ({
      title: item.chartIntent?.title || item.title,
      items: Array.isArray(item.chartIntent?.items) ? item.chartIntent.items : [],
      render: null,
    }))
    .filter((item) => item.title || item.items.length);

  const datavizSlots = charts.map((chart, index) => ({
    key: normalizeDraftSlotKey(String(chart.title || 'draft-chart')) || `draft-chart-${index + 1}`,
    title: String(chart.title || `图表 ${index + 1}`),
    purpose: '',
    preferredChartType: enabledModules.find((item) => item.moduleType === 'chart' && (item.chartIntent?.title || item.title) === chart.title)?.chartIntent?.preferredChartType || 'bar',
    placement: index === 0 ? 'hero' as const : 'section' as const,
    sectionTitle: index === 0 ? '' : (sections[Math.min(index - 1, Math.max(sections.length - 1, 0))]?.title || ''),
    evidenceFocus: '',
    minItems: 2,
    maxItems: 8,
  }));

  const pageSpec = {
    layoutVariant: draft.layoutVariant || record.page?.pageSpec?.layoutVariant || record.dynamicSource?.planPageSpec?.layoutVariant || 'insight-brief',
    heroCardLabels: cards.map((item) => String(item?.label || '').trim()).filter(Boolean),
    heroDatavizSlotKeys: datavizSlots.slice(0, 1).map((item) => item.key),
    sections: sections.map((item, index) => ({
      title: item.title || `模块 ${index + 1}`,
      purpose: enabledModules.find((module) => module.title === item.title)?.purpose || '',
      completionMode: 'knowledge-plus-model' as const,
      displayMode: (item.displayMode || 'summary') as ReportPlanPageSpec['sections'][number]['displayMode'],
      datavizSlotKeys: datavizSlots
        .filter((slot) => slot.sectionTitle && slot.sectionTitle === item.title)
        .map((slot) => slot.key),
    })),
  } satisfies ReportPlanPageSpec;

  return {
    summary: summaryModule?.contentDraft || record.page?.summary || '',
    cards,
    sections,
    charts,
    datavizSlots,
    pageSpec,
    visualStyle: draft.visualStyle || record.page?.visualStyle || resolveDefaultReportVisualStyle(pageSpec.layoutVariant, record.title),
  };
}

function withDraftPreviewPage(record: ReportOutputRecord, draft: ReportOutputDraft | null): ReportOutputRecord {
  if (!draft) return { ...record, draft: null };
  const nextPage = draftModulesToPage(draft, record) || record.page || null;
  return {
    ...record,
    page: nextPage,
    draft,
  };
}

async function finalizeReportOutputRecord(record: ReportOutputRecord) {
  if (record.status !== 'ready') return record;
  if (record.kind === 'md') return record;
  return attachReportAnalysis(await attachReportDataviz(record));
}

function attachLocalReportAnalysis(record: ReportOutputRecord) {
  if (record.status !== 'ready' || record.kind === 'md') return record;
  const analysis = buildLocalReportAnalysis(record);
  if (!analysis) return record;

  if (isNarrativeReportKind(record.kind)) {
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

function normalizeStoredDatavizSlots(value: unknown): ReportPlanDatavizSlot[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const preferredChartType: ReportPlanDatavizSlot['preferredChartType'] =
        item?.preferredChartType === 'horizontal-bar' || item?.preferredChartType === 'line'
          ? item.preferredChartType
          : 'bar';
      const placement: ReportPlanDatavizSlot['placement'] =
        item?.placement === 'section' ? 'section' : 'hero';
      return {
        key: String(item?.key || '').trim(),
        title: String(item?.title || '').trim(),
        purpose: String(item?.purpose || '').trim(),
        preferredChartType,
        placement,
        sectionTitle: String(item?.sectionTitle || '').trim(),
        evidenceFocus: String(item?.evidenceFocus || '').trim(),
        minItems: Number.isFinite(Number(item?.minItems)) ? Number(item?.minItems) : 2,
        maxItems: Number.isFinite(Number(item?.maxItems)) ? Number(item?.maxItems) : 6,
      } satisfies ReportPlanDatavizSlot;
    })
    .filter((item) => item.title);
}

function normalizeStoredPageSpec(value: unknown): ReportPlanPageSpec | undefined {
  if (!isRecord(value) || !Array.isArray(value.sections)) return undefined;
  const inferStoredDisplayMode = (
    title: string,
    rawDisplayMode: unknown,
  ): ReportPlanPageSpec['sections'][number]['displayMode'] => {
    const explicit = normalizeTextField(rawDisplayMode);
    if (explicit === 'summary' || explicit === 'insight-list' || explicit === 'timeline' || explicit === 'comparison' || explicit === 'cta' || explicit === 'appendix') {
      return explicit;
    }
    return inferSectionDisplayModeFromTitle(
      title,
      /建议|行动|应答|下一步/i.test(title) ? 'cta' : 'summary',
    );
  };
  return {
    layoutVariant: String(value.layoutVariant || '').trim() as ReportPlanPageSpec['layoutVariant'] || 'insight-brief',
    heroCardLabels: Array.isArray(value.heroCardLabels)
      ? value.heroCardLabels.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    heroDatavizSlotKeys: Array.isArray(value.heroDatavizSlotKeys)
      ? value.heroDatavizSlotKeys.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    sections: value.sections.map((item: any) => {
      const completionMode: ReportPlanPageSpec['sections'][number]['completionMode'] =
        item?.completionMode === 'knowledge-first' ? 'knowledge-first' : 'knowledge-plus-model';
      return {
        title: String(item?.title || '').trim(),
        purpose: String(item?.purpose || '').trim(),
        completionMode,
        displayMode: inferStoredDisplayMode(String(item?.title || '').trim(), item?.displayMode),
        datavizSlotKeys: Array.isArray(item?.datavizSlotKeys)
          ? item.datavizSlotKeys.map((entry: any) => String(entry || '').trim()).filter(Boolean)
          : [],
      };
    }).filter((item) => item.title),
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
  const outputType = (dynamicSource?.outputType || fallback.kind || 'page') as 'table' | 'page' | 'ppt' | 'pdf' | 'doc' | 'md';
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
    planDatavizSlots: normalizeStoredDatavizSlots(dynamicSource?.planDatavizSlots),
    planPageSpec: normalizeStoredPageSpec(dynamicSource?.planPageSpec),
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
  groupConfirmedAt?: string;
  categoryConfirmedAt?: string;
}) {
  const timestamps = [item.detailParsedAt, item.cloudStructuredAt, item.retainedAt, item.groupConfirmedAt, item.categoryConfirmedAt]
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
  item: { detailParsedAt?: string; cloudStructuredAt?: string; retainedAt?: string; groupConfirmedAt?: string; categoryConfirmedAt?: string },
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
    planDatavizSlots: plan.datavizSlots.map((item) => ({
      key: item.key,
      title: item.title,
      purpose: item.purpose,
      preferredChartType: item.preferredChartType,
      placement: item.placement,
      sectionTitle: item.sectionTitle,
      evidenceFocus: item.evidenceFocus,
      minItems: item.minItems,
      maxItems: item.maxItems,
    })),
    planPageSpec: {
      layoutVariant: plan.pageSpec.layoutVariant,
      heroCardLabels: plan.pageSpec.heroCardLabels,
      heroDatavizSlotKeys: plan.pageSpec.heroDatavizSlotKeys,
      sections: plan.pageSpec.sections.map((item) => ({
        title: item.title,
        purpose: item.purpose,
        completionMode: item.completionMode,
        displayMode: item.displayMode,
        datavizSlotKeys: item.datavizSlotKeys,
      })),
    },
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

async function buildDynamicPageRecord(
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
    .filter((item) => matchesTimeRange(item as { detailParsedAt?: string; cloudStructuredAt?: string; retainedAt?: string; groupConfirmedAt?: string; categoryConfirmedAt?: string }, source.timeRange));

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
      planDatavizSlots: source.planDatavizSlots || [],
      planPageSpec: source.planPageSpec || null,
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

  return attachReportDataviz(attachLocalReportAnalysis({
    ...record,
    content: summary,
    summary: `${displayTemplateLabel} 已按当前知识库内容动态刷新。`,
    page: {
      summary,
      cards,
      sections,
      datavizSlots: reportPlan.datavizSlots,
      pageSpec: reportPlan.pageSpec,
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
  }));
}

function resolveTemplateTypeFromKind(kind?: 'table' | 'page' | 'ppt' | 'pdf' | 'doc' | 'md'): ReportTemplateType | null {
  if (kind === 'table') return 'table';
  if (kind === 'page') return 'static-page';
  if (kind === 'ppt') return 'ppt';
  if (kind === 'pdf' || kind === 'doc' || kind === 'md') return 'document';
  return null;
}

function resolveOutputTypeLabel(kind?: 'table' | 'page' | 'ppt' | 'pdf' | 'doc' | 'md', templateType?: ReportTemplateType) {
  if (kind === 'table') return '表格';
  if (kind === 'page') return '静态页';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'ppt') return 'PPT';
  if (kind === 'doc') return '文档';
  if (kind === 'md') return 'Markdown';
  if (templateType === 'table') return '表格';
  if (templateType === 'static-page') return '静态页';
  if (templateType === 'document') return '文档';
  return 'PPT';
}

function isNarrativeReportKind(kind?: ReportOutputRecord['kind']) {
  return Boolean(kind && kind !== 'table');
}

function resolveDefaultReportKind(templateType: ReportTemplateType): NonNullable<ReportOutputRecord['kind']> {
  if (templateType === 'table') return 'table';
  if (templateType === 'static-page') return 'page';
  if (templateType === 'document') return 'doc';
  return 'ppt';
}

function resolveDefaultReportFormat(kind: NonNullable<ReportOutputRecord['kind']>) {
  if (kind === 'table') return 'csv';
  if (kind === 'page') return 'html';
  if (kind === 'ppt') return 'pptx';
  if (kind === 'pdf') return 'pdf';
  if (kind === 'md') return 'md';
  return 'docx';
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

function normalizeReportLayoutVariant(value: unknown): ReportPlanLayoutVariant | undefined {
  const normalized = normalizeTextField(value);
  return [
    'insight-brief',
    'risk-brief',
    'operations-cockpit',
    'talent-showcase',
    'research-brief',
    'solution-overview',
  ].includes(normalized)
    ? (normalized as ReportPlanLayoutVariant)
    : undefined;
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

  const type = normalizeStoredTemplateType(value.type);
  return {
    key,
    label: normalizeTextField(value.label) || key,
    type,
    description: normalizeTextField(value.description),
    preferredLayoutVariant: type === 'static-page' ? normalizeReportLayoutVariant(value.preferredLayoutVariant) : undefined,
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
  const displayMode = normalizeTextField(value.displayMode);
  return title || body || bullets.length
    ? { title, body, bullets, displayMode }
    : null;
}

function normalizeStoredPageChartRender(value: unknown) {
  if (!isRecord(value)) return null;
  const renderer = normalizeTextField(value.renderer);
  const chartType = normalizeTextField(value.chartType);
  const svg = normalizeTextField(value.svg);
  const alt = normalizeTextField(value.alt);
  const generatedAt = normalizeTextField(value.generatedAt);
  return renderer || chartType || svg || alt || generatedAt
    ? { renderer, chartType, svg, alt, generatedAt }
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
  const render = normalizeStoredPageChartRender(value.render);

  return title || items.length || render ? { title, items, render } : null;
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
  const datavizSlots = normalizeStoredDatavizSlots(value.datavizSlots);
  const pageSpec = normalizeStoredPageSpec(value.pageSpec);
  const visualStyle = normalizeVisualStylePreset(value.visualStyle);
  const charts: Array<{ title?: string; items?: Array<{ label?: string; value?: number }> }> = Array.isArray(value.charts)
    ? value.charts.map((item) => normalizeStoredPageChart(item)).filter(Boolean) as Array<{ title?: string; items?: Array<{ label?: string; value?: number }> }>
    : [];

  return summary || cards.length || sections.length || charts.length || datavizSlots.length || pageSpec || visualStyle
    ? { summary, cards, sections, datavizSlots, pageSpec, visualStyle, charts }
    : null;
}

function normalizeStoredDraftModuleType(value: unknown): ReportDraftModuleType {
  const normalized = normalizeTextField(value);
  if (
    normalized === 'hero'
    || normalized === 'summary'
    || normalized === 'metric-grid'
    || normalized === 'insight-list'
    || normalized === 'table'
    || normalized === 'chart'
    || normalized === 'timeline'
    || normalized === 'comparison'
    || normalized === 'cta'
    || normalized === 'appendix'
  ) {
    return normalized;
  }
  return 'summary';
}

function normalizeStoredDraftModuleStatus(value: unknown): ReportDraftModuleStatus {
  const normalized = normalizeTextField(value);
  if (normalized === 'edited' || normalized === 'disabled') return normalized;
  return 'generated';
}

function normalizeStoredDraftReviewStatus(value: unknown): ReportDraftReviewStatus {
  const normalized = normalizeTextField(value);
  if (normalized === 'draft_reviewing' || normalized === 'approved') return normalized;
  return 'draft_generated';
}

function normalizeStoredDraftModule(value: unknown, fallbackOrder = 0): ReportDraftModule | null {
  if (!isRecord(value)) return null;

  const moduleId = normalizeTextField(value.moduleId) || buildId('draftmod');
  const moduleType = normalizeStoredDraftModuleType(value.moduleType);
  const title = normalizeTextField(value.title) || '未命名模块';
  const purpose = normalizeTextField(value.purpose);
  const contentDraft = normalizeTextField(value.contentDraft);
  const evidenceRefs = normalizeStringList(value.evidenceRefs);
  const bullets = normalizeStringList(value.bullets);
  const cards = Array.isArray(value.cards)
    ? value.cards.map((item) => normalizeStoredPageCard(item)).filter(Boolean) as Array<{ label?: string; value?: string; note?: string }>
    : [];
  const chartIntent = isRecord(value.chartIntent)
    ? {
        title: normalizeTextField(value.chartIntent.title),
        preferredChartType: normalizeDraftChartType(value.chartIntent.preferredChartType),
        items: Array.isArray(value.chartIntent.items)
          ? value.chartIntent.items
            .map((item) => normalizeStoredPageChart({ items: [item] })?.items?.[0] || null)
            .filter(Boolean) as Array<{ label?: string; value?: number }>
          : [],
      }
    : null;

  return {
    moduleId,
    moduleType,
    title,
    purpose,
    contentDraft,
    evidenceRefs,
    chartIntent,
    cards,
    bullets,
    enabled: value.enabled !== false && normalizeStoredDraftModuleStatus(value.status) !== 'disabled',
    status: normalizeStoredDraftModuleStatus(value.status),
    order: Number.isFinite(Number(value.order)) ? Number(value.order) : fallbackOrder,
    layoutType: normalizeTextField(value.layoutType) || moduleType,
  };
}

function normalizeStoredDraft(value: unknown): ReportOutputDraft | null {
  if (!isRecord(value)) return null;

  const modules = Array.isArray(value.modules)
    ? value.modules
      .map((item, index) => normalizeStoredDraftModule(item, index))
      .filter(Boolean) as ReportDraftModule[]
    : [];

  if (!modules.length) return null;

  return hydrateDraftQuality({
    reviewStatus: normalizeStoredDraftReviewStatus(value.reviewStatus),
    version: Math.max(1, Number(value.version || 1) || 1),
    modules: modules.sort((left, right) => left.order - right.order),
    lastEditedAt: normalizeTextField(value.lastEditedAt),
    approvedAt: normalizeTextField(value.approvedAt),
    audience: normalizeTextField(value.audience),
    objective: normalizeTextField(value.objective),
    layoutVariant: normalizeTextField(value.layoutVariant) as ReportPlanLayoutVariant,
    visualStyle: normalizeVisualStylePreset(value.visualStyle),
    mustHaveModules: normalizeStringList(value.mustHaveModules),
    optionalModules: normalizeStringList(value.optionalModules),
    evidencePriority: normalizeStringList(value.evidencePriority),
    audienceTone: normalizeTextField(value.audienceTone),
    riskNotes: normalizeStringList(value.riskNotes),
  });
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
  return ['table', 'page', 'ppt', 'pdf', 'doc', 'md'].includes(normalized)
    ? (normalized as ReportOutputRecord['kind'])
    : undefined;
}

function normalizeReportOutputStatus(value: unknown): ReportOutputStatus {
  const normalized = normalizeTextField(value);
  if (
    normalized === 'processing'
    || normalized === 'draft_planned'
    || normalized === 'draft_generated'
    || normalized === 'draft_reviewing'
    || normalized === 'final_generating'
    || normalized === 'failed'
  ) {
    return normalized;
  }
  return 'ready';
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
    status: normalizeReportOutputStatus(value.status),
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
    draft: normalizeStoredDraft(value.draft),
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
  const fallbackState = normalizePersistedReportState(null);
  const { data, source } = await readRuntimeStateJson<{ raw: unknown; state: PersistedState }>({
    filePath: REPORT_STATE_FILE,
    fallback: {
      raw: null,
      state: fallbackState,
    },
    normalize: (parsed) => ({
      raw: parsed,
      state: normalizePersistedReportState(parsed),
    }),
  });

  return {
    state: data.state,
    migrated: source !== 'fallback' && JSON.stringify(data.raw) !== JSON.stringify(data.state),
  };
}

async function writeState(state: PersistedState) {
  await ensureDirs();
  await writeRuntimeStateJson({
    filePath: REPORT_STATE_FILE,
    payload: normalizePersistedReportState(state),
  });
}

function hasDatasourceGovernanceId(label: string, key: string, id: string) {
  return resolveDatasourceGovernanceProfile(label, key)?.id === id;
}

function isFormulaLibrary(label: string, key: string) {
  return hasDatasourceGovernanceId(label, key, 'formula');
}

function isResumeLibrary(label: string, key: string) {
  return hasDatasourceGovernanceId(label, key, 'resume');
}

function isOrderLibrary(label: string, key: string) {
  return hasDatasourceGovernanceId(label, key, 'order');
}

function isBidLibrary(label: string, key: string) {
  return hasDatasourceGovernanceId(label, key, 'bid');
}

function isPaperLibrary(label: string, key: string) {
  return hasDatasourceGovernanceId(label, key, 'paper');
}

function isIotLibrary(label: string, key: string) {
  return hasDatasourceGovernanceId(label, key, 'iot');
}

function buildTemplatesForLibrary(label: string, key: string) {
  return expandDatasourceGovernanceProfile(resolveDatasourceGovernanceProfile(label, key), label, key);
}

function buildDefaultSharedTemplates(): SharedReportTemplate[] {
  return buildDefaultSystemTemplates().map((template) => ({
    ...template,
    preferredLayoutVariant: inferTemplatePreferredLayoutVariant(template),
    origin: 'system',
    referenceImages: [],
  }));
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
      preferredLayoutVariant:
        template.preferredLayoutVariant
        || fallback?.preferredLayoutVariant
        || inferTemplatePreferredLayoutVariant({
          ...(fallback || {}),
          ...template,
        }),
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

function looksLikeResumeTemplate(template: Pick<SharedReportTemplate, 'label' | 'description'>) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('简历') || text.includes('resume') || text.includes('cv') || text.includes('候选人');
}

function looksLikeBidTemplate(template: Pick<SharedReportTemplate, 'label' | 'description'>) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('标书') || text.includes('招标') || text.includes('投标') || text.includes('bid') || text.includes('tender');
}

function looksLikeOrderTemplate(template: Pick<SharedReportTemplate, 'label' | 'description'>) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('订单') || text.includes('销售') || text.includes('库存') || text.includes('电商') || text.includes('order');
}

function looksLikeFormulaTemplate(template: Pick<SharedReportTemplate, 'label' | 'description'>) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('配方') || text.includes('奶粉') || text.includes('formula');
}

function looksLikePaperTemplate(template: Pick<SharedReportTemplate, 'label' | 'description'>) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('paper') || text.includes('论文') || text.includes('学术') || text.includes('研究');
}

function looksLikeIotTemplate(template: Pick<SharedReportTemplate, 'label' | 'description'>) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('iot') || text.includes('物联网') || text.includes('设备') || text.includes('网关') || text.includes('解决方案');
}

function inferTemplatePreferredLayoutVariant(template: Pick<SharedReportTemplate, 'type' | 'label' | 'description'>): ReportPlanLayoutVariant | undefined {
  if (template.type !== 'static-page') return undefined;
  if (looksLikeResumeTemplate(template)) return 'talent-showcase';
  if (looksLikeBidTemplate(template)) return 'risk-brief';
  if (looksLikeOrderTemplate(template)) return 'operations-cockpit';
  if (looksLikePaperTemplate(template)) return 'research-brief';
  if (looksLikeIotTemplate(template)) return 'solution-overview';
  return 'insight-brief';
}

export function buildSharedTemplateEnvelope(template: SharedReportTemplate): ReportTemplateEnvelope {
  const governanceProfile = resolveTemplateEnvelopeProfile(template);
  if (governanceProfile) {
    return {
      title: template.label,
      fixedStructure: [...governanceProfile.envelope.fixedStructure],
      variableZones: [...governanceProfile.envelope.variableZones],
      outputHint: String(governanceProfile.envelope.outputHint || template.description || '').trim(),
      tableColumns: governanceProfile.envelope.tableColumns?.length ? [...governanceProfile.envelope.tableColumns] : undefined,
      pageSections: governanceProfile.envelope.pageSections?.length ? [...governanceProfile.envelope.pageSections] : undefined,
    };
  }

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
  return buildSharedTemplateEnvelope({
    key: template.key,
    label: template.label,
    type: template.type,
    description: template.description,
    supported: template.supported,
    origin: 'system',
    referenceImages: group.referenceImages || [],
  });
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
  scheduleOpenClawMemoryCatalogSync('report-center-state-changed');
}

export async function loadReportCenterState() {
  return loadReportCenterStateWithOptions();
}

export async function loadReportCenterReadState() {
  return loadReportCenterStateWithOptions({
    refreshDynamicPages: false,
    persistFixups: false,
  });
}

export async function loadReportCenterStateWithOptions(options?: {
  refreshDynamicPages?: boolean;
  persistFixups?: boolean;
}) {
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
  const refreshDynamicPages = options?.refreshDynamicPages !== false;
  if (refreshDynamicPages && nextOutputs.some((item) => item.kind === 'page' && item.dynamicSource?.enabled && !item.draft)) {
    const documentState = await loadParsedDocuments(400, false);
    nextOutputs = await Promise.all(nextOutputs.map(async (item) => {
      if (!(item.kind === 'page' && item.dynamicSource?.enabled) || item.draft) return item;
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
      const refreshed = await buildDynamicPageRecord(
        item,
        group || null,
        template || null,
        documentState.items as Array<Record<string, unknown>>,
      );
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
    }));
  }

  const persistFixups = options?.persistFixups !== false;
  if (persistFixups && (migrated || changed || refreshedChanged)) {
    await saveGroupsAndOutputs(groups, nextOutputs, templates);
  }

  return { groups, outputs: nextOutputs, templates };
}

export async function createReportOutput(input: {
  groupKey: string;
  templateKey?: string;
  title?: string;
  triggerSource?: 'report-center' | 'chat';
  kind?: 'table' | 'page' | 'ppt' | 'pdf' | 'doc' | 'md';
  format?: string;
  status?: ReportOutputStatus;
  summary?: string;
  content?: string;
  table?: ReportOutputRecord['table'];
  page?: ReportOutputRecord['page'];
  draft?: ReportOutputRecord['draft'];
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
  const resolvedKind = input.kind || resolveDefaultReportKind(template.type);
  const shouldCreateDraft = resolvedKind === 'page' && Boolean(input.page || input.draft || input.dynamicSource);
  const resolvedStatus = input.status || (shouldCreateDraft ? 'draft_generated' : 'ready');
  const baseRecord: ReportOutputRecord = {
    id: buildId('report'),
    groupKey: group.key,
    groupLabel: group.label,
    templateKey: template.key,
    templateLabel: template.label,
    title: input.title?.trim() || `${group.label}-${template.label}-${createdAt.slice(0, 10)}`,
    outputType: resolveOutputTypeLabel(resolvedKind, template.type),
    kind: resolvedKind,
    format: input.format || resolveDefaultReportFormat(resolvedKind),
    createdAt,
    status: resolvedStatus,
    summary: String(input.summary || '').trim()
      || (resolvedStatus === 'processing'
        ? `${group.label} 分组内容已转入后台继续生成。`
        : resolvedStatus === 'draft_planned'
          ? `${group.label} 分组已生成静态页草稿规划。`
          : resolvedStatus === 'draft_generated'
            ? `${group.label} 分组已生成可审改的静态页草稿。`
            : resolvedStatus === 'draft_reviewing'
              ? `${group.label} 分组静态页草稿正在审改。`
              : resolvedStatus === 'final_generating'
                ? `${group.label} 分组静态页草稿已确认，正在生成终稿。`
        : resolvedStatus === 'failed'
          ? `${group.label} 分组内容生成失败。`
          : `${group.label} 分组已按 ${template.label} 模板生成成型报表。`),
    triggerSource: input.triggerSource || 'report-center',
    content: input.content || '',
    table: input.table || null,
    page: input.page || null,
    libraries: Array.isArray(input.libraries) ? input.libraries : [],
    downloadUrl: input.downloadUrl || '',
    dynamicSource: normalizeDynamicSource(input.dynamicSource, {
      request: input.title || group.label,
      kind: resolvedKind,
      templateKey: template.key,
      templateLabel: template.label,
      libraries: Array.isArray(input.libraries) && input.libraries.length
        ? input.libraries
        : [{ key: group.key, label: group.label }],
      }),
    draft: input.draft || null,
  };

  const recordWithDraft = shouldCreateDraft
    ? withDraftPreviewPage(baseRecord, input.draft || buildDraftForRecord(baseRecord))
    : baseRecord;

  const record = await finalizeReportOutputRecord(recordWithDraft);

  const nextOutputs = [record, ...state.outputs].slice(0, 100);
  await saveGroupsAndOutputs(state.groups, nextOutputs, state.templates);
  await syncReportOutputToKnowledgeLibrarySafely(record);
  return record;
}

export async function updateReportOutput(outputId: string, patch: {
  title?: string;
  kind?: ReportOutputRecord['kind'];
  format?: string;
  status?: ReportOutputStatus;
  summary?: string;
  content?: string;
  table?: ReportOutputRecord['table'];
  page?: ReportOutputRecord['page'];
  draft?: ReportOutputRecord['draft'];
  libraries?: ReportOutputRecord['libraries'];
  downloadUrl?: string;
  dynamicSource?: ReportOutputRecord['dynamicSource'];
}) {
  const state = await loadReportCenterState();
  const current = state.outputs.find((item) => item.id === outputId);
  if (!current) throw new Error('report output not found');

  const nextBase: ReportOutputRecord = {
    ...current,
    title: patch.title !== undefined ? String(patch.title || '').trim() || current.title : current.title,
    kind: patch.kind !== undefined ? patch.kind : current.kind,
    format: patch.format !== undefined ? String(patch.format || '').trim() || current.format : current.format,
    status: patch.status || current.status,
    summary: patch.summary !== undefined ? String(patch.summary || '').trim() || current.summary : current.summary,
    content: patch.content !== undefined ? String(patch.content || '') : current.content,
    table: patch.table !== undefined ? patch.table || null : current.table,
    page: patch.page !== undefined ? patch.page || null : current.page,
    draft: patch.draft !== undefined ? patch.draft || null : current.draft,
    libraries: patch.libraries !== undefined ? (Array.isArray(patch.libraries) ? patch.libraries : []) : current.libraries,
    downloadUrl: patch.downloadUrl !== undefined ? String(patch.downloadUrl || '').trim() : current.downloadUrl,
    dynamicSource: patch.dynamicSource !== undefined ? patch.dynamicSource || null : current.dynamicSource,
  };
  const nextPrepared = nextBase.kind === 'page'
    ? withDraftPreviewPage(nextBase, nextBase.draft || buildDraftForRecord(nextBase))
    : nextBase;
  const nextRecord = await finalizeReportOutputRecord(nextPrepared);
  const nextOutputs = state.outputs.map((item) => (item.id === outputId ? nextRecord : item));
  await saveGroupsAndOutputs(state.groups, nextOutputs, state.templates);
  await syncReportOutputToKnowledgeLibrarySafely(nextRecord);
  return nextRecord;
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
  preferredLayoutVariant?: ReportPlanLayoutVariant;
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
    preferredLayoutVariant: type === 'static-page'
      ? (
        input.preferredLayoutVariant
        || inferTemplatePreferredLayoutVariant({
          label,
          type,
          description: String(input.description || '').trim() || `${label} 模板`,
        })
      )
      : undefined,
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
  preferredLayoutVariant?: ReportPlanLayoutVariant;
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
        preferredLayoutVariant:
          item.type === 'static-page' && patch.preferredLayoutVariant !== undefined
            ? patch.preferredLayoutVariant
            : item.preferredLayoutVariant,
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

export async function addSharedTemplateReferenceFileFromPath(templateKey: string, input: {
  filePath: string;
  originalName?: string;
  sourceType?: ReportReferenceSourceType;
  mimeType?: string;
}) {
  const state = await loadReportCenterState();
  const template = state.templates.find((item) => item.key === templateKey);
  if (!template) throw new Error('shared report template not found');
  if (!isUserSharedReportTemplate(template)) throw new Error('system template cannot accept uploaded references');

  const sourcePath = normalizePath(input.filePath);
  if (!sourcePath) throw new Error('template source file path is invalid');

  let stats: Awaited<ReturnType<typeof fs.stat>> | null = null;
  try {
    stats = await fs.stat(sourcePath);
  } catch {
    stats = null;
  }
  if (!stats?.isFile()) throw new Error('template source file not found');

  const safeName = sanitizeFileName(input.originalName || path.basename(sourcePath) || 'template-reference');
  const duplicate = findDuplicateSharedTemplateReference(state.templates, { fileName: safeName });
  if (duplicate) {
    throw new Error(`template reference already exists in ${duplicate.templateLabel}`);
  }

  await ensureDirs();
  const id = buildId('tmplref');
  const ext = path.extname(safeName) || path.extname(sourcePath) || '.dat';
  const outputName = `${id}${ext}`;
  const fullPath = path.join(REPORT_REFERENCE_DIR, outputName);
  await fs.copyFile(sourcePath, fullPath);

  const uploaded = normalizeReportReferenceImage({
    id,
    fileName: outputName,
    originalName: safeName,
    uploadedAt: new Date().toISOString(),
    relativePath: path.relative(STORAGE_ROOT, fullPath).replace(/\\/g, '/'),
    kind: 'file',
    sourceType: input.sourceType || inferReportReferenceSourceType({ fileName: safeName, mimeType: input.mimeType }),
    mimeType: String(input.mimeType || '').trim(),
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

function findReportOutputOrThrow(outputs: ReportOutputRecord[], outputId: string) {
  const record = outputs.find((item) => item.id === outputId);
  if (!record) throw new Error('report output not found');
  return record;
}

function parseFirstJsonBlock<T>(content: string): T | null {
  const source = String(content || '').trim();
  if (!source) return null;
  const fenceMatch = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch?.[1] || source;
  const startIndex = Math.min(
    ...['{', '[']
      .map((token) => candidate.indexOf(token))
      .filter((index) => index >= 0),
  );
  if (!Number.isFinite(startIndex)) return null;

  for (let index = candidate.length; index > startIndex; index -= 1) {
    const snippet = candidate.slice(startIndex, index).trim();
    try {
      return JSON.parse(snippet) as T;
    } catch {
      // continue
    }
  }
  return null;
}

function coerceDraftModuleFromModel(value: unknown, fallback: ReportDraftModule): ReportDraftModule {
  if (!isRecord(value)) return fallback;
  const parsed = normalizeStoredDraftModule({
    moduleId: fallback.moduleId,
    moduleType: value.moduleType ?? fallback.moduleType,
    title: value.title ?? fallback.title,
    purpose: value.purpose ?? fallback.purpose,
    contentDraft: value.contentDraft ?? value.body ?? fallback.contentDraft,
    evidenceRefs: value.evidenceRefs ?? fallback.evidenceRefs,
    chartIntent: value.chartIntent ?? fallback.chartIntent,
    cards: value.cards ?? fallback.cards,
    bullets: value.bullets ?? fallback.bullets,
    enabled: value.enabled ?? fallback.enabled,
    status: value.status ?? 'edited',
    order: value.order ?? fallback.order,
    layoutType: value.layoutType ?? fallback.layoutType,
  }, fallback.order);
  return parsed || fallback;
}

function buildDraftStructureSummary(draft: ReportOutputDraft) {
  return (draft.modules || [])
    .sort((left, right) => left.order - right.order)
    .map((module) => ({
      moduleId: module.moduleId,
      moduleType: module.moduleType,
      title: module.title,
      enabled: module.enabled,
      order: module.order,
      layoutType: module.layoutType || module.moduleType,
    }));
}

function normalizeDraftChecklistLabel(value: string) {
  return String(value || '').trim().toLowerCase();
}

function doesDraftModuleMatchRequirement(module: ReportDraftModule, requirement: string) {
  const normalizedRequirement = normalizeDraftChecklistLabel(requirement);
  if (!normalizedRequirement) return false;
  const candidates = [
    module.title,
    module.purpose,
    module.layoutType,
    module.moduleType,
  ]
    .map((item) => normalizeDraftChecklistLabel(item || ''))
    .filter(Boolean);
  return candidates.some((candidate) => (
    candidate === normalizedRequirement
    || candidate.includes(normalizedRequirement)
    || normalizedRequirement.includes(candidate)
  ));
}

function getEnabledDraftModules(draft: ReportOutputDraft) {
  return (draft.modules || [])
    .filter((module) => module.enabled !== false && module.status !== 'disabled')
    .sort((left, right) => left.order - right.order);
}

function hasMeaningfulDraftContent(module: ReportDraftModule) {
  return Boolean(
    String(module.contentDraft || '').trim()
    || (Array.isArray(module.bullets) && module.bullets.some((item) => String(item || '').trim()))
    || (Array.isArray(module.cards) && module.cards.some((item) => String(item?.label || '').trim() || String(item?.value || '').trim()))
    || (Array.isArray(module.chartIntent?.items) && module.chartIntent.items.some((item) => String(item?.label || '').trim()))
  );
}

function hasMeaningfulEvidenceRefs(module: ReportDraftModule) {
  return Array.isArray(module.evidenceRefs)
    && module.evidenceRefs.some((item) => {
      const normalized = String(item || '').trim().toLowerCase();
      return Boolean(normalized && normalized !== 'composer:placeholder');
    });
}

function hasEvidenceSignals(module: ReportDraftModule) {
  return Boolean(
    hasMeaningfulEvidenceRefs(module)
    || (Array.isArray(module.cards) && module.cards.some((item) => String(item?.label || '').trim() || String(item?.value || '').trim()))
    || (Array.isArray(module.chartIntent?.items) && module.chartIntent.items.some((item) => String(item?.label || '').trim()))
  );
}

function isPriorityEvidenceModule(module: ReportDraftModule, draft: ReportOutputDraft) {
  const priorities = Array.isArray(draft.evidencePriority) ? draft.evidencePriority : [];
  if (!priorities.length) return false;
  return priorities.some((item) => doesDraftModuleMatchRequirement(module, item));
}

function buildDraftQualityChecklist(draft: ReportOutputDraft) {
  const enabledModules = getEnabledDraftModules(draft);
  const meaningfulModules = enabledModules.filter(hasMeaningfulDraftContent);
  const missingMustHaveModules = (draft.mustHaveModules || [])
    .filter((title) => String(title || '').trim())
    .filter((title) => !enabledModules.some((module) => doesDraftModuleMatchRequirement(module, title)));

  const evidenceCoverage = {
    coveredModules: enabledModules.filter(hasEvidenceSignals).length,
    totalModules: enabledModules.length,
    ratio: enabledModules.length
      ? Number((enabledModules.filter(hasEvidenceSignals).length / enabledModules.length).toFixed(3))
      : 0,
  } satisfies ReportDraftEvidenceCoverage;
  const priorityEvidenceModules = enabledModules.filter((module) => isPriorityEvidenceModule(module, draft));
  const priorityEvidenceCoverage = {
    coveredModules: priorityEvidenceModules.filter(hasEvidenceSignals).length,
    totalModules: priorityEvidenceModules.length,
    ratio: priorityEvidenceModules.length
      ? Number((priorityEvidenceModules.filter(hasEvidenceSignals).length / priorityEvidenceModules.length).toFixed(3))
      : 0,
  };

  const hasVisualModule = enabledModules.some((module) => (
    module.moduleType === 'metric-grid'
    || module.moduleType === 'chart'
    || module.moduleType === 'timeline'
    || module.moduleType === 'comparison'
  ));
  const heroOrSummaryPresent = enabledModules.some((module) => module.moduleType === 'hero' || module.moduleType === 'summary');

  const checklist: ReportDraftChecklistItem[] = [
    {
      key: 'enabled-modules',
      label: '已启用模块',
      status: enabledModules.length ? 'pass' : 'fail',
      detail: enabledModules.length
        ? `已启用 ${enabledModules.length} 个模块。`
        : '当前草稿没有启用模块。',
      blocking: true,
    },
    {
      key: 'must-have-modules',
      label: '关键模块完整度',
      status: missingMustHaveModules.length ? 'fail' : 'pass',
      detail: missingMustHaveModules.length
        ? `缺少关键模块：${missingMustHaveModules.join('、')}`
        : '关键模块已覆盖。',
      blocking: true,
    },
    {
      key: 'meaningful-content',
      label: '模块内容完整度',
      status: meaningfulModules.length ? 'pass' : 'fail',
      detail: meaningfulModules.length
        ? `有内容的模块 ${meaningfulModules.length}/${enabledModules.length || 0}。`
        : '当前没有可读的模块正文或图表草稿。',
      blocking: true,
    },
    {
      key: 'hero-summary',
      label: '开场摘要',
      status: heroOrSummaryPresent ? 'pass' : 'warning',
      detail: heroOrSummaryPresent ? '已包含开场摘要模块。' : '建议补一个 hero 或 summary 模块。',
    },
    {
      key: 'visual-coverage',
      label: '可视化覆盖',
      status: hasVisualModule ? 'pass' : 'warning',
      detail: hasVisualModule ? '已包含指标、对比、时间线或图表模块。' : '建议补至少一个指标、对比、时间线或图表模块。',
    },
    {
      key: 'evidence-coverage',
      label: '证据与数据覆盖',
      status: evidenceCoverage.totalModules === 0
        ? 'warning'
        : evidenceCoverage.ratio >= 0.4
          ? 'pass'
          : 'warning',
      detail: evidenceCoverage.totalModules
        ? `有证据或数据支撑的模块 ${evidenceCoverage.coveredModules}/${evidenceCoverage.totalModules}。`
        : '当前还没有可评估的模块。',
    },
    {
      key: 'priority-evidence',
      label: '关键模块证据覆盖',
      status: priorityEvidenceCoverage.totalModules === 0
        ? 'warning'
        : priorityEvidenceCoverage.ratio >= 0.6
          ? 'pass'
          : 'warning',
      detail: priorityEvidenceCoverage.totalModules
        ? `重点模块证据覆盖 ${priorityEvidenceCoverage.coveredModules}/${priorityEvidenceCoverage.totalModules}。`
        : '当前还没有声明需要重点覆盖证据的模块。',
    },
  ];

  const blockingFailures = checklist.some((item) => item.blocking && item.status === 'fail');
  const warnings = checklist.some((item) => item.status === 'warning');
  const readiness: ReportDraftReadiness = blockingFailures
    ? 'blocked'
    : warnings
      ? 'needs_attention'
      : 'ready';

  return {
    readiness,
    qualityChecklist: checklist,
    missingMustHaveModules,
    evidenceCoverage,
  };
}

function hydrateDraftQuality(draft: ReportOutputDraft): ReportOutputDraft {
  const quality = buildDraftQualityChecklist(draft);
  return {
    ...draft,
    ...quality,
  };
}

export async function updateReportOutputDraft(outputId: string, nextDraftInput: ReportOutputDraft) {
  const state = await loadReportCenterState();
  const record = findReportOutputOrThrow(state.outputs, outputId);
  if (record.kind !== 'page') throw new Error('draft editing only supports static pages');

  const currentDraft = record.draft || buildDraftForRecord(record);
  if (!currentDraft) throw new Error('draft is not available for this output');
  const reviewStatus: ReportDraftReviewStatus =
    nextDraftInput?.reviewStatus === 'approved' ? 'approved' : 'draft_reviewing';

  const normalizedDraft = normalizeStoredDraft({
    ...nextDraftInput,
    version: Math.max(currentDraft.version + 1, Number(nextDraftInput?.version || 0) || 0, 1),
    reviewStatus,
    lastEditedAt: new Date().toISOString(),
    approvedAt: reviewStatus === 'approved' ? (nextDraftInput?.approvedAt || new Date().toISOString()) : '',
  });
  if (!normalizedDraft) throw new Error('draft payload is invalid');

  const nextRecordBase: ReportOutputRecord = {
    ...record,
    status: normalizedDraft.reviewStatus === 'approved' ? 'final_generating' : 'draft_reviewing',
    draft: normalizedDraft,
    summary: normalizedDraft.reviewStatus === 'approved'
      ? '草稿已确认，正在生成终稿。'
      : '静态页草稿已更新，等待继续生成终稿。',
  };
  const nextRecord = withDraftPreviewPage(nextRecordBase, normalizedDraft);
  const nextOutputs = state.outputs.map((item) => (item.id === outputId ? nextRecord : item));
  await saveGroupsAndOutputs(state.groups, nextOutputs, state.templates);
  return nextRecord;
}

export async function reviseReportOutputDraftModule(outputId: string, moduleId: string, instruction: string) {
  const state = await loadReportCenterState();
  const record = findReportOutputOrThrow(state.outputs, outputId);
  if (record.kind !== 'page') throw new Error('draft module revise only supports static pages');

  const draft = record.draft || buildDraftForRecord(record);
  if (!draft) throw new Error('draft is not available for this output');
  const moduleIndex = draft.modules.findIndex((item) => item.moduleId === moduleId);
  if (moduleIndex < 0) throw new Error('draft module not found');

  const currentModule = draft.modules[moduleIndex];
  let revisedModule = {
    ...currentModule,
    status: 'edited' as const,
  };

  if (isOpenClawGatewayConfigured()) {
    try {
      const response = await runOpenClawChat({
        prompt: [
          '请根据用户要求，只改写这个静态页草稿模块。',
          `用户要求：${String(instruction || '').trim()}`,
          '',
          '请输出 JSON 对象，字段只允许包含：',
          'title, moduleType, contentDraft, bullets, layoutType, chartIntent',
          '',
          JSON.stringify({
            pageTitle: record.title,
            groupLabel: record.groupLabel,
            draftObjective: draft.objective || '',
            module: currentModule,
          }, null, 2),
        ].join('\n'),
        systemPrompt: [
          '你是企业静态页编辑助手。',
          '你只修改一个模块，不要影响其他模块。',
          '返回严格 JSON，不要解释。',
          '如果模块是 chart，只更新 chartIntent.title、chartIntent.preferredChartType、contentDraft。',
        ].join('\n'),
      });
      const parsed = parseFirstJsonBlock<unknown>(response.content);
      revisedModule = {
        ...coerceDraftModuleFromModel(parsed, currentModule),
        moduleId: currentModule.moduleId,
        order: currentModule.order,
        status: 'edited',
      };
    } catch {
      revisedModule = {
        ...currentModule,
        contentDraft: instruction ? `${currentModule.contentDraft}\n\n${instruction}`.trim() : currentModule.contentDraft,
        status: 'edited',
      };
    }
  }

  const nextDraft: ReportOutputDraft = {
    ...draft,
    reviewStatus: 'draft_reviewing',
    version: draft.version + 1,
    lastEditedAt: new Date().toISOString(),
    modules: draft.modules.map((item, index) => (index === moduleIndex ? revisedModule : item)),
  };
  return updateReportOutputDraft(outputId, nextDraft);
}

export async function reviseReportOutputDraftStructure(outputId: string, instruction: string) {
  const state = await loadReportCenterState();
  const record = findReportOutputOrThrow(state.outputs, outputId);
  if (record.kind !== 'page') throw new Error('draft structure revise only supports static pages');

  const draft = record.draft || buildDraftForRecord(record);
  if (!draft) throw new Error('draft is not available for this output');

  let nextModules = draft.modules;
  if (isOpenClawGatewayConfigured()) {
    try {
      const response = await runOpenClawChat({
        prompt: [
          '请根据用户要求，只调整静态页草稿的模块结构。',
          `用户要求：${String(instruction || '').trim()}`,
          '',
          '返回 JSON 数组。每个元素只允许包含：',
          'moduleId, moduleType, title, enabled, order, layoutType',
          '',
          JSON.stringify({
            pageTitle: record.title,
            groupLabel: record.groupLabel,
            objective: draft.objective || '',
            modules: buildDraftStructureSummary(draft),
          }, null, 2),
        ].join('\n'),
        systemPrompt: [
          '你是企业静态页结构编辑助手。',
          '只调整模块结构，不改正文内容。',
          '返回严格 JSON 数组，不要解释。',
        ].join('\n'),
      });
      const parsed = parseFirstJsonBlock<Array<unknown>>(response.content);
      if (Array.isArray(parsed) && parsed.length) {
        const currentById = new Map(draft.modules.map((item) => [item.moduleId, item]));
        const reordered = parsed
          .map((item, index) => {
            const entry = isRecord(item) ? item : null;
            const fallback = currentById.get(String(entry?.moduleId || '').trim());
            if (!fallback) return null;
            const next = coerceDraftModuleFromModel({
              ...(entry || {}),
              contentDraft: fallback.contentDraft,
              bullets: fallback.bullets,
              cards: fallback.cards,
              chartIntent: fallback.chartIntent,
              evidenceRefs: fallback.evidenceRefs,
            }, fallback);
            return {
              ...next,
              moduleId: fallback.moduleId,
              order: Number.isFinite(Number(entry?.order))
                ? Number(entry?.order)
                : index,
            };
          })
          .filter(Boolean) as ReportDraftModule[];
        if (reordered.length) {
          nextModules = reordered;
        }
      }
    } catch {
      // keep original structure
    }
  }

  const nextDraft: ReportOutputDraft = {
    ...draft,
    reviewStatus: 'draft_reviewing',
    version: draft.version + 1,
    lastEditedAt: new Date().toISOString(),
    modules: nextModules,
  };
  return updateReportOutputDraft(outputId, nextDraft);
}

export async function reviseReportOutputDraftCopy(outputId: string, instruction: string) {
  const state = await loadReportCenterState();
  const record = findReportOutputOrThrow(state.outputs, outputId);
  if (record.kind !== 'page') throw new Error('draft copy revise only supports static pages');

  const draft = record.draft || buildDraftForRecord(record);
  if (!draft) throw new Error('draft is not available for this output');

  let nextModules = draft.modules;
  if (isOpenClawGatewayConfigured()) {
    try {
      const response = await runOpenClawChat({
        prompt: [
          '请根据用户要求，只重写静态页草稿各模块的标题、正文、要点和图表意图。',
          `用户要求：${String(instruction || '').trim()}`,
          '',
          '返回 JSON 数组。每个元素只允许包含：',
          'moduleId, title, contentDraft, bullets, chartIntent',
          '',
          JSON.stringify({
            pageTitle: record.title,
            groupLabel: record.groupLabel,
            objective: draft.objective || '',
            audience: draft.audience || '',
            modules: draft.modules.map((module) => ({
              moduleId: module.moduleId,
              moduleType: module.moduleType,
              title: module.title,
              purpose: module.purpose,
              contentDraft: module.contentDraft,
              bullets: module.bullets,
              chartIntent: module.chartIntent,
            })),
          }, null, 2),
        ].join('\n'),
        systemPrompt: [
          '你是企业静态页文案编辑助手。',
          '只重写模块内容，不改模块顺序，不改启用状态，不改模块类型。',
          '返回严格 JSON 数组，不要解释。',
        ].join('\n'),
      });
      const parsed = parseFirstJsonBlock<Array<unknown>>(response.content);
      if (Array.isArray(parsed) && parsed.length) {
        const patchById = new Map(
          parsed
            .map((item) => (isRecord(item) ? item : null))
            .filter(Boolean)
            .map((item) => [String(item?.moduleId || '').trim(), item] as const)
            .filter(([moduleId]) => moduleId),
        );
        nextModules = draft.modules.map((module) => {
          const patch = patchById.get(module.moduleId);
          if (!patch) return module;
          const revised = coerceDraftModuleFromModel({
            ...patch,
            moduleType: module.moduleType,
            layoutType: module.layoutType,
            cards: module.cards,
            evidenceRefs: module.evidenceRefs,
          }, module);
          return {
            ...revised,
            moduleId: module.moduleId,
            moduleType: module.moduleType,
            layoutType: module.layoutType,
            order: module.order,
            enabled: module.enabled,
            status: 'edited',
          };
        });
      }
    } catch {
      nextModules = draft.modules.map((module) => ({
        ...module,
        contentDraft: instruction ? `${module.contentDraft}\n\n${instruction}`.trim() : module.contentDraft,
        status: 'edited',
      }));
    }
  } else {
    nextModules = draft.modules.map((module) => ({
      ...module,
      contentDraft: instruction ? `${module.contentDraft}\n\n${instruction}`.trim() : module.contentDraft,
      status: 'edited',
    }));
  }

  const nextDraft: ReportOutputDraft = {
    ...draft,
    reviewStatus: 'draft_reviewing',
    version: draft.version + 1,
    lastEditedAt: new Date().toISOString(),
    modules: nextModules,
  };
  return updateReportOutputDraft(outputId, nextDraft);
}

export async function finalizeDraftReportOutput(outputId: string) {
  const state = await loadReportCenterState();
  const record = findReportOutputOrThrow(state.outputs, outputId);
  if (record.kind !== 'page') throw new Error('draft finalize only supports static pages');

  const draft = record.draft || buildDraftForRecord(record);
  if (!draft) throw new Error('draft is not available for this output');

  const validatedDraft = hydrateDraftQuality(draft);
  if (validatedDraft.readiness === 'blocked') {
    const blockingIssues = (validatedDraft.qualityChecklist || [])
      .filter((item) => item.blocking && item.status === 'fail')
      .map((item) => item.detail || item.label)
      .filter(Boolean);
    throw new Error(blockingIssues.length
      ? `draft is not ready to finalize: ${blockingIssues.join('；')}`
      : 'draft is not ready to finalize');
  }

  const approvedDraft: ReportOutputDraft = hydrateDraftQuality({
    ...validatedDraft,
    reviewStatus: 'approved',
    version: draft.version + 1,
    approvedAt: new Date().toISOString(),
    lastEditedAt: new Date().toISOString(),
  });
  const baseRecord = withDraftPreviewPage({
    ...record,
    status: 'ready',
    summary: '静态页草稿已确认，并已生成终稿。',
    draft: approvedDraft,
    dynamicSource: record.dynamicSource
      ? { ...record.dynamicSource, lastRenderedAt: new Date().toISOString() }
      : record.dynamicSource,
  }, approvedDraft);
  const finalized = await finalizeReportOutputRecord(baseRecord);
  const nextOutputs = state.outputs.map((item) => (item.id === outputId ? finalized : item));
  await saveGroupsAndOutputs(state.groups, nextOutputs, state.templates);
  await syncReportOutputToKnowledgeLibrarySafely(finalized);
  return finalized;
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
  const conceptMode = isNarrativeReportKind(record.kind) && Boolean(record.dynamicSource?.conceptMode);

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
      record.kind || 'page',
      normalizedInstruction,
      cloud.content,
      envelope,
      [],
      [],
      {
        datavizSlots: record.dynamicSource?.planDatavizSlots || [],
        pageSpec: record.page?.pageSpec || record.dynamicSource?.planPageSpec,
      },
    );

    const nextTable = 'table' in normalized ? normalized.table || null : null;
    const nextPage = 'page' in normalized ? normalized.page || null : null;
    const nextFormat = 'format' in normalized ? normalized.format || record.format : record.format;

    revisedBase = await attachReportDataviz({
      ...record,
      summary: `${record.templateLabel} 已根据自然语言要求更新。`,
      content: normalized.content,
      table: nextTable,
      page: nextPage,
      format: nextFormat,
      kind: record.kind,
    });
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
