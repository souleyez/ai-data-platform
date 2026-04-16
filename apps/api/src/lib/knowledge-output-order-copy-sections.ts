import type { OrderOutputDeps, OrderPageStats, OrderRequestView } from './knowledge-output-order.js';
import {
  buildOrderCopyCommonStats,
  formatOrderAmount,
  mergeOrderHighlightBullets,
} from './knowledge-output-order-copy-support.js';

export function buildOrderSectionBlueprints(
  view: OrderRequestView,
  summary: string,
  stats: OrderPageStats,
  deps: Pick<OrderOutputDeps, 'joinRankedLabels' | 'sanitizeText' | 'normalizeText'>,
) {
  const {
    channelText,
    categoryText,
    metricText,
    actionText,
    anomalyText,
    channelAmountText,
    categoryAmountText,
    riskHighlights,
    actionHighlights,
  } = buildOrderCopyCommonStats(stats, deps);

  if (view === 'platform') {
    return [
      { body: summary, bullets: stats.supportingLines.slice(0, 3) },
      { body: `渠道角色已经开始分化，当前重点主要集中在 ${channelText}。页面应突出渠道贡献结构，而不是简单平铺平台数据。`, bullets: stats.channels.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `增量来源更适合按“渠道角色 + SKU焦点”理解，当前高频主题主要落在 ${categoryText}。`, bullets: stats.categories.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `库存与补货动作需要跟渠道节奏联动，当前动作信号主要集中在 ${actionText}。`, bullets: stats.replenishment.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `当前异常解释主要来自 ${anomalyText}，需要把短期波动和结构性风险拆开看。`, bullets: stats.anomalies.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: 'AI 综合分析应保持保守：先看渠道角色是否清晰，再看 SKU 焦点和补货动作是否同步，不做无证据的硬数字延伸。', bullets: ['优先围绕主渠道与主销 SKU 保证动作时效', '把渠道增量和库存压力拆成两条线分别管理'] },
    ];
  }

  if (view === 'category') {
    return [
      { body: summary, bullets: stats.supportingLines.slice(0, 3) },
      { body: `当前品类与 SKU 焦点主要集中在 ${categoryText}，适合用梯队视角看增长结构。`, bullets: stats.categories.map((item) => `${item.label}：${item.value}`).slice(0, 5) },
      { body: '当前更需要识别英雄 SKU 集中度和尾部 SKU 拖累，而不是继续做平铺排行。', bullets: stats.categories.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `库存与补货要跟品类结构一起看，当前指标信号主要集中在 ${metricText}。`, bullets: stats.metrics.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `异常与波动主要来自 ${anomalyText}，需要把增长型焦点和清理型焦点拆开。`, bullets: stats.anomalies.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: 'AI 综合分析应落到品类动作：增长品类保供给，尾部品类控库存，避免继续做没有层次的 SKU 堆砌。', bullets: ['英雄 SKU 和尾部 SKU 不应使用同一套补货策略', '品类页优先体现结构动作，不要退回排行表视角'] },
    ];
  }

  if (view === 'stock') {
    return [
      { body: summary, bullets: stats.supportingLines.slice(0, 3) },
      { body: `当前库存健康信号主要集中在 ${metricText}，需要把健康度、周转和安全库存放在同一页里看。`, bullets: stats.metrics.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `高风险 SKU 主要集中在 ${anomalyText}，适合形成明确的风险队列。`, bullets: stats.anomalies.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `动销与周转不能只看总库存，当前 SKU 焦点主要落在 ${categoryText}。`, bullets: stats.categories.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: `补货优先级应围绕 ${actionText} 做动作编排，越接近头部 SKU，动作时效要求越高。`, bullets: stats.replenishment.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
      { body: 'AI 综合分析应把库存页保持在供应链控制室视角，不把它写成泛化销售复盘。', bullets: ['优先保障高动销 SKU 的不断货', '把长尾库存消化和快反补货拆成两条动作线'] },
    ];
  }

  return [
    { body: summary, bullets: stats.supportingLines.slice(0, 3) },
    {
      body: channelAmountText
        ? `渠道销售额重心已经拉开，当前主要集中在 ${channelAmountText}，页面应先呈现成交重心，再解释渠道角色分工。`
        : `渠道结构当前主要集中在 ${channelText}，应先形成角色分工，再看结构变化。`,
      bullets: (stats.platformAmounts.length ? stats.platformAmounts.map((item) => `${item.label}：${formatOrderAmount(item.value)}`) : stats.channels.map((item) => `${item.label}：${item.value}`)).slice(0, 4),
    },
    {
      body: categoryAmountText
        ? `品类销售额已经出现明显分层，当前重点主要落在 ${categoryAmountText}，说明经营资源已经向少数主销焦点集中。`
        : `SKU 与品类焦点主要集中在 ${categoryText}，说明经营重心已经偏向少数主销焦点。`,
      bullets: (stats.categoryAmounts.length ? stats.categoryAmounts.map((item) => `${item.label}：${formatOrderAmount(item.value)}`) : stats.categories.map((item) => `${item.label}：${item.value}`)).slice(0, 4),
    },
    {
      body: actionHighlights[0]
        ? `库存与补货不应只看总库存，当前最需要前置编排的动作集中在 ${actionHighlights[0]}，应同步跟踪库存健康和动作优先级。`
        : `库存与补货信号主要集中在 ${metricText} 与 ${actionText}，应同步看库存健康和动作优先级。`,
      bullets: mergeOrderHighlightBullets(actionHighlights, riskHighlights, deps, 4).length
        ? mergeOrderHighlightBullets(actionHighlights, riskHighlights, deps, 4)
        : stats.replenishment.map((item) => `${item.label}：${item.value}`).slice(0, 4),
    },
    {
      body: riskHighlights[0]
        ? `当前异常波动更像结构性风险而不是单点噪声，最突出的风险集中在 ${riskHighlights[0]}${riskHighlights[1] ? `，以及 ${riskHighlights[1]}` : ''}。`
        : `异常波动主要集中在 ${anomalyText}，需要把活动峰值和结构性压力区分处理。`,
      bullets: riskHighlights.length ? riskHighlights : stats.anomalies.map((item) => `${item.label}：${item.value}`).slice(0, 4),
    },
    {
      body: actionHighlights[0]
        ? `行动建议应优先把 ${actionHighlights[0]} 放进 72 小时动作清单，再根据渠道角色和主销品类分层安排补货、调拨和去库存。`
        : '行动建议应优先围绕“保主销、控尾部、分渠道角色”三件事展开，而不是继续做泛化经营摘要。',
      bullets: actionHighlights.length ? actionHighlights : ['主渠道与主销 SKU 优先保证动作时效', '补货、调拨和去库存动作分层处理'],
    },
    {
      body: 'AI 综合分析以知识库证据为主，用于帮助经营页形成更清晰的决策节奏，不补写无依据的硬指标。',
      bullets: ['页面适合用于经营复盘、动作共识和客户展示'],
    },
  ];
}

export function buildOrderPageCharts(view: OrderRequestView, stats: OrderPageStats) {
  if (view === 'stock') {
    return [
      { title: '库存健康指数', items: stats.metrics.slice(0, 6) },
      { title: '断货/超库存风险队列', items: stats.anomalies.slice(0, 6) },
      { title: 'SKU周转压力', items: stats.categories.slice(0, 6) },
      { title: '72小时补货优先级', items: stats.replenishment.slice(0, 6) },
    ].filter((item) => item.items.length);
  }

  if (view === 'category') {
    return [
      { title: '品类梯队结构', items: (stats.categoryAmounts.length ? stats.categoryAmounts : stats.categories).slice(0, 6) },
      { title: 'SKU集中度', items: (stats.categoryAmounts.length ? stats.categoryAmounts : stats.categories).slice(0, 6) },
      { title: '库存与周转压力', items: stats.metrics.slice(0, 6) },
      { title: '动作优先级', items: stats.replenishment.slice(0, 6) },
    ].filter((item) => item.items.length);
  }

  if (view === 'platform') {
    return [
      { title: '渠道贡献结构', items: (stats.platformAmounts.length ? stats.platformAmounts : stats.channels).slice(0, 6) },
      { title: 'SKU动销焦点', items: (stats.categoryAmounts.length ? stats.categoryAmounts : stats.categories).slice(0, 6) },
      { title: '库存/趋势信号', items: stats.metrics.slice(0, 6) },
      { title: '补货动作优先级', items: stats.replenishment.slice(0, 6) },
    ].filter((item) => item.items.length);
  }

  return [
    { title: '渠道贡献结构', items: (stats.platformAmounts.length ? stats.platformAmounts : stats.channels).slice(0, 6) },
    { title: 'SKU与品类焦点', items: (stats.categoryAmounts.length ? stats.categoryAmounts : stats.categories).slice(0, 6) },
    { title: '库存与趋势信号', items: stats.metrics.slice(0, 6) },
    { title: '补货动作优先级', items: stats.replenishment.slice(0, 6) },
  ].filter((item) => item.items.length);
}
