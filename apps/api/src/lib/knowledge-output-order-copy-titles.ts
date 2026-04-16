import type { ReportTemplateEnvelope } from './report-center.js';
import type { OrderOutputDeps, OrderPageStats, OrderRequestView } from './knowledge-output-order.js';
import { buildOrderCopyCommonStats, joinOrderAmountLabels } from './knowledge-output-order-copy-support.js';

export function defaultOrderPageSections(view: OrderRequestView) {
  if (view === 'platform') return ['经营总览', '渠道结构', '平台角色与增量来源', 'SKU动销焦点', '库存与补货', '异常波动解释', 'AI综合分析'];
  if (view === 'category') return ['经营总览', '品类梯队', 'SKU集中度', '动销与毛利焦点', '库存与补货', '异常波动解释', 'AI综合分析'];
  if (view === 'stock') return ['经营总览', '库存健康', '高风险SKU', '动销与周转', '补货优先级', '异常波动解释', 'AI综合分析'];
  return ['经营总览', '渠道结构', 'SKU与品类焦点', '库存与补货', '异常波动解释', '行动建议', 'AI综合分析'];
}

export function hasExpectedOrderTitle(
  view: OrderRequestView,
  title: string,
  deps: Pick<OrderOutputDeps, 'normalizeText' | 'containsAny'>,
) {
  const normalized = deps.normalizeText(title);
  if (!normalized) return false;
  if (view === 'platform') return deps.containsAny(normalized, ['platform', 'channel', '渠道', '平台']);
  if (view === 'category') return deps.containsAny(normalized, ['category', 'sku', '品类', '类目', '商品']);
  if (view === 'stock') return deps.containsAny(normalized, ['inventory', 'stock', 'replenishment', 'restock', '库存', '补货', '周转']);
  const hasGenericSignal = deps.containsAny(normalized, ['order', 'cockpit', 'dashboard', '经营', '驾驶舱', '多渠道']);
  const hasMultiChannelSignal = deps.containsAny(normalized, ['multi channel', 'multi-channel', 'omni', '多渠道']);
  const hasSpecializedSignal = deps.containsAny(normalized, [
    'inventory', 'stock', 'replenishment', 'restock', '库存', '补货', '周转',
    'category', 'sku', '品类', '类目', '商品',
    'platform', 'channel', '平台', '渠道',
  ]);
  if (!hasGenericSignal) return false;
  if (hasSpecializedSignal && !hasMultiChannelSignal) return false;
  return true;
}

export function buildOrderPageTitle(
  view: OrderRequestView,
  envelope: ReportTemplateEnvelope | null | undefined,
  deps: Pick<OrderOutputDeps, 'sanitizeText' | 'normalizeText' | 'containsAny'>,
) {
  const envelopeTitle = deps.sanitizeText(envelope?.title);
  if (envelopeTitle && hasExpectedOrderTitle(view, envelopeTitle, deps)) return envelopeTitle;
  if (view === 'platform') return '订单渠道经营驾驶舱';
  if (view === 'category') return '订单品类/SKU经营驾驶舱';
  if (view === 'stock') return '库存与补货驾驶舱';
  return '多渠道订单经营驾驶舱';
}

export function buildOrderPageSummary(
  view: OrderRequestView,
  stats: OrderPageStats,
  deps: Pick<OrderOutputDeps, 'joinRankedLabels'>,
) {
  const {
    channelText,
    categoryText,
    metricText,
    actionText,
    channelAmountText,
    categoryAmountText,
    riskHighlights,
  } = buildOrderCopyCommonStats(stats, deps);
  const riskLead = riskHighlights[0] || '';
  const actionLead = stats.actionHighlights[0] || '';

  if (view === 'platform') {
    return `当前命中 ${stats.documentCount} 份订单/库存资料，${channelAmountText ? `渠道净销售额重心落在 ${channelAmountText}` : `渠道信号主要集中在 ${channelText}`}，建议按渠道角色、增量来源和补货动作组织经营驾驶舱，而不是继续做平台平均化复盘。`;
  }
  if (view === 'category') {
    return `当前命中 ${stats.documentCount} 份经营资料，${categoryAmountText ? `品类销售额重心落在 ${categoryAmountText}` : `主题主要落在 ${categoryText}`}，适合按品类梯队、英雄 SKU 集中度、库存压力和动作优先级组织页面。`;
  }
  if (view === 'stock') {
    return `当前命中 ${stats.documentCount} 份库存相关资料，${actionLead ? `最需要前置处理的动作集中在 ${actionLead}` : `风险与动作信号主要集中在 ${actionText}`}，页面应把库存健康、高风险 SKU 和 72 小时补货优先级放在前面。`;
  }
  return `当前命中 ${stats.documentCount} 份订单/库存资料，${channelAmountText ? `渠道净销售额重心落在 ${channelAmountText}` : `渠道重点在 ${channelText}`}，${categoryAmountText ? `品类销售额重心落在 ${categoryAmountText}` : `SKU/品类焦点在 ${categoryText}`}，${riskLead ? `当前最需要前置处理的是 ${riskLead}` : `经营驾驶舱应围绕 ${metricText} 与 ${actionText} 形成一屏可读的动作视图`}。`;
}

export function buildOrderPageCards(
  view: OrderRequestView,
  stats: OrderPageStats,
  deps: Pick<OrderOutputDeps, 'joinRankedLabels'>,
) {
  const channelText = joinOrderAmountLabels(stats.platformAmounts, 2) || deps.joinRankedLabels(stats.channels, 2) || '多渠道';
  const categoryText = joinOrderAmountLabels(stats.categoryAmounts, 2) || deps.joinRankedLabels(stats.categories, 2) || 'SKU焦点';
  const riskText = stats.riskHighlights[0] || deps.joinRankedLabels(stats.anomalies, 2) || deps.joinRankedLabels(stats.replenishment, 2) || '风险信号';
  const metricText = stats.actionHighlights[0] || deps.joinRankedLabels(stats.metrics, 2) || '库存视角';
  const actionText = stats.actionHighlights[0] || deps.joinRankedLabels(stats.replenishment, 2) || '动作优先级';

  if (view === 'stock') {
    return [
      { label: '库存健康指数', value: `${Math.max(stats.metrics.length, 1)} 项`, note: metricText },
      { label: '断货风险SKU', value: `${Math.max(stats.anomalies.length, 1)} 类`, note: riskText },
      { label: '滞销库存池', value: `${Math.max(stats.categories.length, 1)} 组`, note: categoryText },
      { label: '72小时补货动作', value: `${Math.max(stats.replenishment.length, 1)} 条`, note: actionText },
      { label: '跨仓调拨队列', value: `${Math.max(stats.channels.length, 1)} 个渠道/仓别`, note: channelText },
    ];
  }

  if (view === 'category') {
    return [
      { label: '核心品类GMV', value: `${Math.max(stats.categories.length, 1)} 组`, note: categoryText },
      { label: '英雄SKU贡献', value: `${Math.max(stats.categories.length, 1)} 个焦点`, note: categoryText },
      { label: '尾部风险SKU', value: `${Math.max(stats.anomalies.length, 1)} 类`, note: riskText },
      { label: '库存压力', value: `${Math.max(stats.metrics.length, 1)} 项`, note: metricText },
      { label: '动作优先级', value: `${Math.max(stats.replenishment.length, 1)} 条`, note: actionText },
    ];
  }

  return [
    { label: '渠道GMV', value: `${Math.max(stats.channels.length, 1)} 渠道`, note: channelText },
    { label: '动销SKU', value: `${Math.max(stats.categories.length, 1)} 组焦点`, note: categoryText },
    { label: '高风险SKU', value: `${Math.max(stats.anomalies.length, 1)} 类`, note: riskText },
    { label: '库存健康', value: `${Math.max(stats.metrics.length, 1)} 项`, note: metricText },
    { label: '补货优先级', value: `${Math.max(stats.replenishment.length, 1)} 条`, note: actionText },
  ];
}
