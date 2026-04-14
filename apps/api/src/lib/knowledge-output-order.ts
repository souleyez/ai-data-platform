import type { ParsedDocument } from './document-parser.js';
import { isOrderInventoryDocumentSignal } from './document-domain-signals.js';
import {
  buildGenericShellCards,
  buildGenericShellCharts,
  buildOrderPageCards,
  buildOrderPageCharts,
  buildOrderPageSummary,
  buildOrderPageTitle,
  buildOrderSectionBlueprints,
  buildStockShellCards,
  buildStockShellCharts,
  defaultOrderPageSections,
  mergeOrderPageSections,
} from './knowledge-output-order-page.js';
import { buildOrderPageStats } from './knowledge-output-order-stats.js';
import type { ReportTemplateEnvelope } from './report-center.js';

export type OrderRequestView = 'generic' | 'platform' | 'category' | 'stock';

export type OrderOutputDeps = {
  normalizeText: (value: string) => string;
  sanitizeText: (value: unknown) => string;
  containsAny: (text: string, keywords: string[]) => boolean;
  toStringArray: (value: unknown) => string[];
  buildRankedLabelCounts: (values: string[], limit?: number) => Array<{ label: string; value: number }>;
  joinRankedLabels: (items: Array<{ label: string; value: number }>, limit?: number) => string;
  looksLikeJsonEchoText: (value: string) => boolean;
};

export type OrderPageStats = {
  documentCount: number;
  channels: Array<{ label: string; value: number }>;
  categories: Array<{ label: string; value: number }>;
  metrics: Array<{ label: string; value: number }>;
  replenishment: Array<{ label: string; value: number }>;
  anomalies: Array<{ label: string; value: number }>;
  supportingLines: string[];
  platformAmounts: Array<{ label: string; value: number }>;
  categoryAmounts: Array<{ label: string; value: number }>;
  riskHighlights: string[];
  actionHighlights: string[];
};

type OrderPage = {
  summary?: string;
  cards?: Array<{ label?: string; value?: string; note?: string }>;
  sections?: Array<{ title?: string; body?: string; bullets?: string[] }>;
  charts?: Array<{ title?: string; items?: Array<{ label?: string; value?: number }> }>;
};

export type KnowledgePageOutput = {
  type: 'page';
  title: string;
  content: string;
  format: 'html';
  page: NonNullable<OrderPage>;
};

export function isOrderInventoryDocument(
  item: ParsedDocument,
  deps: Pick<OrderOutputDeps, 'normalizeText' | 'containsAny'>,
) {
  const schemaType = String(item.schemaType || '').toLowerCase();
  if (isOrderInventoryDocumentSignal(item)) return true;
  if (schemaType === 'order') return true;
  if (
    schemaType === 'report'
    && deps.containsAny(
      deps.normalizeText([
        item.title,
        item.summary,
        item.excerpt,
        ...(item.topicTags || []),
      ].join(' ')),
      ['order', 'inventory', 'replenishment', 'stock', '订单', '库存', '补货', '备货'],
    )
  ) {
    return true;
  }
  return false;
}

function hasOrderPlatformSignal(text: string, deps: Pick<OrderOutputDeps, 'containsAny'>) {
  return deps.containsAny(text, ['platform', 'channel', 'tmall', 'jd', 'douyin', 'amazon', 'shopify', '平台', '渠道', '天猫', '京东', '抖音']);
}

function hasOrderCategorySignal(text: string, deps: Pick<OrderOutputDeps, 'containsAny'>) {
  return deps.containsAny(text, ['category', 'categories', 'sku', '品类', '类目', '商品']);
}

function hasOrderStockSignal(text: string, deps: Pick<OrderOutputDeps, 'containsAny'>) {
  return deps.containsAny(text, ['inventory', 'stock', 'forecast', 'replenishment', 'restock', '库存', '补货', '备货', '缺货', '周转']);
}

export function resolveOrderRequestView(
  requestText: string,
  deps: Pick<OrderOutputDeps, 'normalizeText' | 'containsAny'>,
): OrderRequestView {
  const text = deps.normalizeText(requestText);
  const hasStock = hasOrderStockSignal(text, deps);
  const hasCategory = hasOrderCategorySignal(text, deps);
  const hasPlatform = hasOrderPlatformSignal(text, deps);
  const hasExplicitStockView = deps.containsAny(text, [
    'inventory cockpit',
    'stock cockpit',
    '库存驾驶舱',
    '库存与补货驾驶舱',
    '补货驾驶舱',
  ]);
  const hasStockRiskFocus = deps.containsAny(text, ['断货', '滞销', '高风险sku', '高风险 sku', '72小时', '72 小时', '周转']);
  if (hasExplicitStockView || (hasStock && !hasCategory && !hasPlatform) || (hasStock && hasStockRiskFocus && !hasPlatform)) {
    return 'stock';
  }
  if (hasCategory && hasPlatform) return 'generic';
  if (hasCategory) return 'category';
  if (hasPlatform) return 'platform';
  return 'generic';
}

export function buildOrderPageOutput(
  view: OrderRequestView,
  documents: ParsedDocument[],
  envelope: ReportTemplateEnvelope | null | undefined,
  deps: OrderOutputDeps,
): KnowledgePageOutput {
  const stats = buildOrderPageStats(documents, deps);
  const summary = buildOrderPageSummary(view, stats, deps);
  const sectionTitles = envelope?.pageSections?.length ? envelope.pageSections : defaultOrderPageSections(view);
  const blueprints = buildOrderSectionBlueprints(view, summary, stats, deps);

  return {
    type: 'page',
    title: buildOrderPageTitle(view, envelope, deps),
    content: summary,
    format: 'html',
    page: {
      summary,
      cards: buildOrderPageCards(view, stats, deps),
      sections: sectionTitles.map((title, index) => {
        const section = blueprints[index] || { body: '', bullets: [] as string[] };
        return {
          title,
          body: section.body || (index === 0 ? summary : ''),
          bullets: section.bullets || [],
        };
      }),
      charts: buildOrderPageCharts(view, stats),
    },
  };
}

export function hydrateOrderPageVisualShell(
  view: OrderRequestView,
  documents: ParsedDocument[],
  envelope: ReportTemplateEnvelope | null | undefined,
  page: KnowledgePageOutput['page'],
  deps: OrderOutputDeps,
) {
  const fallbackPage = buildOrderPageOutput(view, documents, envelope, deps).page;
  const mergeCards = (
    primary: NonNullable<KnowledgePageOutput['page']['cards']>,
    fallback: NonNullable<KnowledgePageOutput['page']['cards']>,
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
    primary: NonNullable<KnowledgePageOutput['page']['charts']>,
    fallback: NonNullable<KnowledgePageOutput['page']['charts']>,
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
    summary: deps.looksLikeJsonEchoText(page.summary || '') ? fallbackPage.summary : (page.summary || fallbackPage.summary),
    cards: view === 'stock'
      ? buildStockShellCards(page.cards || [], fallbackPage.cards || [], deps)
      : buildGenericShellCards(mergeCards(page.cards || [], fallbackPage.cards || [], 5), fallbackPage.cards || [], deps),
    sections: page.sections?.length ? mergeOrderPageSections(page.sections, fallbackPage.sections || [], deps) : fallbackPage.sections,
    charts: view === 'stock'
      ? buildStockShellCharts(mergeCharts(page.charts || [], fallbackPage.charts || [], 2), fallbackPage.charts || [], deps)
      : buildGenericShellCharts(mergeCharts(page.charts || [], fallbackPage.charts || [], 3), fallbackPage.charts || [], deps),
  };
}
