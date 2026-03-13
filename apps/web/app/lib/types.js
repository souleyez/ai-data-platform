export const NAV_ITEMS = ['智能问答', '文档中心', '数据源管理', '报表中心', '审计日志'];

export const QUICK_ACTIONS = [
  { label: '订单趋势分析', prompt: '请做订单趋势分析' },
  { label: '合同风险归纳', prompt: '请归纳合同风险' },
  { label: '技术文档汇总', prompt: '请汇总技术文档主题' },
  { label: '生成周报', prompt: '请生成本周经营周报' },
];

export function formatDocumentBusinessResult(item) {
  if (!item) return '-';
  if (item.category === 'contract') return `风险等级：${item.riskLevel || 'unknown'}`;
  if (item.category === 'technical' || item.category === 'paper') return `主题：${(item.topicTags || []).join('、') || '未识别'}`;
  return item.ext || '-';
}
