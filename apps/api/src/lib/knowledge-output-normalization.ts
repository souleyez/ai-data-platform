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

export function normalizeCards(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isObject)
    .map((item) => ({
      label: sanitizeText(item.label),
      value: sanitizeText(item.value),
      note: sanitizeText(item.note),
    }))
    .filter((item) => item.label || item.value || item.note);
}

export function normalizeSectionDisplayMode(value: unknown) {
  const normalized = sanitizeText(value);
  return ['summary', 'insight-list', 'timeline', 'comparison', 'cta', 'appendix'].includes(normalized)
    ? normalized
    : '';
}

export function inferSectionDisplayModeFromTitle(title: string, fallback?: string) {
  return (
    normalizeSectionDisplayMode(fallback)
    || inferVisualSectionDisplayModeFromTitle(
      title,
      /建议|行动|应答|下一步/i.test(title) ? 'cta' : 'summary',
    )
  );
}

export function normalizeSections(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isObject)
    .map((item) => ({
      title: sanitizeText(item.title),
      body: sanitizeText(item.body || item.content || item.summary),
      bullets: sanitizeStringArray(item.bullets || item.points || item.items),
      displayMode: normalizeSectionDisplayMode(item.displayMode),
    }))
    .filter((item) => item.title || item.body || item.bullets.length);
}

export function normalizeChartRender(value: unknown) {
  if (!isObject(value)) return null;
  const renderer = sanitizeText(value.renderer);
  const chartType = sanitizeText(value.chartType);
  const svg = sanitizeText(value.svg);
  const alt = sanitizeText(value.alt);
  const generatedAt = sanitizeText(value.generatedAt);
  return renderer || chartType || svg || alt || generatedAt
    ? { renderer, chartType, svg, alt, generatedAt }
    : null;
}

export function normalizeCharts(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isObject)
    .map((item) => ({
      title: sanitizeText(item.title),
      items: Array.isArray(item.items)
        ? item.items
            .filter(isObject)
            .map((entry) => ({
              label: sanitizeText(entry.label),
              value: Number(entry.value || 0),
            }))
            .filter((entry) => entry.label)
        : [],
      render: normalizeChartRender(item.render),
    }))
    .filter((item) => item.title || item.items.length || item.render);
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
        displayMode: inferSectionDisplayModeFromTitle(title, item?.displayMode),
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

type KnowledgeOutputChart = {
  title?: string;
  items?: Array<{ label?: string; value?: number }>;
  render?: {
    renderer?: string;
    chartType?: string;
    svg?: string;
    alt?: string;
    generatedAt?: string;
  } | null;
};

export function applyPlannedDatavizSlots(
  charts: KnowledgeOutputChart[],
  slots: ReportPlanDatavizSlot[] = [],
) {
  const normalizedSlots = Array.isArray(slots) ? slots.filter((item) => item?.title) : [];
  if (!normalizedSlots.length) return charts;

  const normalizedCharts = Array.isArray(charts) ? charts.filter(Boolean) : [];
  const usedChartIndexes = new Set<number>();
  const plannedCharts = normalizedSlots.map((slot, slotIndex) => {
    const explicitMatchIndex = normalizedCharts.findIndex((chart, chartIndex) => {
      if (usedChartIndexes.has(chartIndex)) return false;
      return normalizeDatavizSlotKey(String(chart.title || '')) === normalizeDatavizSlotKey(slot.title);
    });
    const fallbackMatchIndex = explicitMatchIndex >= 0
      ? explicitMatchIndex
      : normalizedCharts.findIndex((_, chartIndex) => !usedChartIndexes.has(chartIndex) && chartIndex === slotIndex);
    const resolvedIndex = fallbackMatchIndex >= 0
      ? fallbackMatchIndex
      : normalizedCharts.findIndex((_, chartIndex) => !usedChartIndexes.has(chartIndex));
    const sourceChart = resolvedIndex >= 0 ? normalizedCharts[resolvedIndex] : null;
    if (resolvedIndex >= 0) usedChartIndexes.add(resolvedIndex);
    return {
      ...(sourceChart || {}),
      title: sanitizeText(sourceChart?.title) || slot.title,
      items: Array.isArray(sourceChart?.items) ? sourceChart.items : [],
      render: sourceChart?.render || null,
    };
  });

  const remainingCharts = normalizedCharts.filter((_, chartIndex) => !usedChartIndexes.has(chartIndex));
  return [...plannedCharts, ...remainingCharts];
}

function normalizeObjectKeys(row: JsonRecord) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeText(key), value]),
  );
}

function deriveColumnsFromObjectRows(rows: JsonRecord[]) {
  const orderedKeys: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      const normalized = sanitizeText(key);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      orderedKeys.push(normalized);
    }
  }
  return orderedKeys;
}

export function normalizeColumnNames(columns: string[]) {
  return columns.map((item) => sanitizeText(item)).filter(Boolean);
}

export function sanitizeRows(value: unknown, targetColumns: string[]) {
  if (!Array.isArray(value)) return { columns: targetColumns, rows: [] as string[][] };

  const arrayRows = value.filter((entry) => Array.isArray(entry)) as unknown[][];
  if (arrayRows.length) {
    const rows = arrayRows.map((row) => row.map((cell) => sanitizeText(cell)));
    return { columns: targetColumns, rows };
  }

  const objectRows = value.filter(isObject) as JsonRecord[];
  if (!objectRows.length) {
    return { columns: targetColumns, rows: [] as string[][] };
  }

  const columns = targetColumns.length ? targetColumns : deriveColumnsFromObjectRows(objectRows);
  const normalizedColumns = columns.map((column) => sanitizeText(column)).filter(Boolean);
  const rows = objectRows.map((row) => {
    const normalizedRow = normalizeObjectKeys(row);
    return normalizedColumns.map((column) => {
      const direct = row[column];
      if (direct != null) return sanitizeText(direct);
      const byNormalized = normalizedRow[normalizeText(column)];
      if (byNormalized != null) return sanitizeText(byNormalized);
      return '';
    });
  });

  return { columns: normalizedColumns, rows };
}

export function alignRowsToColumns(rows: string[][], columns: string[]) {
  return rows.map((row) => {
    if (row.length === columns.length) return row;
    if (row.length > columns.length) return row.slice(0, columns.length);
    return [...row, ...new Array(columns.length - row.length).fill('')];
  });
}

export function alignSectionsToEnvelope(
  sections: Array<{ title?: string; body?: string; bullets?: string[]; displayMode?: string }>,
  envelopeSections: string[],
  summary: string,
) {
  if (!envelopeSections.length) return sections;

  const unused = [...sections];
  return envelopeSections.map((title, index) => {
    const normalizedTitle = normalizeText(title);
    const exactIndex = unused.findIndex((item) => normalizeText(item.title || '') === normalizedTitle);
    const fuzzyIndex = exactIndex >= 0
      ? exactIndex
      : unused.findIndex((item) => {
          const itemTitle = normalizeText(item.title || '');
          return itemTitle && (itemTitle.includes(normalizedTitle) || normalizedTitle.includes(itemTitle));
        });
    const matched = fuzzyIndex >= 0 ? unused.splice(fuzzyIndex, 1)[0] : undefined;
    return {
      title,
      body: matched?.body || (index === 0 ? summary : ''),
      bullets: matched?.bullets || [],
      displayMode: normalizeSectionDisplayMode(matched?.displayMode),
    };
  });
}

export function applyPageSpecSectionDisplayModes(
  sections: Array<{ title?: string; body?: string; bullets?: string[]; displayMode?: string }>,
  pageSpec: ReturnType<typeof normalizeReportPlanPageSpec>,
) {
  if (!pageSpec?.sections?.length) return sections;
  return sections.map((section, index) => {
    const normalizedTitle = normalizeText(section.title || '');
    const matchedSection =
      pageSpec.sections.find((item) => normalizeText(item.title) === normalizedTitle)
      || pageSpec.sections[index];
    return {
      ...section,
      displayMode: inferSectionDisplayModeFromTitle(String(section.title || ''), section.displayMode || matchedSection?.displayMode),
    };
  });
}

export function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => sanitizeText(item)).filter(Boolean);
}
