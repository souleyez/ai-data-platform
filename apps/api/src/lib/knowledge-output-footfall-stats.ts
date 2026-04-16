import type { ParsedDocument } from './document-parser.js';
import { isFootfallDocumentSignal } from './document-domain-signals.js';
import {
  formatFootfallValue,
  getFootfallRecordInsights,
  getStructuredProfileRecord,
  parseFootfallNumericValue,
  type FootfallDeps,
  type FootfallPageStats,
} from './knowledge-output-footfall-support.js';

export function isFootfallReportDocument(item: ParsedDocument, deps: Pick<FootfallDeps, 'normalizeText' | 'containsAny'>) {
  if (isFootfallDocumentSignal(item)) return true;
  const profile = getStructuredProfileRecord(item);
  if (String(profile.reportFocus || '').toLowerCase() === 'footfall') return true;
  return String(item.schemaType || '').toLowerCase() === 'report'
    && deps.containsAny(deps.normalizeText([
      item.title,
      item.summary,
      item.excerpt,
      ...(item.topicTags || []),
    ].join(' ')), ['footfall', 'visitor', '客流', '人流', '商场分区', 'mall zone', 'shopping zone']);
}

function buildFootfallSupportingLines(documents: ParsedDocument[], deps: Pick<FootfallDeps, 'sanitizeText'>) {
  return documents
    .slice(0, 5)
    .map((item) => {
      const title = deps.sanitizeText(item.title || item.name || '客流资料');
      return `${title}：已纳入商场分区口径汇总。`;
    })
    .filter(Boolean);
}

export function buildFootfallPageStats(documents: ParsedDocument[], deps: FootfallDeps): FootfallPageStats {
  const mallZoneTotals = new Map<string, { label: string; value: number; floorZoneCount: number; roomUnitCount: number }>();
  let totalFootfall = 0;

  for (const item of documents) {
    const profile = getStructuredProfileRecord(item);
    const insights = getFootfallRecordInsights(item);
    const mallZoneBreakdown = Array.isArray(insights?.mallZoneBreakdown)
      ? (insights.mallZoneBreakdown as Record<string, unknown>[])
      : [];
    const reportFootfall = parseFootfallNumericValue(insights?.totalFootfall ?? profile.totalFootfall, deps);
    if (reportFootfall !== null) totalFootfall += reportFootfall;

    for (const entry of mallZoneBreakdown) {
      const label = deps.sanitizeText(entry.mallZone);
      const value = parseFootfallNumericValue(entry.footfall, deps);
      if (!label || value === null) continue;
      const existing = mallZoneTotals.get(deps.normalizeText(label));
      if (existing) {
        existing.value += value;
        existing.floorZoneCount = Math.max(existing.floorZoneCount, Number(entry.floorZoneCount || 0) || 0);
        existing.roomUnitCount = Math.max(existing.roomUnitCount, Number(entry.roomUnitCount || 0) || 0);
        continue;
      }
      mallZoneTotals.set(deps.normalizeText(label), {
        label,
        value,
        floorZoneCount: Number(entry.floorZoneCount || 0) || 0,
        roomUnitCount: Number(entry.roomUnitCount || 0) || 0,
      });
    }
  }

  const mallZoneBreakdown = [...mallZoneTotals.values()]
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'zh-CN'))
    .slice(0, 6);
  if (!totalFootfall && mallZoneBreakdown.length) {
    totalFootfall = mallZoneBreakdown.reduce((sum, entry) => sum + entry.value, 0);
  }

  const lowZoneHighlights = mallZoneBreakdown.length > 2
    ? mallZoneBreakdown
        .slice(-2)
        .map((entry) => `${entry.label}：${formatFootfallValue(entry.value)}`)
    : [];

  return {
    documentCount: documents.length,
    totalFootfall,
    mallZoneBreakdown,
    supportingLines: buildFootfallSupportingLines(documents, deps),
    lowZoneHighlights,
  };
}
