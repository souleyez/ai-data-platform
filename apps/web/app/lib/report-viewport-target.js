'use client';

export function normalizeReportViewportTarget(value, fallback = 'desktop') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'mobile') return 'mobile';
  if (normalized === 'desktop') return 'desktop';
  return fallback === 'mobile' ? 'mobile' : 'desktop';
}

export function resolveReportViewportTarget(item, fallback = 'desktop') {
  return normalizeReportViewportTarget(
    item?.draft?.viewportTarget || item?.page?.viewportTarget || item?.dynamicSource?.viewportTarget || item?.viewportTarget,
    fallback,
  );
}

export function formatReportViewportTargetLabel(value) {
  return normalizeReportViewportTarget(value) === 'mobile' ? '手机端' : 'PC端';
}

function toTimestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortGeneratedReportsForViewport(items = [], mobileViewport = false) {
  const preferredTarget = mobileViewport ? 'mobile' : 'desktop';
  return [...items].sort((left, right) => {
    const leftPreferred = resolveReportViewportTarget(left) === preferredTarget ? 1 : 0;
    const rightPreferred = resolveReportViewportTarget(right) === preferredTarget ? 1 : 0;
    if (leftPreferred !== rightPreferred) return rightPreferred - leftPreferred;

    const createdDiff = toTimestamp(right?.createdAt) - toTimestamp(left?.createdAt);
    if (createdDiff !== 0) return createdDiff;

    return String(left?.title || '').localeCompare(String(right?.title || ''), 'zh-CN');
  });
}
