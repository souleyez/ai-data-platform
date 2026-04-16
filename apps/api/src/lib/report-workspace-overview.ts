import { loadDocumentsOverviewRoutePayload } from './document-route-read-operations.js';
import { loadOperationsOverviewPayload } from './operations-overview.js';
import { loadReportCenterReadState, type ReportVisualStylePreset } from './report-center.js';
import { buildWorkspaceOverviewMetrics } from './report-workspace-overview-metrics.js';
import { buildWorkspaceOverviewDraft } from './report-workspace-overview-modules.js';
import {
  chooseWorkspaceOverviewGroupKey,
  normalizeWorkspaceOverviewVisualStyle,
} from './report-workspace-overview-support.js';

export async function buildWorkspaceOverviewDraftPayload(options?: { groupKey?: string; visualStyle?: ReportVisualStylePreset | string }) {
  const [operations, documentsOverview, reportState] = await Promise.all([
    loadOperationsOverviewPayload(),
    loadDocumentsOverviewRoutePayload(),
    loadReportCenterReadState(),
  ]);

  const libraries = Array.isArray(documentsOverview.libraries) ? documentsOverview.libraries : [];
  const groupKey = chooseWorkspaceOverviewGroupKey(options?.groupKey, libraries);
  if (!groupKey) {
    throw new Error('at least one dataset group is required to build a workspace overview page');
  }

  const visualStyle = normalizeWorkspaceOverviewVisualStyle(options?.visualStyle) || 'signal-board';
  const metrics = buildWorkspaceOverviewMetrics({
    operations,
    libraries,
    outputs: reportState.outputs || [],
  });
  const draft = buildWorkspaceOverviewDraft({
    metrics,
    visualStyle,
  });

  return {
    groupKey,
    title: '项目工作台首页',
    summary: '已基于当前项目真实数据生成工作台首页草稿，可继续模块审改后进入终稿。',
    libraries: libraries.map((item) => ({
      key: String(item?.key || '').trim(),
      label: String(item?.label || '').trim(),
    })).filter((item) => item.key || item.label),
    draft,
  };
}
