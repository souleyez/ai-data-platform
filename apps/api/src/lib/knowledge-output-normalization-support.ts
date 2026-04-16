import type { ReportPlanDatavizSlot, ReportPlanPageSpec } from './report-planner.js';
import { inferSectionDisplayModeFromTitle as inferVisualSectionDisplayModeFromTitle } from './report-visual-intent.js';

export type JsonRecord = Record<string, unknown>;

export function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function isObject(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function buildDefaultTitle(kind: 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md') {
  if (kind === 'page') return '知识库静态页';
  if (kind === 'ppt') return '知识库PPT';
  if (kind === 'pdf') return '知识库文档';
  return '知识库表格';
}

export function sanitizeText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function sanitizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => sanitizeText(item)).filter(Boolean);
}

function normalizePlannedSectionDisplayMode(value: unknown) {
  const normalized = sanitizeText(value);
  return ['summary', 'insight-list', 'timeline', 'comparison', 'cta', 'appendix'].includes(normalized)
    ? normalized
    : '';
}

function inferPlannedSectionDisplayMode(title: string, fallback?: string) {
  return (
    normalizePlannedSectionDisplayMode(fallback)
    || inferVisualSectionDisplayModeFromTitle(
      title,
      /建议|行动|应答|下一步/i.test(title) ? 'cta' : 'summary',
    )
  );
}

export function looksLikeJsonEchoText(value: string) {
  const text = sanitizeText(value);
  if (!text) return false;
  return text.startsWith('{')
    || text.startsWith('[')
    || /"(?:title|summary|page|cards|sections|charts|items)"\s*:/.test(text);
}

export function tryParseJsonPayload(content: string) {
  const raw = String(content || '').trim();
  if (!raw) return null;

  const candidates = [
    raw,
    ...(raw.match(/```json\s*([\s\S]*?)```/gi) || []).map((item) => item.replace(/```json|```/gi, '').trim()),
    ...(raw.match(/```[\s\S]*?```/gi) || []).map((item) => item.replace(/```/g, '').trim()),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      const firstBrace = candidate.indexOf('{');
      const lastBrace = candidate.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
          return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
        } catch {
          // continue
        }
      }
    }
  }

  return null;
}

export function looksLikeStructuredReportPayload(value: unknown): value is JsonRecord {
  if (!isObject(value)) return false;
  return Boolean(
    isObject(value.page)
    || Array.isArray(value.cards)
    || Array.isArray(value.sections)
    || Array.isArray(value.charts)
    || Array.isArray(value.rows)
    || Array.isArray(value.columns)
    || sanitizeText(value.summary)
    || sanitizeText(value.content)
    || sanitizeText(value.title),
  );
}

export function pickNestedObject(root: JsonRecord, paths: string[][]) {
  for (const path of paths) {
    let current: unknown = root;
    let matched = true;
    for (const key of path) {
      if (!isObject(current) || !(key in current)) {
        matched = false;
        break;
      }
      current = current[key];
    }
    if (matched && isObject(current)) {
      return current;
    }
  }
  return null;
}

export function extractEmbeddedStructuredPayload(...values: unknown[]) {
  for (const value of values) {
    const candidate = typeof value === 'string' ? tryParseJsonPayload(value) : value;
    if (!isObject(candidate)) continue;
    const payload =
      pickNestedObject(candidate, [['output'], ['report'], ['result'], ['data']])
      || candidate;
    if (looksLikeStructuredReportPayload(payload)) {
      return payload;
    }
  }
  return null;
}

export function pickString(...values: unknown[]) {
  for (const value of values) {
    const text = sanitizeText(value);
    if (text) return text;
  }
  return '';
}

export function normalizeDatavizSlotKey(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeReportPlanDatavizSlots(slots: ReportPlanDatavizSlot[] | undefined) {
  if (!Array.isArray(slots) || !slots.length) return [];
  return slots
    .map((slot) => {
      const key = normalizeDatavizSlotKey(slot?.key || slot?.title || '');
      const title = pickString(slot?.title, key);
      if (!title) return null;
      return {
        key: key || normalizeDatavizSlotKey(title),
        title,
        purpose: pickString(slot?.purpose),
        preferredChartType:
          slot?.preferredChartType === 'line' || slot?.preferredChartType === 'horizontal-bar'
            ? slot.preferredChartType
            : 'bar',
        placement: slot?.placement === 'section' ? 'section' : 'hero',
        sectionTitle: pickString(slot?.sectionTitle),
        evidenceFocus: pickString(slot?.evidenceFocus),
        minItems: Number.isFinite(Number(slot?.minItems)) ? Number(slot?.minItems) : 2,
        maxItems: Number.isFinite(Number(slot?.maxItems)) ? Number(slot?.maxItems) : 8,
      };
    })
    .filter(Boolean) as ReportPlanDatavizSlot[];
}

export function normalizeReportPlanPageSpec(pageSpec: ReportPlanPageSpec | undefined) {
  if (!pageSpec || !Array.isArray(pageSpec.sections)) return null;
  const layoutVariant: ReportPlanPageSpec['layoutVariant'] =
    pageSpec.layoutVariant === 'risk-brief'
    || pageSpec.layoutVariant === 'operations-cockpit'
    || pageSpec.layoutVariant === 'talent-showcase'
    || pageSpec.layoutVariant === 'research-brief'
    || pageSpec.layoutVariant === 'solution-overview'
      ? pageSpec.layoutVariant
      : 'insight-brief';
  const heroCardLabels = Array.isArray(pageSpec.heroCardLabels)
    ? pageSpec.heroCardLabels.map((item) => pickString(item)).filter(Boolean)
    : [];
  const heroDatavizSlotKeys = Array.isArray(pageSpec.heroDatavizSlotKeys)
    ? pageSpec.heroDatavizSlotKeys.map((item) => normalizeDatavizSlotKey(item)).filter(Boolean)
    : [];
  const sections = pageSpec.sections
    .map((item) => {
      const title = pickString(item?.title);
      if (!title) return null;
      return {
        title,
        purpose: pickString(item?.purpose),
        completionMode: item?.completionMode === 'knowledge-plus-model' ? 'knowledge-plus-model' : 'knowledge-first',
        displayMode: inferPlannedSectionDisplayMode(title, item?.displayMode),
        datavizSlotKeys: Array.isArray(item?.datavizSlotKeys)
          ? item.datavizSlotKeys.map((slotKey) => normalizeDatavizSlotKey(slotKey)).filter(Boolean)
          : [],
      };
    })
    .filter(Boolean) as ReportPlanPageSpec['sections'];

  return heroCardLabels.length || heroDatavizSlotKeys.length || sections.length
    ? {
        layoutVariant,
        heroCardLabels,
        heroDatavizSlotKeys,
        sections,
      }
    : null;
}

export function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => sanitizeText(item)).filter(Boolean);
}
