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
import type {
  PersistedState,
  ReportDraftHistoryAction,
  ReportDynamicSource,
  ReportGroup,
  ReportOutputDraft,
  ReportOutputRecord,
  ReportOutputStatus,
  ReportReferenceImage,
  ReportReferenceSourceType,
  ReportTemplateType,
  ReportVisualStylePreset,
  SharedReportTemplate,
} from './report-center-types.js';
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
import { normalizeDraftChartType } from './report-draft-policy.js';
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
import {
  inferTemplatePreferredLayoutVariant,
} from './report-template-envelopes.js';
import {
  buildConceptPageEnvelope,
  buildDefaultSharedTemplates,
  buildSharedTemplateEnvelope,
  buildTemplateEnvelope,
  buildTemplatesForLibrary,
  isBidLibrary,
  isFormulaLibrary,
  isIotLibrary,
  isNarrativeReportKind,
  isOrderLibrary,
  isPaperLibrary,
  isResumeLibrary,
  normalizeReportGroupToken,
  resolveDefaultReportFormat,
  resolveDefaultReportKind,
  resolveOutputTypeLabel,
  resolveReportGroup,
  resolveTemplateTypeFromKind,
} from './report-center-support.js';
import { isOpenClawGatewayConfigured, runOpenClawChat } from './openclaw-adapter.js';
import { scheduleOpenClawMemoryCatalogSync } from './openclaw-memory-sync.js';
import { STORAGE_CONFIG_DIR, STORAGE_FILES_DIR, STORAGE_ROOT } from './paths.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';

const REPORT_CONFIG_DIR = STORAGE_CONFIG_DIR;
const REPORT_REFERENCE_DIR = path.join(STORAGE_FILES_DIR, 'report-references');
const REPORT_LIBRARY_EXPORT_DIR = path.join(STORAGE_FILES_DIR, 'generated-report-library');
const REPORT_STATE_FILE = path.join(REPORT_CONFIG_DIR, 'report-center.json');

export type {
  PersistedState,
  ReportDraftChecklistItem,
  ReportDraftChecklistStatus,
  ReportDraftEvidenceCoverage,
  ReportDraftHistoryAction,
  ReportDraftHistoryEntry,
  ReportDraftHistorySnapshot,
  ReportDraftModule,
  ReportDraftModuleStatus,
  ReportDraftModuleType,
  ReportDraftReadiness,
  ReportDraftReviewStatus,
  ReportDynamicSource,
  ReportGroup,
  ReportGroupTemplate,
  ReportOutputDraft,
  ReportOutputRecord,
  ReportOutputStatus,
  ReportReferenceImage,
  ReportReferenceSourceType,
  ReportTemplateEnvelope,
  ReportTemplateType,
  ReportVisualStylePreset,
  SharedReportTemplate,
} from './report-center-types.js';

export {
  buildSharedTemplateEnvelope,
  buildTemplateEnvelope,
  resolveReportGroup,
};

export {
  findDuplicateSharedTemplateReference,
  inferReportReferenceSourceType,
  inferReportTemplateTypeFromSource,
  isUserSharedReportTemplate,
  normalizeReferenceUrl,
  normalizeVisualStylePreset,
  resolveDefaultReportVisualStyle,
};

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


async function buildDynamicPageRecord(
  record: ReportOutputRecord,
  group: ReportGroup | null,
  template: SharedReportTemplate | null,
  documents: Array<Record<string, unknown>>,
) {
  return buildDynamicPageRecordWithDeps(record, group, template, documents, getReportDynamicPageDeps());
}

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

function mergeSharedTemplates(storedTemplates: SharedReportTemplate[] | undefined) {
  return mergeSharedTemplatesWithDeps(storedTemplates, getReportCenterStateStoreDeps());
}

function buildGroupFromLibrary(label: string, key: string): ReportGroup {
  return buildGroupFromLibraryWithDeps(label, key, getReportCenterStateStoreDeps());
}

function reconcileOutputRecords(outputs: ReportOutputRecord[], groups: ReportGroup[]) {
  return reconcileOutputRecordsWithDeps(outputs, groups, getReportCenterStateStoreDeps());
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
