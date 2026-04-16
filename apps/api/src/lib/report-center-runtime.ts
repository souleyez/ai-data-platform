import type { MultipartFile } from '@fastify/multipart';
import { REPORT_STATE_VERSION } from './report-center-config.js';
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
  SharedReportTemplate,
} from './report-center-types.js';
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
  createReportOutputWithDeps,
  deleteReportOutputWithDeps,
  updateReportOutputWithDeps,
} from './report-output-actions.js';
import { reviseReportOutputWithDeps } from './report-output-revision.js';
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
  createReportDraftActionDeps,
  createReportOutputActionDeps,
  createReportOutputRevisionDeps,
  createReportTemplateActionDeps,
  getReportCenterStateStoreDeps,
  loadReportCenterStateWithDeps,
  type SaveGroupsAndOutputs,
} from './report-center-deps.js';
import {
  normalizePersistedReportStateWithDeps,
  saveReportCenterGroupsAndOutputsWithDeps,
} from './report-center-state-store.js';
import type { ReportPlanLayoutVariant } from './report-planner.js';

export function normalizePersistedReportState(raw: unknown): PersistedState {
  return normalizePersistedReportStateWithDeps(raw, getReportCenterStateStoreDeps());
}

const saveGroupsAndOutputs: SaveGroupsAndOutputs = async (groups, outputs, templates) => {
  await saveReportCenterGroupsAndOutputsWithDeps(groups, outputs, templates, getReportCenterStateStoreDeps());
};

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
  return loadReportCenterStateWithDeps(options);
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
  return createReportOutputWithDeps(input, createReportOutputActionDeps(loadReportCenterState, saveGroupsAndOutputs));
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
  return updateReportOutputWithDeps(outputId, patch, createReportOutputActionDeps(loadReportCenterState, saveGroupsAndOutputs));
}

export async function deleteReportOutput(outputId: string) {
  return deleteReportOutputWithDeps(outputId, createReportOutputActionDeps(loadReportCenterState, saveGroupsAndOutputs));
}

export async function updateReportGroupTemplate(groupKey: string, templateKey: string) {
  return updateReportGroupTemplateWithDeps(groupKey, templateKey, createReportTemplateActionDeps(loadReportCenterState, saveGroupsAndOutputs));
}

export async function uploadReportReferenceImage(groupKey: string, file: MultipartFile) {
  return uploadReportReferenceImageWithDeps(groupKey, file, createReportTemplateActionDeps(loadReportCenterState, saveGroupsAndOutputs));
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
  return createSharedReportTemplateWithDeps(input, createReportTemplateActionDeps(loadReportCenterState, saveGroupsAndOutputs));
}

export async function updateSharedReportTemplate(templateKey: string, patch: {
  label?: string;
  description?: string;
  preferredLayoutVariant?: ReportPlanLayoutVariant;
  isDefault?: boolean;
}) {
  return updateSharedReportTemplateWithDeps(templateKey, patch, createReportTemplateActionDeps(loadReportCenterState, saveGroupsAndOutputs));
}

export async function uploadSharedTemplateReference(templateKey: string, file: MultipartFile) {
  return uploadSharedTemplateReferenceWithDeps(templateKey, file, createReportTemplateActionDeps(loadReportCenterState, saveGroupsAndOutputs));
}

export async function addSharedTemplateReferenceFileFromPath(templateKey: string, input: {
  filePath: string;
  originalName?: string;
  sourceType?: ReportReferenceSourceType;
  mimeType?: string;
}) {
  return addSharedTemplateReferenceFileFromPathWithDeps(templateKey, input, createReportTemplateActionDeps(loadReportCenterState, saveGroupsAndOutputs));
}

export async function addSharedTemplateReferenceLink(templateKey: string, input: {
  url: string;
  label?: string;
}) {
  return addSharedTemplateReferenceLinkWithDeps(templateKey, input, createReportTemplateActionDeps(loadReportCenterState, saveGroupsAndOutputs));
}

export async function deleteSharedReportTemplate(templateKey: string) {
  return deleteSharedReportTemplateWithDeps(templateKey, createReportTemplateActionDeps(loadReportCenterState, saveGroupsAndOutputs));
}

export async function deleteSharedTemplateReference(templateKey: string, referenceId: string) {
  return deleteSharedTemplateReferenceWithDeps(templateKey, referenceId, createReportTemplateActionDeps(loadReportCenterState, saveGroupsAndOutputs));
}

export async function readSharedTemplateReferenceFile(templateKey: string, referenceId: string) {
  return readSharedTemplateReferenceFileWithDeps(templateKey, referenceId, createReportTemplateActionDeps(loadReportCenterState, saveGroupsAndOutputs));
}

export async function updateReportOutputDraft(
  outputId: string,
  nextDraftInput: ReportOutputDraft,
  options?: { historyEntry?: { action: ReportDraftHistoryAction; label: string; detail?: string } },
) {
  return updateReportOutputDraftWithDeps(outputId, nextDraftInput, createReportDraftActionDeps(loadReportCenterState, saveGroupsAndOutputs), options);
}

export async function restoreReportOutputDraftHistory(outputId: string, historyId: string) {
  return restoreReportOutputDraftHistoryWithDeps(outputId, historyId, createReportDraftActionDeps(loadReportCenterState, saveGroupsAndOutputs));
}

export async function reviseReportOutputDraftModule(outputId: string, moduleId: string, instruction: string) {
  return reviseReportOutputDraftModuleWithDeps(outputId, moduleId, instruction, createReportDraftActionDeps(loadReportCenterState, saveGroupsAndOutputs));
}

export async function reviseReportOutputDraftStructure(outputId: string, instruction: string) {
  return reviseReportOutputDraftStructureWithDeps(outputId, instruction, createReportDraftActionDeps(loadReportCenterState, saveGroupsAndOutputs));
}

export async function reviseReportOutputDraftCopy(outputId: string, instruction: string) {
  return reviseReportOutputDraftCopyWithDeps(outputId, instruction, createReportDraftActionDeps(loadReportCenterState, saveGroupsAndOutputs));
}

export async function finalizeDraftReportOutput(outputId: string) {
  return finalizeDraftReportOutputWithDeps(outputId, createReportDraftActionDeps(loadReportCenterState, saveGroupsAndOutputs));
}

export async function reviseReportOutput(outputId: string, instruction: string) {
  return reviseReportOutputWithDeps(outputId, instruction, createReportOutputRevisionDeps(loadReportCenterState, saveGroupsAndOutputs));
}
