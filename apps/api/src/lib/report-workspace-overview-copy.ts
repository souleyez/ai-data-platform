import { formatWorkspaceOverviewPercent } from './report-workspace-overview-support.js';

export function buildWorkspaceOverviewBullets(input: {
  canonicalReady: number;
  totalFiles: number;
  failedRuns: number;
  errorTasks: number;
  outputs: number;
  dynamicOutputs: number;
  draftOutputs: number;
  draftReadyOutputs: number;
  draftBlockedOutputs: number;
  draftNeedsAttentionOutputs: number;
  warnings: Array<{ title?: string; detail?: string }>;
}) {
  const bullets = [
    `当前已沉淀 ${input.totalFiles} 份文档，核心正文就绪 ${input.canonicalReady} 份，内容覆盖率 ${formatWorkspaceOverviewPercent(input.canonicalReady, input.totalFiles)}。`,
    `采集与入库链已形成持续更新能力，当前动态报表 ${input.dynamicOutputs} 份，可直接支撑首页与经营页的内容供给。`,
    `当前累计输出 ${input.outputs} 份报表，其中静态页草稿 ${input.draftOutputs} 份，可终稿 ${input.draftReadyOutputs} 份。`,
  ];
  if (input.warnings.length) {
    bullets.push('当前仍有少量运行侧信号需要继续收口，建议在进入终稿前统一文案和页面重点。');
  } else {
    bullets.push('当前运行态整体稳定，适合把页面重点放在数据价值、交付样板和客户可见表达上。');
  }
  return bullets;
}

export function buildWorkspaceShowcaseScenarioBullets(scenarios: Array<{ label?: string; readyRatio?: number; total?: number }>) {
  return scenarios.map((item) => {
    const label = String(item.label || '通用静态页').trim();
    const total = Number(item.total || 0);
    const readyRatio = Number(item.readyRatio || 0);
    if (readyRatio >= 0.75) {
      return `${label}：当前已积累 ${total} 份草稿，可优先沉淀为稳定的客户展示样板。`;
    }
    if (readyRatio >= 0.45) {
      return `${label}：当前已有 ${total} 份草稿，适合继续统一结构和重点文案。`;
    }
    return `${label}：当前已有 ${total} 份草稿，建议继续补强内容密度和模块表达后再推广。`;
  });
}
