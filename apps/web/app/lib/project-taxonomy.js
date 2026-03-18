export const PROJECT_CATEGORIES = [
  { key: 'paper', label: '学术论文', scenarioKey: 'paper', type: 'primary' },
  { key: 'technical', label: '技术文档', scenarioKey: 'technical', type: 'primary' },
  { key: 'contract', label: '合同协议', scenarioKey: 'contract', type: 'primary' },
  { key: 'report', label: '报告简报', scenarioKey: 'report', type: 'primary' },
  { key: 'general', label: '通用资料', scenarioKey: 'general', type: 'primary' },
  { key: 'other', label: '其他待整理', scenarioKey: 'other', type: 'primary' },
];

export const DEFAULT_PROJECT_CUSTOM_CATEGORIES = [
  { key: 'daily', label: '工作日报', scenarioKey: 'daily', parent: 'report', type: 'default-custom' },
  { key: 'invoice', label: '发票凭据', scenarioKey: 'invoice', parent: 'general', type: 'default-custom' },
  { key: 'order', label: '订单分析', scenarioKey: 'order', parent: 'general', type: 'default-custom' },
  { key: 'service', label: '客服采集', scenarioKey: 'service', parent: 'general', type: 'default-custom' },
  { key: 'inventory', label: '库存监控', scenarioKey: 'inventory', parent: 'general', type: 'default-custom' },
];

export const PROJECT_WORKBENCH_CATEGORIES = [...PROJECT_CATEGORIES, ...DEFAULT_PROJECT_CUSTOM_CATEGORIES];
export const PROJECT_CATEGORY_OPTIONS = PROJECT_WORKBENCH_CATEGORIES.map(({ key, label }) => ({ key, label }));

export function getProjectCategoryLabel(categoryKey) {
  return PROJECT_WORKBENCH_CATEGORIES.find((item) => item.key === categoryKey)?.label || '其他待整理';
}
