import type { KnowledgePageOutput, OrderOutputDeps } from './knowledge-output-order.js';

function normalizeStockCardShell(cards: NonNullable<KnowledgePageOutput['page']['cards']>) {
  return cards.map((card) => {
    const label = String(card.label || '').trim();
    if (label === '库存健康') return { ...card, label: '库存健康指数' };
    if (label === '高风险SKU') return { ...card, label: '断货风险SKU' };
    if (label === '缺货风险SKU') return { ...card, label: '断货风险SKU' };
    if (label === '滞销库存占比') return { ...card, label: '滞销库存池' };
    if (label === '补货优先级') return { ...card, label: '72小时补货动作' };
    if (label === '建议补货量') return { ...card, label: '72小时补货动作' };
    if (label === '跨仓调拨') return { ...card, label: '跨仓调拨队列' };
    return card;
  });
}

function normalizeStockChartShell(charts: NonNullable<KnowledgePageOutput['page']['charts']>) {
  return charts.map((chart) => {
    const title = String(chart.title || '').trim();
    if (title === '库存健康信号') return { ...chart, title: '库存健康指数' };
    if (title === '高风险SKU队列') return { ...chart, title: '断货/超库存风险队列' };
    if (title === 'SKU周转/库存压力') return { ...chart, title: 'SKU周转压力' };
    return chart;
  });
}

function normalizeGenericCardShell(
  cards: NonNullable<KnowledgePageOutput['page']['cards']>,
  deps: Pick<OrderOutputDeps, 'normalizeText'>,
) {
  return cards.map((card) => {
    const label = deps.normalizeText(card.label || '');
    if (label === deps.normalizeText('库存健康')) return { ...card, label: '库存健康指数' };
    if (label === deps.normalizeText('72小时补货动作')) return { ...card, label: '补货优先级' };
    return card;
  });
}

function normalizeGenericChartShell(
  charts: NonNullable<KnowledgePageOutput['page']['charts']>,
  deps: Pick<OrderOutputDeps, 'normalizeText'>,
) {
  return charts.map((chart) => {
    const title = deps.normalizeText(chart.title || '');
    if (title === deps.normalizeText('SKU与品类焦点')) return { ...chart, title: '品类梯队与英雄SKU' };
    if (title === deps.normalizeText('库存与趋势信号')) return { ...chart, title: '库存健康与补货优先级' };
    return chart;
  });
}

export function buildStockShellCards(
  primary: NonNullable<KnowledgePageOutput['page']['cards']>,
  fallback: NonNullable<KnowledgePageOutput['page']['cards']>,
  deps: Pick<OrderOutputDeps, 'normalizeText'>,
) {
  const preferredOrder = ['库存健康指数', '断货风险SKU', '滞销库存池', '72小时补货动作', '跨仓调拨队列'];
  const byLabel = new Map<string, { label?: string; value?: string; note?: string }>();
  for (const card of normalizeStockCardShell(fallback)) {
    const key = deps.normalizeText(card.label || '');
    if (key) byLabel.set(key, card);
  }
  for (const card of normalizeStockCardShell(primary)) {
    const key = deps.normalizeText(card.label || '');
    if (key) byLabel.set(key, card);
  }
  return preferredOrder.map((label) => byLabel.get(deps.normalizeText(label))).filter(Boolean) as NonNullable<KnowledgePageOutput['page']['cards']>;
}

export function buildStockShellCharts(
  primary: NonNullable<KnowledgePageOutput['page']['charts']>,
  fallback: NonNullable<KnowledgePageOutput['page']['charts']>,
  deps: Pick<OrderOutputDeps, 'normalizeText'>,
) {
  const preferredOrder = ['库存健康指数', '断货/超库存风险队列'];
  const byTitle = new Map<string, { title?: string; items?: Array<{ label?: string; value?: number }> }>();
  for (const chart of normalizeStockChartShell(fallback)) {
    const key = deps.normalizeText(chart.title || '');
    if (key) byTitle.set(key, chart);
  }
  for (const chart of normalizeStockChartShell(primary)) {
    const key = deps.normalizeText(chart.title || '');
    if (key) byTitle.set(key, chart);
  }
  return preferredOrder.map((title) => byTitle.get(deps.normalizeText(title))).filter(Boolean) as NonNullable<KnowledgePageOutput['page']['charts']>;
}

export function buildGenericShellCards(
  primary: NonNullable<KnowledgePageOutput['page']['cards']>,
  fallback: NonNullable<KnowledgePageOutput['page']['cards']>,
  deps: Pick<OrderOutputDeps, 'normalizeText'>,
) {
  const preferredOrder = ['渠道GMV', '动销SKU', '高风险SKU', '补货优先级', '库存健康指数'];
  const byLabel = new Map<string, { label?: string; value?: string; note?: string }>();
  for (const card of normalizeGenericCardShell(fallback, deps)) {
    const key = deps.normalizeText(card.label || '');
    if (key) byLabel.set(key, card);
  }
  for (const card of normalizeGenericCardShell(primary, deps)) {
    const key = deps.normalizeText(card.label || '');
    if (key) byLabel.set(key, card);
  }
  return preferredOrder.map((label) => byLabel.get(deps.normalizeText(label))).filter(Boolean) as NonNullable<KnowledgePageOutput['page']['cards']>;
}

export function buildGenericShellCharts(
  primary: NonNullable<KnowledgePageOutput['page']['charts']>,
  fallback: NonNullable<KnowledgePageOutput['page']['charts']>,
  deps: Pick<OrderOutputDeps, 'normalizeText'>,
) {
  const preferredOrder = ['渠道贡献结构', '品类梯队与英雄SKU', '库存健康与补货优先级'];
  const byTitle = new Map<string, { title?: string; items?: Array<{ label?: string; value?: number }> }>();
  for (const chart of normalizeGenericChartShell(fallback, deps)) {
    const key = deps.normalizeText(chart.title || '');
    if (key) byTitle.set(key, chart);
  }
  for (const chart of normalizeGenericChartShell(primary, deps)) {
    const key = deps.normalizeText(chart.title || '');
    if (key) byTitle.set(key, chart);
  }
  return preferredOrder.map((title) => byTitle.get(deps.normalizeText(title))).filter(Boolean) as NonNullable<KnowledgePageOutput['page']['charts']>;
}

export function mergeOrderPageSections(
  primary: NonNullable<KnowledgePageOutput['page']['sections']>,
  fallback: NonNullable<KnowledgePageOutput['page']['sections']>,
  deps: Pick<OrderOutputDeps, 'sanitizeText' | 'looksLikeJsonEchoText'>,
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
