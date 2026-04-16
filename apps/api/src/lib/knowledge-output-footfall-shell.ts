import type { ParsedDocument } from './document-parser.js';
import type { ReportTemplateEnvelope } from './report-center.js';
import {
  buildFootfallPageCards,
  buildFootfallPageCharts,
  buildFootfallPageSections,
  buildFootfallPageSummary,
  buildFootfallPageTitle,
} from './knowledge-output-footfall-copy.js';
import { buildFootfallPageStats } from './knowledge-output-footfall-stats.js';
import {
  formatFootfallValue,
  type FootfallDeps,
  type FootfallPage,
  type FootfallTableOutput,
  type KnowledgePageOutput,
} from './knowledge-output-footfall-support.js';

export function buildFootfallPageOutput(
  documents: ParsedDocument[],
  envelope: ReportTemplateEnvelope | null | undefined,
  deps: FootfallDeps,
): KnowledgePageOutput {
  const stats = buildFootfallPageStats(documents, deps);
  const summary = buildFootfallPageSummary(stats);
  return {
    type: 'page',
    title: buildFootfallPageTitle(envelope, deps),
    content: summary,
    format: 'html',
    page: {
      summary,
      cards: buildFootfallPageCards(stats),
      sections: buildFootfallPageSections(summary, stats, envelope),
      charts: buildFootfallPageCharts(stats),
    },
  };
}

export function buildFootfallTableOutput(
  documents: ParsedDocument[],
  envelope: ReportTemplateEnvelope | null | undefined,
  deps: Pick<FootfallDeps, 'sanitizeText' | 'normalizeText'>,
): FootfallTableOutput {
  const stats = buildFootfallPageStats(documents, {
    ...deps,
    containsAny: () => false,
    looksLikeJsonEchoText: () => false,
  });
  const columns = envelope?.tableColumns?.length
    ? envelope.tableColumns
    : ['商场分区', '客流', '说明'];
  const rows = stats.mallZoneBreakdown.map((entry) => ([
    entry.label,
    formatFootfallValue(entry.value),
    '仅输出商场分区汇总，楼层和单间明细不展开',
  ]));

  return {
    type: 'table',
    title: deps.sanitizeText(envelope?.title) || '商场客流分区表',
    content: buildFootfallPageSummary(stats),
    format: 'csv',
    table: {
      title: deps.sanitizeText(envelope?.title) || '商场客流分区表',
      subtitle: '按商场分区汇总输出',
      columns,
      rows,
    },
  };
}

function mergePageSections(
  primary: NonNullable<FootfallPage['sections']>,
  fallback: NonNullable<FootfallPage['sections']>,
  deps: Pick<FootfallDeps, 'sanitizeText' | 'looksLikeJsonEchoText'>,
) {
  return fallback.map((fallbackSection, index) => {
    const source = primary[index];
    if (!source) return fallbackSection;
    const body = deps.sanitizeText(source.body);
    const useFallbackBody = !body || deps.looksLikeJsonEchoText(body);
    const bullets = (source.bullets || []).filter((item) => deps.sanitizeText(item));
    return {
      title: deps.sanitizeText(source.title) || fallbackSection.title,
      body: useFallbackBody ? fallbackSection.body : source.body,
      bullets: bullets.length ? bullets : fallbackSection.bullets,
    };
  });
}

export function hydrateFootfallPageVisualShell(
  documents: ParsedDocument[],
  envelope: ReportTemplateEnvelope | null | undefined,
  page: NonNullable<FootfallPage>,
  deps: FootfallDeps,
) {
  const fallbackPage = buildFootfallPageOutput(documents, envelope, deps).page;
  const mergeCards = (
    primary: NonNullable<FootfallPage['cards']>,
    fallback: NonNullable<FootfallPage['cards']>,
    minCount: number,
  ) => {
    const merged = [...primary];
    const seen = new Set(merged.map((item) => deps.normalizeText(item.label || item.value || item.note || '')));
    for (const item of fallback) {
      if (merged.length >= minCount) break;
      const key = deps.normalizeText(item.label || item.value || item.note || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    return merged.length ? merged : fallback;
  };
  const mergeCharts = (
    primary: NonNullable<FootfallPage['charts']>,
    fallback: NonNullable<FootfallPage['charts']>,
    minCount: number,
  ) => {
    const merged = [...primary];
    const seen = new Set(merged.map((item) => deps.normalizeText(item.title || '')));
    for (const item of fallback) {
      if (merged.length >= minCount) break;
      const key = deps.normalizeText(item.title || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    return merged.length ? merged : fallback;
  };

  return {
    summary: page.summary || fallbackPage.summary,
    cards: mergeCards(page.cards || [], fallbackPage.cards || [], 4),
    sections: page.sections?.length ? mergePageSections(page.sections, fallbackPage.sections || [], deps) : fallbackPage.sections,
    charts: mergeCharts(page.charts || [], fallbackPage.charts || [], 2),
  };
}
