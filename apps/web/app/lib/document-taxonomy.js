export const PRIMARY_DOCUMENT_CATEGORIES = [
  { key: 'paper', label: '学术论文' },
  { key: 'technical', label: '技术文档' },
  { key: 'contract', label: '合同协议' },
  { key: 'report', label: '报告简报' },
  { key: 'general', label: '通用资料' },
  { key: 'other', label: '其他待整理' },
];

export const DEFAULT_CUSTOM_DOCUMENT_CATEGORIES = [
  { key: 'daily', label: '工作日报', parent: 'report' },
  { key: 'invoice', label: '发票凭据', parent: 'general' },
  { key: 'order', label: '订单分析', parent: 'general' },
  { key: 'service', label: '客服采集', parent: 'general' },
  { key: 'inventory', label: '库存监控', parent: 'general' },
];

export function getPrimaryCategoryLabel(key) {
  return PRIMARY_DOCUMENT_CATEGORIES.find((item) => item.key === key)?.label || key || '未分类';
}
