export const UNKNOWN_COMPANY = '未明确公司';

export function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => sanitizeText(item)).filter(Boolean);
}

export function normalizeUniqueStrings(values: unknown[], limit = 8) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = sanitizeText(value);
    if (!text) continue;
    const normalized = normalizeText(text);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

export function buildResumeFileBaseName(value: string) {
  return sanitizeText(String(value || '').replace(/\.[a-z0-9]+$/i, '').replace(/^\d{8,16}-/, ''));
}
