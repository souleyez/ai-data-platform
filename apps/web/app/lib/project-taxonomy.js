export const PROJECT_CATEGORIES = [
  { key: 'paper', label: '学术论文', scenarioKey: 'paper' },
  { key: 'technical', label: '技术文档', scenarioKey: 'technical' },
  { key: 'contract', label: '合同协议', scenarioKey: 'contract' },
  { key: 'report', label: '报告简报', scenarioKey: 'report' },
  { key: 'general', label: '通用资料', scenarioKey: 'general' },
  { key: 'other', label: '其他待整理', scenarioKey: 'other' },
];

export const PROJECT_CATEGORY_OPTIONS = PROJECT_CATEGORIES.map(({ key, label }) => ({ key, label }));

export function getProjectCategoryLabel(categoryKey) {
  return PROJECT_CATEGORIES.find((item) => item.key === categoryKey)?.label || '其他待整理';
}
