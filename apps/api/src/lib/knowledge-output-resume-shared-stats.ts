import { normalizeText, sanitizeText } from './knowledge-output-resume-shared-text.js';

export function buildRankedLabelCounts(values: string[], limit = 8) {
  const counts = new Map<string, { label: string; value: number }>();
  for (const value of values) {
    const label = sanitizeText(value);
    if (!label) continue;
    const normalized = normalizeText(label);
    if (!normalized) continue;
    const next = counts.get(normalized);
    if (next) {
      next.value += 1;
      continue;
    }
    counts.set(normalized, { label, value: 1 });
  }

  return [...counts.values()]
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'zh-CN'))
    .slice(0, limit);
}

export function joinRankedLabels(items: Array<{ label: string; value: number }>, limit = 4) {
  return items
    .slice(0, limit)
    .map((item) => `${item.label}${item.value > 1 ? `(${item.value})` : ''}`)
    .join('、');
}

export function parseResumeExperienceYears(value: string) {
  const match = sanitizeText(value).match(/(\d{1,2})(?:\+)?\s*(?:年|yrs?|years?)/iu);
  if (!match) return 0;
  return Number(match[1] || 0);
}
