import type { DraftPolishContext } from './report-draft-copy-polish-types.js';
import { ensureSentence, normalizeText } from './report-draft-copy-polish-utils.js';

function buildMetricCardFallbackNote(
  layoutVariant: DraftPolishContext['layoutVariant'],
  label: string,
) {
  const normalizedLabel = normalizeText(label).toLowerCase();
  if (layoutVariant === 'operations-cockpit') {
    if (/订单|gmv|销售|收入|营收/.test(normalizedLabel)) return '建议作为首屏经营结果信号展示。';
    if (/库存|补货|周转/.test(normalizedLabel)) return '适合与风险和补货动作一起看。';
    if (/退款|退货|转化|复购/.test(normalizedLabel)) return '适合作为经营质量信号展示。';
    return '建议作为首屏经营信号展示。';
  }
  if (layoutVariant === 'solution-overview') {
    if (/场景|行业|客户/.test(normalizedLabel)) return '适合放在方案首页说明适用范围。';
    if (/模块|能力|覆盖/.test(normalizedLabel)) return '适合作为方案亮点数字展示。';
    return '建议作为方案首页亮点数字展示。';
  }
  if (layoutVariant === 'talent-showcase') {
    if (/项目|案例/.test(normalizedLabel)) return '适合放在人物概览区快速建立可信度。';
    if (/年限|经验|履历/.test(normalizedLabel)) return '适合作为人物概览的基础信息。';
    return '适合作为人物概览的首屏信息。';
  }
  if (layoutVariant === 'risk-brief') return '适合作为风险摘要页的辅助提示信息。';
  if (layoutVariant === 'research-brief') return '适合作为研究摘要页的辅助结论信息。';
  return '';
}

function looksLikeWeakCardNote(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) return true;
  return /^(样例|示例|待补充|暂无|说明|备注)$/u.test(normalized) || normalized.length <= 4;
}

export function polishMetricGridCards(
  cards: Array<{ label?: string; value?: string; note?: string }>,
  layoutVariant: DraftPolishContext['layoutVariant'],
) {
  return (Array.isArray(cards) ? cards : []).map((card, index) => {
    const label = normalizeText(card?.label) || `指标 ${index + 1}`;
    const value = normalizeText(card?.value);
    const note = normalizeText(card?.note);
    const fallbackNote = buildMetricCardFallbackNote(layoutVariant, label);
    return {
      ...card,
      label,
      value,
      note: looksLikeWeakCardNote(note) ? (fallbackNote || note) : ensureSentence(note),
    };
  });
}
