export type ReportViewportTarget = 'desktop' | 'mobile';

export function normalizeReportViewportTarget(
  value: unknown,
  fallback: ReportViewportTarget = 'desktop',
): ReportViewportTarget {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'mobile') return 'mobile';
  if (normalized === 'desktop') return 'desktop';
  return fallback;
}
