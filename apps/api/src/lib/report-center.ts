import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import { loadDocumentCategoryConfig } from './document-config.js';
import { loadDocumentLibraries } from './document-libraries.js';
import { ingestExistingLocalFiles } from './document-upload-ingest.js';
import { DEFAULT_SCAN_DIR, loadParsedDocuments } from './document-store.js';
import { normalizeReportOutput } from './knowledge-output.js';
import { type ReportPlanDatavizSlot, type ReportPlanLayoutVariant, type ReportPlanPageSpec, type ReportPlanVisualMixTarget } from './report-planner.js';
import { attachDatavizRendersToPage } from './report-dataviz.js';
import { buildDraftForRecordWithDeps } from './report-draft-builder.js';
import {
  finalizeDraftReportOutputWithDeps,
  restoreReportOutputDraftHistoryWithDeps,
  reviseReportOutputDraftCopyWithDeps,
  reviseReportOutputDraftModuleWithDeps,
  reviseReportOutputDraftStructureWithDeps,
  updateReportOutputDraftWithDeps,
} from './report-draft-actions.js';
import {
  addSharedTemplateReferenceFileFromPathWithDeps,
  addSharedTemplateReferenceLinkWithDeps,
  createSharedReportTemplateWithDeps,
  deleteSharedReportTemplateWithDeps,
  deleteSharedTemplateReferenceWithDeps,
  readSharedTemplateReferenceFileWithDeps,
  updateReportGroupTemplateWithDeps,
  updateSharedReportTemplateWithDeps,
  uploadReportReferenceImageWithDeps,
  uploadSharedTemplateReferenceWithDeps,
} from './report-template-actions.js';
import {
  createReportOutputWithDeps,
  deleteReportOutputWithDeps,
  updateReportOutputWithDeps,
} from './report-output-actions.js';
import { buildDynamicPageRecordWithDeps } from './report-dynamic-pages.js';
import { reviseReportOutputWithDeps } from './report-output-revision.js';
import {
  attachLocalReportAnalysisWithDeps,
  attachReportAnalysisWithDeps,
  attachReportDatavizWithDeps,
  finalizeReportOutputRecordWithDeps,
  summarizePageForAnalysis,
  summarizeTableForAnalysis,
} from './report-output-enrichment.js';
import {
  deleteStoredReferenceFileWithDeps,
  normalizePath,
  resolveReferenceFilePath,
  syncReportOutputToKnowledgeLibrarySafelyWithDeps,
} from './report-output-library-sync.js';
import {
  appendDraftHistory,
  buildDraftStructureSummary,
} from './report-draft-history.js';
import { withDraftPreviewPage } from './report-draft-preview.js';
import { hydrateDraftQuality } from './report-draft-quality.js';
import { inferSectionDisplayModeFromTitle } from './report-visual-intent.js';
import {
  buildGroupFromLibraryWithDeps,
  loadReportCenterStateWithOptionsWithDeps,
  mergeSharedTemplatesWithDeps,
  normalizePersistedReportStateWithDeps,
  normalizeStoredDraft,
  normalizeStoredDraftModule,
  readReportCenterStateWithDeps,
  reconcileOutputRecordsWithDeps,
  saveReportCenterGroupsAndOutputsWithDeps,
  writeReportCenterStateWithDeps,
} from './report-center-state-store.js';
import {
  buildDefaultSystemTemplates,
  expandDatasourceGovernanceProfile,
  resolveDatasourceGovernanceProfile,
} from './report-governance.js';
import { adaptTemplateEnvelopeForRequest } from './report-template-adapter.js';
import {
  buildSharedTemplateEnvelope as buildSharedTemplateEnvelopeFromHelper,
  buildTemplateEnvelope as buildTemplateEnvelopeFromHelper,
  inferTemplatePreferredLayoutVariant,
} from './report-template-envelopes.js';
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
  planMustHaveModules?: string[];
  planOptionalModules?: string[];
  planEvidencePriority?: string[];
  planAudienceTone?: string;
  planRiskNotes?: string[];
  planVisualMixTargets?: ReportPlanVisualMixTarget[];
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
export type ReportDraftHistoryAction = 'saved' | 'module-revised' | 'structure-revised' | 'copy-revised' | 'finalized' | 'restored';

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

export type ReportDraftHistorySnapshot = {
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
  visualMixTargets?: ReportPlanVisualMixTarget[];
};

export type ReportDraftHistoryEntry = {
  id: string;
  action: ReportDraftHistoryAction;
  label: string;
  detail?: string;
  createdAt: string;
  snapshot?: ReportDraftHistorySnapshot | null;
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
  history?: ReportDraftHistoryEntry[];
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
  visualMixTargets?: ReportPlanVisualMixTarget[];
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

async function attachReportAnalysis(record: ReportOutputRecord) {
  return attachReportAnalysisWithDeps(record, getReportOutputEnrichmentDeps());
}

async function attachReportDataviz(record: ReportOutputRecord) {
  return attachReportDatavizWithDeps(record, getReportOutputEnrichmentDeps());
}

function buildDraftForRecord(record: ReportOutputRecord): ReportOutputDraft | null {
  return buildDraftForRecordWithDeps(record, {
    buildId,
    normalizeDraftChartType,
    resolveDefaultReportVisualStyle,
    isNarrativeReportKind,
  });
}

async function finalizeReportOutputRecord(record: ReportOutputRecord) {
  return finalizeReportOutputRecordWithDeps(record, getReportOutputEnrichmentDeps());
}

function attachLocalReportAnalysis(record: ReportOutputRecord) {
  return attachLocalReportAnalysisWithDeps(record, {
    isNarrativeReportKind,
  });
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
    planMustHaveModules: Array.isArray(dynamicSource?.planMustHaveModules)
      ? dynamicSource.planMustHaveModules.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    planOptionalModules: Array.isArray(dynamicSource?.planOptionalModules)
      ? dynamicSource.planOptionalModules.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    planEvidencePriority: Array.isArray(dynamicSource?.planEvidencePriority)
      ? dynamicSource.planEvidencePriority.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    planAudienceTone: String(dynamicSource?.planAudienceTone || '').trim(),
    planRiskNotes: Array.isArray(dynamicSource?.planRiskNotes)
      ? dynamicSource.planRiskNotes.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    planVisualMixTargets: Array.isArray(dynamicSource?.planVisualMixTargets)
      ? dynamicSource.planVisualMixTargets
          .map((item) => ({
            moduleType: String(item?.moduleType || '').trim() as ReportPlanVisualMixTarget['moduleType'],
            minCount: Number(item?.minCount || 0),
            targetCount: Number(item?.targetCount || 0),
            maxCount: Number(item?.maxCount || 0),
          }))
          .filter((item) => item.moduleType && Number.isFinite(item.minCount) && Number.isFinite(item.targetCount) && Number.isFinite(item.maxCount))
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

async function buildDynamicPageRecord(
  record: ReportOutputRecord,
  group: ReportGroup | null,
  template: SharedReportTemplate | null,
  documents: Array<Record<string, unknown>>,
) {
  return buildDynamicPageRecordWithDeps(record, group, template, documents, getReportDynamicPageDeps());
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

export type PersistedState = {
  version: number;
  groups: Array<Pick<ReportGroup, 'key' | 'label' | 'description' | 'triggerKeywords' | 'defaultTemplateKey' | 'templates' | 'referenceImages'>>;
  templates: SharedReportTemplate[];
  outputs: ReportOutputRecord[];
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

function getDraftHistoryDeps() {
  return {
    buildId,
    normalizeTextField,
    normalizeVisualStylePreset,
    normalizeStringList,
  };
}

function getReportDraftActionDeps() {
  const stateStoreDeps = getReportCenterStateStoreDeps();
  return {
    loadState: loadReportCenterState,
    buildDraftForRecord,
    normalizeStoredDraft: (value: unknown) => normalizeStoredDraft(value, stateStoreDeps),
    normalizeStoredDraftModule: (value: unknown, fallbackOrder: number) => normalizeStoredDraftModule(value, stateStoreDeps, fallbackOrder),
    withDraftPreviewPage: (record: ReportOutputRecord, draft: ReportOutputDraft | null) => withDraftPreviewPage(record, draft, {
      resolveDefaultReportVisualStyle,
    }),
    saveGroupsAndOutputs,
    hydrateDraftQuality,
    finalizeReportOutputRecord,
    syncReportOutputToKnowledgeLibrarySafely: (record: ReportOutputRecord) =>
      syncReportOutputToKnowledgeLibrarySafelyWithDeps(record, getReportOutputLibrarySyncDeps()),
    appendDraftHistory: (draft: ReportOutputDraft, entry: { action: ReportDraftHistoryAction; label: string; detail?: string }) =>
      appendDraftHistory(draft, entry, getDraftHistoryDeps()),
    buildDraftStructureSummary,
    isOpenClawGatewayConfigured,
    runOpenClawChat,
    isRecord,
  };
}

function getReportTemplateActionDeps() {
  return {
    loadState: loadReportCenterState,
    saveGroupsAndOutputs,
    resolveReportGroup,
    ensureDirs,
    buildId,
    normalizeReportReferenceImage,
    inferReportReferenceSourceType,
    inferReportTemplateTypeFromSource,
    findDuplicateSharedTemplateReference,
    isUserSharedReportTemplate,
    inferTemplatePreferredLayoutVariant,
    normalizePath,
    normalizeReferenceUrl,
    resolveReferenceFilePath: (reference: ReportReferenceImage) => resolveReferenceFilePath(reference, getReportOutputLibrarySyncDeps()),
    deleteStoredReferenceFile: (reference: ReportReferenceImage) => deleteStoredReferenceFileWithDeps(reference, getReportOutputLibrarySyncDeps()),
    reportReferenceDir: REPORT_REFERENCE_DIR,
    storageRoot: STORAGE_ROOT,
  };
}

function getReportOutputActionDeps() {
  return {
    loadState: loadReportCenterState,
    resolveReportGroup,
    resolveTemplateTypeFromKind,
    resolveDefaultReportKind,
    resolveOutputTypeLabel,
    resolveDefaultReportFormat,
    normalizeDynamicSource,
    withDraftPreviewPage: (record: ReportOutputRecord, draft: ReportOutputDraft | null) => withDraftPreviewPage(record, draft, {
      resolveDefaultReportVisualStyle,
    }),
    buildDraftForRecord,
    finalizeReportOutputRecord,
    saveGroupsAndOutputs,
    syncReportOutputToKnowledgeLibrarySafely: (record: ReportOutputRecord) =>
      syncReportOutputToKnowledgeLibrarySafelyWithDeps(record, getReportOutputLibrarySyncDeps()),
    buildId,
  };
}

function getReportOutputRevisionDeps() {
  return {
    loadState: loadReportCenterState,
    resolveTemplateTypeFromKind,
    resolveReportGroup,
    isNarrativeReportKind,
    buildConceptPageEnvelope,
    buildSharedTemplateEnvelope,
    summarizeTableForAnalysis,
    summarizePageForAnalysis,
    runOpenClawChat,
    normalizeReportOutput: (
      kind: NonNullable<ReportOutputRecord['kind']>,
      prompt: string,
      rawContent: string,
      envelope: {
        title: string;
        fixedStructure: string[];
        variableZones: string[];
        outputHint: string;
      },
      _tableColumns?: string[],
      _pageSections?: string[],
      options?: {
        datavizSlots?: unknown[];
        pageSpec?: unknown;
      },
    ) => normalizeReportOutput(kind, prompt, rawContent, envelope, [], [], options as never),
    attachReportDataviz,
    attachReportAnalysis,
    saveGroupsAndOutputs,
  };
}

function getReportDynamicPageDeps() {
  return {
    normalizeDynamicSource,
    buildConceptPageEnvelope,
    buildSharedTemplateEnvelope,
    attachReportDataviz,
    attachLocalReportAnalysis,
  };
}

function getReportOutputEnrichmentDeps() {
  return {
    isOpenClawGatewayConfigured,
    runOpenClawChat,
    isNarrativeReportKind,
    attachDatavizRendersToPage,
  };
}

function getReportOutputLibrarySyncDeps() {
  return {
    defaultScanDir: DEFAULT_SCAN_DIR,
    reportLibraryExportDir: REPORT_LIBRARY_EXPORT_DIR,
    reportReferenceDir: REPORT_REFERENCE_DIR,
    storageRoot: STORAGE_ROOT,
    loadDocumentLibraries,
    loadDocumentCategoryConfig,
    ingestExistingLocalFiles,
  };
}

function getReportCenterStateStoreDeps() {
  return {
    reportStateFile: REPORT_STATE_FILE,
    reportStateVersion: REPORT_STATE_VERSION,
    ensureDirs,
    readRuntimeStateJson,
    writeRuntimeStateJson,
    buildId,
    normalizeTextField,
    normalizeStringList,
    normalizeVisualStylePreset,
    normalizeReportReferenceImage,
    normalizeStoredDatavizSlots,
    normalizeStoredPageSpec,
    normalizeDynamicSource,
    normalizeDraftChartType,
    buildDefaultSharedTemplates,
    inferTemplatePreferredLayoutVariant,
    buildTemplatesForLibrary,
    attachLocalReportAnalysis,
    loadDocumentLibraries,
    loadParsedDocuments,
    buildDynamicPageRecord: (
      record: ReportOutputRecord,
      group: ReportGroup | null,
      template: SharedReportTemplate | null,
      documents: Array<Record<string, unknown>>,
    ) => buildDynamicPageRecordWithDeps(record, group, template, documents, getReportDynamicPageDeps()),
    resolveReportGroup,
    isFormulaLibrary,
    scheduleOpenClawMemoryCatalogSync,
  };
}

export function normalizePersistedReportState(raw: unknown): PersistedState {
  return normalizePersistedReportStateWithDeps(raw, getReportCenterStateStoreDeps());
}

async function readState(): Promise<{ state: PersistedState; migrated: boolean }> {
  return readReportCenterStateWithDeps(getReportCenterStateStoreDeps());
}

async function writeState(state: PersistedState) {
  await writeReportCenterStateWithDeps(state, getReportCenterStateStoreDeps());
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
  return mergeSharedTemplatesWithDeps(storedTemplates, getReportCenterStateStoreDeps());
}

export function buildSharedTemplateEnvelope(template: SharedReportTemplate): ReportTemplateEnvelope {
  return buildSharedTemplateEnvelopeFromHelper(template);
}

export function buildTemplateEnvelope(group: ReportGroup, template: ReportGroupTemplate): ReportTemplateEnvelope {
  return buildTemplateEnvelopeFromHelper(group, template);
}

function buildGroupFromLibrary(label: string, key: string): ReportGroup {
  return buildGroupFromLibraryWithDeps(label, key, getReportCenterStateStoreDeps());
}

function reconcileOutputRecords(outputs: ReportOutputRecord[], groups: ReportGroup[]) {
  return reconcileOutputRecordsWithDeps(outputs, groups, getReportCenterStateStoreDeps());
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
  await saveReportCenterGroupsAndOutputsWithDeps(groups, outputs, templates, getReportCenterStateStoreDeps());
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
  return loadReportCenterStateWithOptionsWithDeps(options, getReportCenterStateStoreDeps());
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
  return createReportOutputWithDeps(input, getReportOutputActionDeps());
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
  return updateReportOutputWithDeps(outputId, patch, getReportOutputActionDeps());
}

export async function deleteReportOutput(outputId: string) {
  return deleteReportOutputWithDeps(outputId, getReportOutputActionDeps());
}

export async function updateReportGroupTemplate(groupKey: string, templateKey: string) {
  return updateReportGroupTemplateWithDeps(groupKey, templateKey, getReportTemplateActionDeps());
}

export async function uploadReportReferenceImage(groupKey: string, file: MultipartFile) {
  return uploadReportReferenceImageWithDeps(groupKey, file, getReportTemplateActionDeps());
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
  return createSharedReportTemplateWithDeps(input, getReportTemplateActionDeps());
}

export async function updateSharedReportTemplate(templateKey: string, patch: {
  label?: string;
  description?: string;
  preferredLayoutVariant?: ReportPlanLayoutVariant;
  isDefault?: boolean;
}) {
  return updateSharedReportTemplateWithDeps(templateKey, patch, getReportTemplateActionDeps());
}

export async function uploadSharedTemplateReference(templateKey: string, file: MultipartFile) {
  return uploadSharedTemplateReferenceWithDeps(templateKey, file, getReportTemplateActionDeps());
}

export async function addSharedTemplateReferenceFileFromPath(templateKey: string, input: {
  filePath: string;
  originalName?: string;
  sourceType?: ReportReferenceSourceType;
  mimeType?: string;
}) {
  return addSharedTemplateReferenceFileFromPathWithDeps(templateKey, input, getReportTemplateActionDeps());
}

export async function addSharedTemplateReferenceLink(templateKey: string, input: {
  url: string;
  label?: string;
}) {
  return addSharedTemplateReferenceLinkWithDeps(templateKey, input, getReportTemplateActionDeps());
}

export async function deleteSharedReportTemplate(templateKey: string) {
  return deleteSharedReportTemplateWithDeps(templateKey, getReportTemplateActionDeps());
}

export async function deleteSharedTemplateReference(templateKey: string, referenceId: string) {
  return deleteSharedTemplateReferenceWithDeps(templateKey, referenceId, getReportTemplateActionDeps());
}

export async function readSharedTemplateReferenceFile(templateKey: string, referenceId: string) {
  return readSharedTemplateReferenceFileWithDeps(templateKey, referenceId, getReportTemplateActionDeps());
}

export async function updateReportOutputDraft(
  outputId: string,
  nextDraftInput: ReportOutputDraft,
  options?: { historyEntry?: { action: ReportDraftHistoryAction; label: string; detail?: string } },
) {
  return updateReportOutputDraftWithDeps(outputId, nextDraftInput, getReportDraftActionDeps(), options);
}

export async function restoreReportOutputDraftHistory(outputId: string, historyId: string) {
  return restoreReportOutputDraftHistoryWithDeps(outputId, historyId, getReportDraftActionDeps());
}

export async function reviseReportOutputDraftModule(outputId: string, moduleId: string, instruction: string) {
  return reviseReportOutputDraftModuleWithDeps(outputId, moduleId, instruction, getReportDraftActionDeps());
}

export async function reviseReportOutputDraftStructure(outputId: string, instruction: string) {
  return reviseReportOutputDraftStructureWithDeps(outputId, instruction, getReportDraftActionDeps());
}

export async function reviseReportOutputDraftCopy(outputId: string, instruction: string) {
  return reviseReportOutputDraftCopyWithDeps(outputId, instruction, getReportDraftActionDeps());
}

export async function finalizeDraftReportOutput(outputId: string) {
  return finalizeDraftReportOutputWithDeps(outputId, getReportDraftActionDeps());
}

export async function reviseReportOutput(outputId: string, instruction: string) {
  return reviseReportOutputWithDeps(outputId, instruction, getReportOutputRevisionDeps());
}
