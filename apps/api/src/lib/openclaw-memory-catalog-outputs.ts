import type { ReportOutputRecord } from './report-center.js';
import type { OpenClawMemoryReportOutputSnapshot } from './openclaw-memory-catalog-types.js';

function sanitizeText(value: unknown, maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...` : text;
}

function sanitizeList(values: unknown[], maxLength = 80, limit = 6) {
  return [...new Set(values.map((item) => sanitizeText(item, maxLength)).filter(Boolean))].slice(0, limit);
}

function resolveReportOutputUpdatedAt(item: ReportOutputRecord) {
  const candidates = [
    item.dynamicSource?.lastRenderedAt,
    item.dynamicSource?.updatedAt,
    item.dynamicSource?.lastRenderedAt,
    item.createdAt,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  const latest = candidates.length ? Math.max(...candidates) : 0;
  return latest > 0 ? new Date(latest).toISOString() : '';
}

export function buildReportOutputMemorySnapshots(outputs: ReportOutputRecord[]): OpenClawMemoryReportOutputSnapshot[] {
  return [...(outputs || [])]
    .filter((item) => String(item.status || '').trim() === 'ready')
    .sort((left, right) => Date.parse(String(right.createdAt || '')) - Date.parse(String(left.createdAt || '')))
    .slice(0, 40)
    .map((item) => ({
      id: sanitizeText(item.id, 80),
      title: sanitizeText(item.title, 120),
      kind: sanitizeText(item.kind || item.outputType, 32) || 'page',
      templateLabel: sanitizeText(item.templateLabel, 80),
      summary: sanitizeText(item.summary || item.content || item.page?.summary || '', 220),
      libraryKeys: sanitizeList((item.libraries || []).map((entry) => entry.key), 80, 8),
      libraryLabels: sanitizeList((item.libraries || []).map((entry) => entry.label || entry.key), 60, 6),
      triggerSource: item.triggerSource === 'report-center' ? 'report-center' : 'chat',
      createdAt: String(item.createdAt || '').trim(),
      updatedAt: resolveReportOutputUpdatedAt(item),
      reusable: Boolean(item.kind === 'page' || item.kind === 'table' || item.kind === 'pdf'),
    }));
}
