import { loadDocumentCategoryConfig } from './document-config.js';
import { loadDocumentLibraries } from './document-libraries.js';
import { ingestExistingLocalFiles } from './document-upload-ingest.js';
import { DEFAULT_SCAN_DIR, loadParsedDocuments } from './document-store.js';
import { normalizeReportOutput } from './knowledge-output.js';
import { isOpenClawGatewayConfigured, runOpenClawChat } from './openclaw-adapter.js';
import { scheduleOpenClawMemoryCatalogSync } from './openclaw-memory-sync.js';
import { STORAGE_ROOT } from './paths.js';
import { attachDatavizRendersToPage } from './report-dataviz.js';
import {
  buildReportCenterId,
  ensureReportCenterDirs,
  isReportCenterRecord,
  normalizeReportCenterStringList,
  normalizeReportCenterTextField,
  REPORT_LIBRARY_EXPORT_DIR,
  REPORT_REFERENCE_DIR,
  REPORT_STATE_FILE,
  REPORT_STATE_VERSION,
} from './report-center-config.js';
import {
  findDuplicateSharedTemplateReference,
  inferReportReferenceSourceType,
  inferReportTemplateTypeFromSource,
  isUserSharedReportTemplate,
  normalizeDynamicSource,
  normalizeReferenceUrl,
  normalizeReportReferenceImage,
  normalizeStoredDatavizSlots,
  normalizeStoredPageSpec,
  normalizeVisualStylePreset,
  resolveDefaultReportVisualStyle,
} from './report-center-normalization.js';
import type {
  ReportDraftHistoryAction,
  ReportDynamicSource,
  ReportGroup,
  ReportOutputDraft,
  ReportOutputRecord,
  ReportReferenceImage,
  SharedReportTemplate,
} from './report-center-types.js';
import {
  buildConceptPageEnvelope,
  buildDefaultSharedTemplates,
  buildSharedTemplateEnvelope,
  buildTemplatesForLibrary,
  isFormulaLibrary,
  isNarrativeReportKind,
  resolveDefaultReportFormat,
  resolveDefaultReportKind,
  resolveOutputTypeLabel,
  resolveReportGroup,
  resolveTemplateTypeFromKind,
} from './report-center-support.js';
import { buildDraftForRecordWithDeps } from './report-draft-builder.js';
import { appendDraftHistory, buildDraftStructureSummary } from './report-draft-history.js';
import { hydrateDraftQuality } from './report-draft-quality.js';
import { normalizeDraftChartType } from './report-draft-policy.js';
import { withDraftPreviewPage } from './report-draft-preview.js';
import { buildDynamicPageRecordWithDeps } from './report-dynamic-pages.js';
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
import { inferTemplatePreferredLayoutVariant } from './report-template-envelopes.js';
import {
  loadReportCenterStateWithOptionsWithDeps,
  normalizeStoredDraft,
  normalizeStoredDraftModule,
} from './report-center-state-store.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';

export type SaveGroupsAndOutputs = (
  groups: ReportGroup[],
  outputs: ReportOutputRecord[],
  templates?: SharedReportTemplate[],
) => Promise<void>;

async function attachReportAnalysis(record: ReportOutputRecord) {
  return attachReportAnalysisWithDeps(record, getReportOutputEnrichmentDeps());
}

async function attachReportDataviz(record: ReportOutputRecord) {
  return attachReportDatavizWithDeps(record, getReportOutputEnrichmentDeps());
}

function buildDraftForRecord(record: ReportOutputRecord): ReportOutputDraft | null {
  return buildDraftForRecordWithDeps(record, {
    buildId: buildReportCenterId,
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

async function buildDynamicPageRecord(
  record: ReportOutputRecord,
  group: ReportGroup | null,
  template: SharedReportTemplate | null,
  documents: Array<Record<string, unknown>>,
) {
  return buildDynamicPageRecordWithDeps(record, group, template, documents, getReportDynamicPageDeps());
}

function getDraftHistoryDeps() {
  return {
    buildId: buildReportCenterId,
    normalizeTextField: normalizeReportCenterTextField,
    normalizeVisualStylePreset,
    normalizeStringList: normalizeReportCenterStringList,
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

function getReportDynamicPageDeps() {
  return {
    normalizeDynamicSource,
    buildConceptPageEnvelope,
    buildSharedTemplateEnvelope,
    attachReportDataviz,
    attachLocalReportAnalysis,
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

export function getReportCenterStateStoreDeps() {
  return {
    reportStateFile: REPORT_STATE_FILE,
    reportStateVersion: REPORT_STATE_VERSION,
    ensureDirs: ensureReportCenterDirs,
    readRuntimeStateJson,
    writeRuntimeStateJson,
    buildId: buildReportCenterId,
    normalizeTextField: normalizeReportCenterTextField,
    normalizeStringList: normalizeReportCenterStringList,
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

export function createReportDraftActionDeps<TState>(
  loadState: () => Promise<TState>,
  saveGroupsAndOutputs: SaveGroupsAndOutputs,
) {
  const stateStoreDeps = getReportCenterStateStoreDeps();
  return {
    loadState,
    buildDraftForRecord,
    normalizeStoredDraft: (value: unknown) => normalizeStoredDraft(value, stateStoreDeps),
    normalizeStoredDraftModule: (value: unknown, fallbackOrder: number) => normalizeStoredDraftModule(value, stateStoreDeps, fallbackOrder),
    withDraftPreviewPage: (record: ReportOutputRecord, draft: ReportOutputDraft | null) =>
      withDraftPreviewPage(record, draft, {
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
    isRecord: isReportCenterRecord,
  };
}

export function createReportTemplateActionDeps<TState>(
  loadState: () => Promise<TState>,
  saveGroupsAndOutputs: SaveGroupsAndOutputs,
) {
  return {
    loadState,
    saveGroupsAndOutputs,
    resolveReportGroup,
    ensureDirs: ensureReportCenterDirs,
    buildId: buildReportCenterId,
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

export function createReportOutputActionDeps<TState>(
  loadState: () => Promise<TState>,
  saveGroupsAndOutputs: SaveGroupsAndOutputs,
) {
  return {
    loadState,
    resolveReportGroup,
    resolveTemplateTypeFromKind,
    resolveDefaultReportKind,
    resolveOutputTypeLabel,
    resolveDefaultReportFormat,
    normalizeDynamicSource,
    withDraftPreviewPage: (record: ReportOutputRecord, draft: ReportOutputDraft | null) =>
      withDraftPreviewPage(record, draft, {
        resolveDefaultReportVisualStyle,
      }),
    buildDraftForRecord,
    finalizeReportOutputRecord,
    saveGroupsAndOutputs,
    syncReportOutputToKnowledgeLibrarySafely: (record: ReportOutputRecord) =>
      syncReportOutputToKnowledgeLibrarySafelyWithDeps(record, getReportOutputLibrarySyncDeps()),
    buildId: buildReportCenterId,
  };
}

export function createReportOutputRevisionDeps<TState>(
  loadState: () => Promise<TState>,
  saveGroupsAndOutputs: SaveGroupsAndOutputs,
) {
  return {
    loadState,
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

export function loadReportCenterStateWithDeps(options?: {
  refreshDynamicPages?: boolean;
  persistFixups?: boolean;
}) {
  return loadReportCenterStateWithOptionsWithDeps(options, getReportCenterStateStoreDeps());
}
