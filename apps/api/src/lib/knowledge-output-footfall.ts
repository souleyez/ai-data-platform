import type { ParsedDocument } from './document-parser.js';
import { isFootfallDocumentSignal } from './document-domain-signals.js';
import type { ReportTemplateEnvelope } from './report-center.js';

type FootfallDeps = {
  normalizeText: (value: string) => string;
  sanitizeText: (value: unknown) => string;
  containsAny: (text: string, keywords: string[]) => boolean;
  looksLikeJsonEchoText: (value: string) => boolean;
};

type FootfallPageStats = {
  documentCount: number;
  totalFootfall: number;
  mallZoneBreakdown: Array<{ label: string; value: number; floorZoneCount: number; roomUnitCount: number }>;
  supportingLines: string[];
  lowZoneHighlights: string[];
};

type FootfallPage = {
  summary?: string;
  cards?: Array<{ label?: string; value?: string; note?: string }>;
  sections?: Array<{ title?: string; body?: string; bullets?: string[] }>;
  charts?: Array<{ title?: string; items?: Array<{ label?: string; value?: number }> }>;
};

type KnowledgePageOutput = {
  type: 'page';
  title: string;
  content: string;
  format: 'html';
  page: NonNullable<FootfallPage>;
};

type FootfallTableOutput = {
  type: 'table';
  title: string;
  content: string;
  format: 'csv';
  table: {
    title: string;
    subtitle: string;
    columns: string[];
    rows: string[][];
  };
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatFootfallValue(value: number) {
  if (!Number.isFinite(value)) return '0';
  return `${Math.round(value).toLocaleString('zh-CN')} 人次`;
}

function parseFootfallNumericValue(value: unknown, deps: FootfallDeps) {
  const text = deps.sanitizeText(value).replace(/,/g, '');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function getStructuredProfileRecord(item: ParsedDocument) {
  return isObject(item.structuredProfile) ? item.structuredProfile as Record<string, unknown> : {};
}

function getFootfallRecordInsights(item: ParsedDocument) {
  const profile = getStructuredProfileRecord(item);
  const tableSummary = isObject(profile.tableSummary) ? profile.tableSummary as Record<string, unknown> : null;
  return tableSummary && isObject(tableSummary.recordInsights)
    ? tableSummary.recordInsights as Record<string, unknown>
    : null;
}

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

function buildFootfallPageStats(documents: ParsedDocument[], deps: FootfallDeps): FootfallPageStats {
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

function buildFootfallPageTitle(envelope: ReportTemplateEnvelope | null | undefined, deps: Pick<FootfallDeps, 'sanitizeText'>) {
  return deps.sanitizeText(envelope?.title) || '商场客流分区驾驶舱';
}

function buildFootfallPageSummary(stats: FootfallPageStats) {
  const topZones = stats.mallZoneBreakdown
    .slice(0, 3)
    .map((entry) => `${entry.label} ${formatFootfallValue(entry.value)}`)
    .join('、');
  const lead = topZones
    ? `当前客流重心主要集中在 ${topZones}。`
    : '当前已识别到商场客流资料，但分区贡献仍需继续积累。';
  return [
    `本次共汇总 ${stats.documentCount} 份客流资料，累计识别 ${formatFootfallValue(stats.totalFootfall)}。`,
    lead,
    '报表已统一按商场分区汇总，楼层分区和单间明细不单独展开。',
  ].join('');
}

function buildFootfallPageCards(stats: FootfallPageStats) {
  const topZone = stats.mallZoneBreakdown[0];
  return [
    { label: '总客流', value: formatFootfallValue(stats.totalFootfall), note: '已按商场分区汇总' },
    { label: '商场分区数', value: `${Math.max(stats.mallZoneBreakdown.length, 1)} 个`, note: '只展示商场分区口径' },
    {
      label: '头部分区',
      value: topZone ? `${topZone.label}` : '待补充',
      note: topZone ? formatFootfallValue(topZone.value) : '暂无稳定分区',
    },
    { label: '展示口径', value: '商场分区', note: '楼层与单间明细已折叠' },
  ];
}

function buildFootfallPageSections(summary: string, stats: FootfallPageStats, envelope: ReportTemplateEnvelope | null | undefined) {
  const sectionTitles = envelope?.pageSections?.length
    ? envelope.pageSections
    : ['客流总览', '商场分区贡献', '高客流分区', '低效分区提醒', '口径说明', 'AI综合分析'];
  const topZoneBullets = stats.mallZoneBreakdown
    .slice(0, 5)
    .map((entry) => `${entry.label}：${formatFootfallValue(entry.value)}`);
  const lowZoneBullets = stats.lowZoneHighlights.length
    ? stats.lowZoneHighlights
    : ['当前低位分区样本仍有限，建议持续按商场分区追踪波动。'];
  const blueprints = [
    {
      body: summary,
      bullets: stats.supportingLines.slice(0, 3),
    },
    {
      body: topZoneBullets.length
        ? '当前展示层统一落在商场分区，不继续展开楼层或单间。先看分区贡献，再决定需要深挖的具体点位。'
        : '当前分区贡献仍在补齐中，建议继续累积同口径链接。',
      bullets: topZoneBullets,
    },
    {
      body: topZoneBullets[0]
        ? `高客流焦点当前主要落在 ${stats.mallZoneBreakdown[0]?.label}${stats.mallZoneBreakdown[1] ? `，以及 ${stats.mallZoneBreakdown[1]?.label}` : ''}。`
        : '高客流分区尚未形成稳定排序。',
      bullets: topZoneBullets.slice(0, 3),
    },
    {
      body: '低位分区更适合做经营提醒而不是明细堆砌，保持在商场分区口径即可。',
      bullets: lowZoneBullets,
    },
    {
      body: '本页统一按商场分区汇总客流；楼层分区和单间数据只参与聚合，不在展示层逐条展开。',
      bullets: [
        '适合直接给商场运营、招商或现场团队看整体分区热度',
        '需要深挖时再回到明细，不把展示层拉回到点位级列表',
      ],
    },
    {
      body: 'AI 综合分析保持克制：先看客流是否持续集中到少数商场分区，再决定活动、导流或点位优化动作，不补写无证据的经营结论。',
      bullets: [
        '优先围绕高客流分区安排活动承接和资源配置',
        '低位分区只做提醒，不把页面退回到明细表展示',
      ],
    },
  ];

  return sectionTitles.map((title, index) => ({
    title,
    body: blueprints[index]?.body || (index === 0 ? summary : ''),
    bullets: blueprints[index]?.bullets || [],
  }));
}

function buildFootfallPageCharts(stats: FootfallPageStats) {
  const topItems = stats.mallZoneBreakdown.slice(0, 6).map((entry) => ({ label: entry.label, value: entry.value }));
  return [
    { title: '商场分区客流贡献', items: topItems },
    { title: '商场分区客流梯队', items: topItems },
  ].filter((item) => item.items.length);
}

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
