export const PRIMARY_DOCUMENT_CATEGORIES = [
  { key: 'paper', label: '学术论文' },
  { key: 'contract', label: '合同协议' },
  { key: 'daily', label: '工作日报' },
  { key: 'invoice', label: '发票凭据' },
  { key: 'order', label: '订单分析' },
  { key: 'service', label: '客服采集' },
  { key: 'inventory', label: '库存监控' },
];

export const DEFAULT_CUSTOM_DOCUMENT_CATEGORIES = [
  { key: 'formula', label: '奶粉配方', parent: 'paper', keywords: ['奶粉配方', '配方', '乳粉'] },
  { key: 'brain-health', label: '脑健康', parent: 'paper', keywords: ['脑健康', 'brain', '认知', '阿尔茨海默'] },
  { key: 'gut-health', label: '肠道健康', parent: 'paper', keywords: ['肠道健康', 'gut', '肠道', '菌群'] },
];

export function getPrimaryCategoryLabel(key) {
  return PRIMARY_DOCUMENT_CATEGORIES.find((item) => item.key === key)?.label || key || '未分类';
}
