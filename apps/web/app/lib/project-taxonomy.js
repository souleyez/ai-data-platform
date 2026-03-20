export const PROJECT_CATEGORIES = [
  { key: 'paper', label: '学术论文', scenarioKey: 'paper', type: 'primary' },
  { key: 'contract', label: '合同协议', scenarioKey: 'contract', type: 'primary' },
  { key: 'daily', label: '工作日报', scenarioKey: 'daily', type: 'primary' },
  { key: 'invoice', label: '发票凭据', scenarioKey: 'invoice', type: 'primary' },
  { key: 'order', label: '订单分析', scenarioKey: 'order', type: 'primary' },
  { key: 'service', label: '客服采集', scenarioKey: 'service', type: 'primary' },
  { key: 'inventory', label: '库存监控', scenarioKey: 'inventory', type: 'primary' },
];

export const DEFAULT_PROJECT_CUSTOM_CATEGORIES = [
  { key: 'formula', label: '奶粉配方', scenarioKey: 'formula', parent: 'paper', type: 'default-group' },
  { key: 'brain-health', label: '脑健康', scenarioKey: 'brain-health', parent: 'paper', type: 'default-group' },
  { key: 'gut-health', label: '肠道健康', scenarioKey: 'gut-health', parent: 'paper', type: 'default-group' },
];

export const PROJECT_WORKBENCH_CATEGORIES = [...PROJECT_CATEGORIES];
export const PROJECT_CATEGORY_OPTIONS = PROJECT_WORKBENCH_CATEGORIES.map(({ key, label }) => ({ key, label }));

export function getProjectCategoryLabel(categoryKey) {
  return PROJECT_WORKBENCH_CATEGORIES.find((item) => item.key === categoryKey)?.label || '其他待整理';
}
