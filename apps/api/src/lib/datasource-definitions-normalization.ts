import { computeNextRunAt } from './datasource-schedule.js';
import type {
  DatasourceDefinition,
  DatasourceRun,
  DatasourceTargetLibrary,
} from './datasource-definitions-types.js';

function generateUploadToken() {
  return `upl_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function normalizeTargetLibraries(items: DatasourceTargetLibrary[]) {
  const dedup = new Map<string, DatasourceTargetLibrary>();
  for (const item of items || []) {
    const key = String(item?.key || '').trim();
    const label = String(item?.label || '').trim();
    if (!key || !label) continue;
    dedup.set(key, {
      key,
      label,
      mode: item?.mode === 'secondary' ? 'secondary' : 'primary',
    });
  }
  const values = Array.from(dedup.values());
  if (!values.some((item) => item.mode === 'primary') && values[0]) {
    values[0].mode = 'primary';
  }
  return values;
}

export function normalizeDefinition(item: Partial<DatasourceDefinition>): DatasourceDefinition {
  const now = new Date().toISOString();
  const kind = item.kind || 'web_public';
  const status = item.status || 'draft';
  const authMode = kind === 'local_directory' ? 'none' : (item.authMode || 'none');
  const targetLibraries = normalizeTargetLibraries(item.targetLibraries || []);

  return {
    id: String(item.id || '').trim(),
    name: String(item.name || '').trim(),
    kind,
    status,
    targetLibraries,
    schedule: {
      kind: item.schedule?.kind || 'manual',
      timezone: item.schedule?.timezone || '',
      maxItemsPerRun: Number(item.schedule?.maxItemsPerRun || 0) || undefined,
    },
    authMode,
    credentialRef: kind === 'local_directory'
      ? null
      : item.credentialRef ? {
          id: String(item.credentialRef.id || '').trim(),
          kind: item.credentialRef.kind || authMode,
          label: String(item.credentialRef.label || '').trim(),
          origin: String(item.credentialRef.origin || '').trim(),
          updatedAt: item.credentialRef.updatedAt || '',
        } : null,
    config: item.config && typeof item.config === 'object'
      ? {
          ...item.config,
          ...(kind === 'upload_public'
            ? {
                uploadToken: String((item.config as Record<string, unknown>)?.uploadToken || '').trim() || generateUploadToken(),
              }
            : {}),
        }
      : (kind === 'upload_public' ? { uploadToken: generateUploadToken() } : {}),
    notes: String(item.notes || '').trim(),
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || now,
    lastRunAt: item.lastRunAt || '',
    nextRunAt: item.nextRunAt || computeNextRunAt(item.schedule?.kind || 'manual', status),
    lastStatus: item.lastStatus || undefined,
    lastSummary: item.lastSummary || '',
  };
}

export function normalizeRun(item: Partial<DatasourceRun>): DatasourceRun {
  return {
    id: String(item.id || '').trim(),
    datasourceId: String(item.datasourceId || '').trim(),
    startedAt: String(item.startedAt || '').trim(),
    finishedAt: item.finishedAt || '',
    status: item.status || 'running',
    discoveredCount: Number(item.discoveredCount || 0),
    capturedCount: Number(item.capturedCount || 0),
    ingestedCount: Number(item.ingestedCount || 0),
    skippedCount: Number(item.skippedCount || 0),
    unsupportedCount: Number(item.unsupportedCount || 0),
    failedCount: Number(item.failedCount || 0),
    groupedCount: Number(item.groupedCount || 0),
    ungroupedCount: Number(item.ungroupedCount || 0),
    documentIds: Array.isArray(item.documentIds) ? item.documentIds.map((value) => String(value || '').trim()).filter(Boolean) : [],
    libraryKeys: Array.isArray(item.libraryKeys) ? item.libraryKeys.map((value) => String(value || '').trim()).filter(Boolean) : [],
    resultSummaries: Array.isArray(item.resultSummaries)
      ? item.resultSummaries
          .map((entry) => ({
            id: String(entry?.id || '').trim(),
            label: String(entry?.label || '').trim(),
            summary: String(entry?.summary || '').trim(),
          }))
          .filter((entry) => entry.id && entry.label)
      : [],
    summary: item.summary || '',
    errorMessage: item.errorMessage || '',
  };
}

export function sortRunsByLatestTimestamp(items: DatasourceRun[]) {
  return [...items].sort((a, b) =>
    String(b.finishedAt || b.startedAt || '').localeCompare(String(a.finishedAt || a.startedAt || '')),
  );
}
