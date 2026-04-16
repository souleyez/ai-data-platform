import type { ReportDynamicSource } from './report-center.js';

export function buildDynamicDocumentTimestamp(item: {
  detailParsedAt?: string;
  cloudStructuredAt?: string;
  retainedAt?: string;
  groupConfirmedAt?: string;
  categoryConfirmedAt?: string;
}) {
  const timestamps = [item.detailParsedAt, item.cloudStructuredAt, item.retainedAt, item.groupConfirmedAt, item.categoryConfirmedAt]
    .map((value) => {
      const date = value ? new Date(value) : null;
      return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
    })
    .filter(Boolean);
  return timestamps.length ? Math.max(...timestamps) : 0;
}

export function matchesDynamicLibraries(
  item: { groups?: string[]; confirmedGroups?: string[]; suggestedGroups?: string[] },
  libraries: Array<{ key?: string; label?: string }>,
) {
  const names = new Set(
    libraries
      .flatMap((entry) => [entry.key, entry.label])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  );
  if (!names.size) return false;

  const documentGroups = [
    ...(Array.isArray(item.groups) ? item.groups : []),
    ...(Array.isArray(item.confirmedGroups) ? item.confirmedGroups : []),
    ...(Array.isArray(item.suggestedGroups) ? item.suggestedGroups : []),
  ];

  return documentGroups.some((group) => names.has(String(group || '').trim()));
}

export function matchesDynamicTimeRange(
  item: { detailParsedAt?: string; cloudStructuredAt?: string; retainedAt?: string; groupConfirmedAt?: string; categoryConfirmedAt?: string },
  timeRange?: string,
) {
  const text = String(timeRange || '').trim();
  if (!text || /(全部|所有|不限|all)/i.test(text)) return true;

  const timestamp = buildDynamicDocumentTimestamp(item);
  if (!timestamp) return true;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  if (/(今天|今日|today)/i.test(text)) return now - timestamp <= dayMs;
  if (/(本周|这周|近一周|最近一周|week)/i.test(text)) return now - timestamp <= dayMs * 7;
  if (/(本月|这个月|近一个月|最近一个月|month)/i.test(text)) return now - timestamp <= dayMs * 31;
  if (/(最近|最新|recent)/i.test(text)) return now - timestamp <= dayMs * 14;
  return true;
}

export function countDynamicTopValues(values: string[]) {
  const counter = new Map<string, number>();
  for (const value of values) {
    const key = String(value || '').trim();
    if (!key) continue;
    counter.set(key, (counter.get(key) || 0) + 1);
  }
  return [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
}

export function summarizeDynamicDocuments(documents: Array<{ title?: string; name?: string; summary?: string }>, limit = 3) {
  return documents
    .slice(0, limit)
    .map((item) => {
      const title = String(item.title || item.name || '').trim() || '未命名文档';
      const summary = String(item.summary || '').trim();
      return summary ? `${title}：${summary}` : title;
    })
    .join('；');
}

export function normalizeDynamicPlannerMetricText(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hasDynamicPlannerMetricKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(normalizeDynamicPlannerMetricText(keyword)));
}

export function buildDynamicSourceSummaryText(source: ReportDynamicSource) {
  return source.contentFocus || source.request || '当前目标';
}
