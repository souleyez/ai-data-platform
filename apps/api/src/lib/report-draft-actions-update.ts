import type {
  ReportOutputDraft,
  ReportOutputRecord,
} from './report-center.js';
import type {
  DraftHistoryEntryInput,
  ReportDraftActionDeps,
} from './report-draft-action-support.js';
import { findReportOutputOrThrow } from './report-draft-action-support.js';

export async function updateReportOutputDraftWithDeps(
  outputId: string,
  nextDraftInput: ReportOutputDraft,
  deps: ReportDraftActionDeps,
  options?: { historyEntry?: DraftHistoryEntryInput },
) {
  const state = await deps.loadState();
  const record = findReportOutputOrThrow(state.outputs, outputId);
  if (record.kind !== 'page') throw new Error('draft editing only supports static pages');

  const currentDraft = record.draft || deps.buildDraftForRecord(record);
  if (!currentDraft) throw new Error('draft is not available for this output');
  const reviewStatus = nextDraftInput?.reviewStatus === 'approved' ? 'approved' : 'draft_reviewing';

  const historyEntry = options?.historyEntry || {
    action: 'saved' as const,
    label: '保存草稿',
    detail: `当前共 ${Array.isArray(nextDraftInput?.modules) ? nextDraftInput.modules.length : currentDraft.modules.length} 个模块。`,
  };

  const baseDraft = deps.normalizeStoredDraft({
    ...nextDraftInput,
    version: Math.max(currentDraft.version + 1, Number(nextDraftInput?.version || 0) || 0, 1),
    reviewStatus,
    history: Array.isArray(nextDraftInput?.history) ? nextDraftInput.history : currentDraft.history || [],
    lastEditedAt: new Date().toISOString(),
    approvedAt: reviewStatus === 'approved' ? (nextDraftInput?.approvedAt || new Date().toISOString()) : '',
  });
  if (!baseDraft) throw new Error('draft payload is invalid');

  const history = historyEntry
    ? deps.appendDraftHistory(baseDraft, historyEntry)
    : (Array.isArray(nextDraftInput?.history) ? nextDraftInput.history : currentDraft.history || []);

  const normalizedDraft = deps.normalizeStoredDraft({
    ...baseDraft,
    history,
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
  const nextRecord = deps.withDraftPreviewPage(nextRecordBase, normalizedDraft);
  const nextOutputs = state.outputs.map((item) => (item.id === outputId ? nextRecord : item));
  await deps.saveGroupsAndOutputs(state.groups, nextOutputs, state.templates);
  return nextRecord;
}

export async function restoreReportOutputDraftHistoryWithDeps(
  outputId: string,
  historyId: string,
  deps: ReportDraftActionDeps,
) {
  const state = await deps.loadState();
  const record = findReportOutputOrThrow(state.outputs, outputId);
  if (record.kind !== 'page') throw new Error('draft restore only supports static pages');

  const currentDraft = record.draft || deps.buildDraftForRecord(record);
  if (!currentDraft) throw new Error('draft is not available for this output');
  const historyEntry = (currentDraft.history || []).find((entry) => entry.id === historyId);
  if (!historyEntry) throw new Error('draft history entry not found');
  if (!historyEntry.snapshot) throw new Error('draft history entry cannot be restored');

  const nextDraft = deps.normalizeStoredDraft({
    ...historyEntry.snapshot,
    reviewStatus: 'draft_reviewing',
    version: Math.max(currentDraft.version + 1, Number(historyEntry.snapshot.version || 0) || 0, 1),
    approvedAt: '',
    lastEditedAt: new Date().toISOString(),
    history: currentDraft.history || [],
  });
  if (!nextDraft) throw new Error('draft history snapshot is invalid');

  return updateReportOutputDraftWithDeps(outputId, nextDraft, deps, {
    historyEntry: {
      action: 'restored',
      label: '恢复草稿版本',
      detail: `已恢复到 ${historyEntry.label || '历史版本'}（${historyEntry.createdAt}）。`,
    },
  });
}
