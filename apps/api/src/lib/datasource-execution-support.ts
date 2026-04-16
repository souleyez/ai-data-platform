import {
  appendDatasourceRun,
  type DatasourceDefinition,
  type DatasourceRun,
} from './datasource-definitions.js';
import {
  listWebCaptureTasks,
  updateWebCaptureTaskStatus,
  upsertWebCaptureTask,
  type WebCaptureCrawlMode,
} from './web-capture.js';

export function buildSyntheticRun(
  definition: DatasourceDefinition,
  status: DatasourceRun['status'],
  summary: string,
  errorMessage = '',
) {
  const startedAt = new Date().toISOString();
  return {
    id: `run-${definition.id}-${Date.now()}`,
    datasourceId: definition.id,
    startedAt,
    finishedAt: startedAt,
    status,
    discoveredCount: 0,
    capturedCount: 0,
    ingestedCount: 0,
    skippedCount: 0,
    unsupportedCount: 0,
    failedCount: 0,
    groupedCount: 0,
    ungroupedCount: 0,
    documentIds: [],
    libraryKeys: definition.targetLibraries.map((item) => item.key),
    summary,
    errorMessage,
  } satisfies Partial<DatasourceRun>;
}

export function getDefinitionUrl(definition: DatasourceDefinition) {
  return String(definition.config?.url || '').trim();
}

export function getDefinitionCrawlMode(definition: DatasourceDefinition): WebCaptureCrawlMode {
  const configured = String(definition.config?.crawlMode || '').trim().toLowerCase();
  if (configured === 'listing-detail') return 'listing-detail';
  return definition.kind === 'web_discovery' ? 'listing-detail' : 'single-page';
}

export function buildWebCaptureRunSummary(baseSummary: string, metrics?: {
  total?: number;
  successCount?: number;
  failedCount?: number;
  groupedCount?: number;
  unsupportedCount?: number;
  parseFailedCount?: number;
  invalidCount?: number;
}) {
  const fragments = [
    Number(metrics?.total || 0) > 0 ? `入库 ${Number(metrics?.successCount || 0)}/${Number(metrics?.total || 0)}` : '',
    Number(metrics?.groupedCount || 0) > 0 ? `自动分组 ${Number(metrics?.groupedCount || 0)}` : '',
    Number(metrics?.unsupportedCount || 0) > 0 ? `不支持 ${Number(metrics?.unsupportedCount || 0)}` : '',
    Number(metrics?.parseFailedCount || 0) > 0 ? `解析失败 ${Number(metrics?.parseFailedCount || 0)}` : '',
    Number(metrics?.invalidCount || 0) > 0 ? `无效路径 ${Number(metrics?.invalidCount || 0)}` : '',
  ].filter(Boolean);

  return [String(baseSummary || '').trim(), fragments.join(' | ')].filter(Boolean).join(' ');
}

export async function findLinkedWebTask(definition: DatasourceDefinition) {
  const url = getDefinitionUrl(definition);
  if (!url) return null;
  const tasks = await listWebCaptureTasks();
  return tasks.find((item) => item.url === url) || null;
}

export async function ensureWebTaskFromDefinition(definition: DatasourceDefinition) {
  const url = getDefinitionUrl(definition);
  if (!url) {
    throw new Error('web datasource url is required');
  }

  const existing = await findLinkedWebTask(definition);
  return upsertWebCaptureTask({
    id: existing?.id,
    url,
    focus: String(definition.config?.focus || '').trim(),
    keywords: Array.isArray(definition.config?.keywords) ? definition.config.keywords as string[] : [],
    siteHints: Array.isArray(definition.config?.siteHints) ? definition.config.siteHints as string[] : [],
    seedUrls: Array.isArray(definition.config?.seedUrls) ? definition.config.seedUrls as string[] : [url],
    crawlMode: getDefinitionCrawlMode(definition),
    frequency: definition.schedule.kind,
    note: definition.notes || '',
    maxItems: Number(definition.schedule.maxItemsPerRun || definition.config?.maxItems || 5),
    credentialRef: definition.credentialRef?.id || '',
    credentialLabel: definition.credentialRef?.label || '',
    loginMode: definition.authMode === 'credential' ? 'credential' : 'none',
    captureStatus: definition.status === 'paused' ? 'paused' : 'active',
    keepOriginalFiles: Boolean(definition.config?.keepOriginalFiles),
  });
}

export async function activateDatasourceWebTask(definition: DatasourceDefinition) {
  const task = await ensureWebTaskFromDefinition({ ...definition, status: 'active' });
  if (task.captureStatus !== 'active') {
    await updateWebCaptureTaskStatus(task.id, 'active');
  }
}

export async function appendFailedRunForDefinition(
  definition: DatasourceDefinition,
  message: string,
) {
  return appendDatasourceRun({
    ...buildSyntheticRun(definition, 'failed', message, message),
    summary: message,
    errorMessage: message,
  });
}
