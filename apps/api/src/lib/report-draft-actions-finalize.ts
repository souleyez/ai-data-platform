import type { ReportOutputDraft } from './report-center.js';
import type { ReportDraftActionDeps } from './report-draft-action-support.js';
import { findReportOutputOrThrow } from './report-draft-action-support.js';

export async function finalizeDraftReportOutputWithDeps(
  outputId: string,
  deps: ReportDraftActionDeps,
) {
  const state = await deps.loadState();
  const record = findReportOutputOrThrow(state.outputs, outputId);
  if (record.kind !== 'page') throw new Error('draft finalize only supports static pages');

  const draft = record.draft || deps.buildDraftForRecord(record);
  if (!draft) throw new Error('draft is not available for this output');

  const validatedDraft = deps.hydrateDraftQuality(draft);
  if (validatedDraft.readiness === 'blocked') {
    const blockingIssues = (validatedDraft.qualityChecklist || [])
      .filter((item) => item.blocking && item.status === 'fail')
      .map((item) => item.detail || item.label)
      .filter(Boolean);
    throw new Error(blockingIssues.length
      ? `draft is not ready to finalize: ${blockingIssues.join('；')}`
      : 'draft is not ready to finalize');
  }

  const approvedDraft: ReportOutputDraft = deps.hydrateDraftQuality({
    ...validatedDraft,
    reviewStatus: 'approved',
    version: draft.version + 1,
    history: deps.appendDraftHistory(validatedDraft, {
      action: 'finalized',
      label: '确认终稿生成',
      detail: `终稿基于 ${validatedDraft.modules.length} 个模块生成。`,
    }),
    approvedAt: new Date().toISOString(),
    lastEditedAt: new Date().toISOString(),
  });
  const baseRecord = deps.withDraftPreviewPage({
    ...record,
    status: 'ready',
    summary: '静态页草稿已确认，并已生成终稿。',
    draft: approvedDraft,
    dynamicSource: record.dynamicSource
      ? { ...record.dynamicSource, lastRenderedAt: new Date().toISOString() }
      : record.dynamicSource,
  }, approvedDraft);
  const finalized = await deps.finalizeReportOutputRecord(baseRecord);
  const nextOutputs = state.outputs.map((item) => (item.id === outputId ? finalized : item));
  await deps.saveGroupsAndOutputs(state.groups, nextOutputs, state.templates);
  await deps.syncReportOutputToKnowledgeLibrarySafely(finalized);
  return finalized;
}
