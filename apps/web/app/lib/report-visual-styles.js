export const REPORT_VISUAL_STYLE_OPTIONS = [
  {
    value: 'signal-board',
    label: 'Signal Board',
    description: '偏仪表盘和运营工作台，适合项目总览、经营页、状态页。',
    chips: ['运营', '指标', '工作台'],
    previewClassName: 'is-signal-board',
  },
  {
    value: 'midnight-glass',
    label: 'Midnight Glass',
    description: '偏深色高级感，适合客户展示和重点陈述型首页。',
    chips: ['深色', '高级感', '客户展示'],
    previewClassName: 'is-midnight-glass',
  },
  {
    value: 'editorial-brief',
    label: 'Editorial Brief',
    description: '偏编辑型和咨询简报，适合研究、风险、分析说明页。',
    chips: ['咨询简报', '研究', '叙事'],
    previewClassName: 'is-editorial-brief',
  },
  {
    value: 'minimal-canvas',
    label: 'Minimal Canvas',
    description: '偏简洁留白，适合人才、方案、作品型页面。',
    chips: ['留白', '方案', '作品'],
    previewClassName: 'is-minimal-canvas',
  },
];

export function getReportVisualStyleMeta(style) {
  return REPORT_VISUAL_STYLE_OPTIONS.find((option) => option.value === style) || REPORT_VISUAL_STYLE_OPTIONS[0];
}
