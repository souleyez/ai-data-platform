import { UNGROUPED_LIBRARY_KEY } from './document-libraries.js';
import { loadDocumentsOverviewRoutePayload } from './document-route-read-operations.js';
import { loadOperationsOverviewPayload } from './operations-overview.js';
import { loadReportCenterReadState, type ReportOutputDraft, type ReportVisualStylePreset } from './report-center.js';

function buildModuleId(key: string, index: number) {
  return `workspace-overview-${key}-${index + 1}`;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPercent(numerator: number, denominator: number) {
  if (!denominator) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function chooseOverviewGroupKey(preferredKey: string | undefined, libraries: Array<{ key?: string }>) {
  const keys = libraries.map((item) => String(item?.key || '').trim()).filter(Boolean);
  if (preferredKey && keys.includes(preferredKey)) return preferredKey;
  return keys.find((key) => key !== UNGROUPED_LIBRARY_KEY) || keys[0] || '';
}

function pickTopLibraries(libraries: Array<{ key?: string; label?: string; documentCount?: number }>, limit = 6) {
  return [...libraries]
    .filter((item) => item?.key !== UNGROUPED_LIBRARY_KEY)
    .sort((left, right) => {
      const countDiff = toNumber(right?.documentCount) - toNumber(left?.documentCount);
      if (countDiff !== 0) return countDiff;
      return String(left?.label || left?.key || '').localeCompare(String(right?.label || right?.key || ''), 'zh-CN');
    })
    .slice(0, limit);
}

function pickTopDraftScenarios(scenarios: Array<{ label?: string; readyRatio?: number; blocked?: number; total?: number; averageEvidenceCoverage?: number }>, limit = 3) {
  return [...scenarios]
    .filter((item) => toNumber(item?.total) > 0)
    .sort((left, right) => {
      const ratioDiff = toNumber(right?.readyRatio) - toNumber(left?.readyRatio);
      if (ratioDiff !== 0) return ratioDiff;
      const blockedDiff = toNumber(left?.blocked) - toNumber(right?.blocked);
      if (blockedDiff !== 0) return blockedDiff;
      return toNumber(right?.total) - toNumber(left?.total);
    })
    .slice(0, limit);
}

function buildOverviewBullets(input: {
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
    `当前已沉淀 ${input.totalFiles} 份文档，核心正文就绪 ${input.canonicalReady} 份，内容覆盖率 ${formatPercent(input.canonicalReady, input.totalFiles)}。`,
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

function buildShowcaseScenarioBullets(scenarios: Array<{ label?: string; readyRatio?: number; total?: number }>) {
  return scenarios.map((item) => {
    const label = String(item.label || '通用静态页').trim();
    const total = toNumber(item.total);
    const readyRatio = toNumber(item.readyRatio);
    if (readyRatio >= 0.75) {
      return `${label}：当前已积累 ${total} 份草稿，可优先沉淀为稳定的客户展示样板。`;
    }
    if (readyRatio >= 0.45) {
      return `${label}：当前已有 ${total} 份草稿，适合继续统一结构和重点文案。`;
    }
    return `${label}：当前已有 ${total} 份草稿，建议继续补强内容密度和模块表达后再推广。`;
  });
}

function normalizeVisualStyle(value: unknown): ReportVisualStylePreset | undefined {
  const normalized = String(value || '').trim();
  if (
    normalized === 'signal-board'
    || normalized === 'midnight-glass'
    || normalized === 'editorial-brief'
    || normalized === 'minimal-canvas'
  ) {
    return normalized;
  }
  return undefined;
}

export async function buildWorkspaceOverviewDraftPayload(options?: { groupKey?: string; visualStyle?: ReportVisualStylePreset | string }) {
  const [operations, documentsOverview, reportState] = await Promise.all([
    loadOperationsOverviewPayload(),
    loadDocumentsOverviewRoutePayload(),
    loadReportCenterReadState(),
  ]);

  const libraries = Array.isArray(documentsOverview.libraries) ? documentsOverview.libraries : [];
  const groupKey = chooseOverviewGroupKey(options?.groupKey, libraries);
  if (!groupKey) {
    throw new Error('at least one dataset group is required to build a workspace overview page');
  }

  const totalFiles = toNumber(operations.parse?.scanSummary?.totalFiles);
  const canonicalReady = toNumber(operations.parse?.markdownSummary?.canonicalReady);
  const fallbackCount = Math.max(0, totalFiles - canonicalReady);
  const failedRuns = toNumber(operations.capture?.runSummary?.failedRuns);
  const runningRuns = toNumber(operations.capture?.runSummary?.runningRuns);
  const partialRuns = toNumber(operations.capture?.runSummary?.partialRuns);
  const successRuns = toNumber(operations.capture?.runSummary?.successRuns);
  const totalOutputs = toNumber(operations.output?.summary?.outputs);
  const dynamicOutputs = toNumber(operations.output?.summary?.dynamicOutputs);
  const draftOutputs = toNumber(operations.output?.summary?.draftOutputs);
  const draftReadyOutputs = toNumber(operations.output?.summary?.draftReadyOutputs);
  const draftBlockedOutputs = toNumber(operations.output?.summary?.draftBlockedOutputs);
  const draftNeedsAttentionOutputs = toNumber(operations.output?.summary?.draftNeedsAttentionOutputs);
  const staleDynamicOutputs = toNumber(operations.output?.summary?.staleDynamicOutputs);
  const draftBenchmark = operations.output?.benchmark || { totals: { drafts: 0, ready: 0, needsAttention: 0, blocked: 0, readyRatio: 0 }, scenarios: [] };
  const warningCount = toNumber(operations.stability?.summary?.warningCount);
  const criticalCount = toNumber(operations.stability?.summary?.criticalCount);
  const topLibraries = pickTopLibraries(libraries);
  const topDraftScenarios = pickTopDraftScenarios(Array.isArray(draftBenchmark?.scenarios) ? draftBenchmark.scenarios : []);
  const selectedVisualStyle = normalizeVisualStyle(options?.visualStyle) || 'signal-board';
  const outputStatusCounts = (reportState.outputs || []).reduce<Record<string, number>>((acc, item) => {
    const key = String(item?.status || 'unknown').trim() || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const cards = [
    { label: '资料规模', value: String(totalFiles), note: `覆盖 ${libraries.length} 个数据集` },
    { label: '正文就绪', value: formatPercent(canonicalReady, totalFiles), note: `${canonicalReady} / ${totalFiles} 份可直接供页` },
    { label: '采集任务', value: String(toNumber(operations.capture?.taskSummary?.totalTasks)), note: `已排程 ${toNumber(operations.capture?.taskSummary?.scheduledTasks)} 个来源` },
    { label: '页面产出', value: String(totalOutputs), note: `动态页面 ${dynamicOutputs} 份` },
    { label: '可终稿草稿', value: String(draftReadyOutputs), note: `待润色 ${draftNeedsAttentionOutputs} 份` },
  ];

  const warningBullets = buildOverviewBullets({
    canonicalReady,
    totalFiles,
    failedRuns,
    errorTasks: toNumber(operations.capture?.taskSummary?.errorTasks),
    outputs: totalOutputs,
    dynamicOutputs,
    draftOutputs,
    draftReadyOutputs,
    draftBlockedOutputs,
    draftNeedsAttentionOutputs,
    warnings: Array.isArray(operations.stability?.warnings) ? operations.stability.warnings : [],
  });

  const draft: ReportOutputDraft = {
    reviewStatus: 'draft_generated',
    version: 1,
    audience: 'internal operators',
    objective: 'Summarize the current AI Data Platform state as a client-readable workspace overview homepage.',
    layoutVariant: 'operations-cockpit',
    visualStyle: selectedVisualStyle,
    mustHaveModules: ['项目摘要', '关键指标', '数据集分布', '解析链完成度', '采集运行状态', '报表状态', '后续动作'],
    optionalModules: ['交付样板'],
    evidencePriority: ['文档量', '解析完成度', '采集运行', '报表输出'],
    audienceTone: 'operator-facing',
    riskNotes: (operations.stability?.warnings || []).slice(0, 5).map((item) => `${item.title || '告警'}：${item.detail || ''}`),
    lastEditedAt: new Date().toISOString(),
    approvedAt: '',
    modules: [
      {
        moduleId: buildModuleId('hero', 0),
        moduleType: 'hero',
        title: 'AI Data Platform 工作台首页',
        purpose: 'Open with a concise summary of the current project state.',
        contentDraft: `当前平台已形成从采集、解析到页面生成的完整交付链。基于现有 ${totalFiles} 份文档、${totalOutputs} 份报表输出和持续运行的数据源任务，可以直接生成项目总览、经营页和方案页等客户可见页面。`,
        evidenceRefs: ['operations.parse.scanSummary', 'operations.output.summary', 'operations.capture.taskSummary'],
        chartIntent: null,
        cards: [],
        bullets: [],
        enabled: true,
        status: 'generated',
        order: 0,
        layoutType: 'hero',
      },
      {
        moduleId: buildModuleId('metrics', 1),
        moduleType: 'metric-grid',
        title: '关键指标',
        purpose: 'Show the four most important cross-project metrics first.',
        contentDraft: '',
        evidenceRefs: ['operations.parse.markdownSummary', 'operations.capture.taskSummary', 'operations.output.summary'],
        chartIntent: null,
        cards,
        bullets: [],
        enabled: true,
        status: 'generated',
        order: 1,
        layoutType: 'metric-grid',
      },
      {
        moduleId: buildModuleId('signals', 2),
        moduleType: 'insight-list',
        title: '当前进展',
        purpose: 'Turn raw metrics and warnings into readable bullets.',
        contentDraft: '以下要点基于当前项目真实运行数据整理，可直接作为首页摘要初稿继续精修。',
        evidenceRefs: ['operations.stability', 'operations.capture.runSummary', 'operations.output.summary'],
        chartIntent: null,
        cards: [],
        bullets: warningBullets,
        enabled: true,
        status: 'generated',
        order: 2,
        layoutType: 'insight-list',
      },
      {
        moduleId: buildModuleId('library-focus', 3),
        moduleType: 'comparison',
        title: '重点数据集',
        purpose: 'Name the dataset groups that dominate the current workspace state.',
        contentDraft: topLibraries.length
          ? `当前数据量最大的 ${Math.min(topLibraries.length, 3)} 个数据集已经决定了首页叙事重心。终稿中应优先保留这些分组的信号和图表。`
          : '当前没有明显的数据集主导项，终稿中可以按业务优先级自行重排模块。',
        evidenceRefs: ['documents.overview.libraries'],
        chartIntent: null,
        cards: [],
        bullets: topLibraries.slice(0, 5).map((item) => {
          const label = String(item.label || item.key || '').trim() || '未命名数据集';
          const count = toNumber(item.documentCount);
          return `${label}：${count} 份文档，适合作为当前首页的重点信号来源。`;
        }),
        enabled: true,
        status: 'generated',
        order: 3,
        layoutType: 'comparison',
      },
      {
        moduleId: buildModuleId('library-chart', 4),
        moduleType: 'chart',
        title: '数据集文档分布',
        purpose: 'Show the heaviest dataset groups first.',
        contentDraft: '',
        evidenceRefs: ['documents.overview.libraries'],
        chartIntent: {
          title: '数据集文档分布',
          preferredChartType: 'horizontal-bar',
          items: topLibraries.map((item) => ({
            label: String(item.label || item.key || '').trim(),
            value: toNumber(item.documentCount),
          })),
        },
        cards: [],
        bullets: [],
        enabled: true,
        status: 'generated',
        order: 4,
        layoutType: 'chart',
      },
      {
        moduleId: buildModuleId('canonical-chart', 5),
        moduleType: 'chart',
        title: '解析链完成度',
        purpose: 'Show how much of the corpus is canonical-ready versus fallback.',
        contentDraft: '',
        evidenceRefs: ['operations.parse.markdownSummary'],
        chartIntent: {
          title: '解析链完成度',
          preferredChartType: 'bar',
          items: [
            { label: '就绪', value: canonicalReady },
            { label: '回退正文', value: fallbackCount },
            { label: 'Markdown 失败', value: toNumber(operations.parse?.markdownSummary?.markdownFailed) },
          ],
        },
        cards: [],
        bullets: [],
        enabled: true,
        status: 'generated',
        order: 5,
        layoutType: 'chart',
      },
      {
        moduleId: buildModuleId('capture-chart', 6),
        moduleType: 'chart',
        title: '采集运行状态',
        purpose: 'Summarize recent datasource run health.',
        contentDraft: '',
        evidenceRefs: ['operations.capture.runSummary'],
        chartIntent: {
          title: '采集运行状态',
          preferredChartType: 'bar',
          items: [
            { label: '成功', value: successRuns },
            { label: '部分成功', value: partialRuns },
            { label: '失败', value: failedRuns },
            { label: '运行中', value: runningRuns },
          ],
        },
        cards: [],
        bullets: [],
        enabled: true,
        status: 'generated',
        order: 6,
        layoutType: 'chart',
      },
      {
        moduleId: buildModuleId('output-chart', 7),
        moduleType: 'chart',
        title: '报表状态',
        purpose: 'Show draft and ready output mix from the report center.',
        contentDraft: '',
        evidenceRefs: ['report-center.outputs'],
        chartIntent: {
          title: '报表状态',
          preferredChartType: 'bar',
          items: [
            { label: '终稿 ready', value: toNumber(outputStatusCounts.ready) },
            { label: '草稿中', value: toNumber(outputStatusCounts.draft_generated) + toNumber(outputStatusCounts.draft_reviewing) + toNumber(outputStatusCounts.final_generating) },
            { label: '失败', value: toNumber(outputStatusCounts.failed) },
            { label: '动态陈旧', value: staleDynamicOutputs },
          ],
        },
        cards: [],
        bullets: [],
        enabled: true,
        status: 'generated',
        order: 7,
        layoutType: 'chart',
      },
      {
        moduleId: buildModuleId('draft-benchmark', 8),
        moduleType: 'comparison',
        title: '交付样板',
        purpose: 'Name the page scenarios that are closest to being reusable customer-facing templates.',
        contentDraft: topDraftScenarios.length
          ? '以下页面类型已经形成可复用的初稿基础，适合作为后续客户展示与项目交付的样板继续沉淀。'
          : '当前还没有足够的静态页草稿积累来形成稳定样板，可先从首页总览和经营页开始沉淀。',
        evidenceRefs: ['operations.output.benchmark'],
        chartIntent: null,
        cards: [],
        bullets: buildShowcaseScenarioBullets(topDraftScenarios),
        enabled: true,
        status: 'generated',
        order: 8,
        layoutType: 'comparison',
      },
      {
        moduleId: buildModuleId('cta', 9),
        moduleType: 'cta',
        title: '下一步动作',
        purpose: 'Convert system signals into concrete operator actions.',
        contentDraft: '建议先把当前首页总览、经营页和方案页打磨成稳定样板，再继续扩展到更多静态页场景。',
        evidenceRefs: ['operations.stability.warnings', 'audit.summary'],
        chartIntent: null,
        cards: [],
        bullets: [
          topLibraries[0]
            ? `优先围绕「${String(topLibraries[0]?.label || topLibraries[0]?.key || '').trim()}」补强首页信号和图表，先形成一个足够稳定的样板页面。`
            : '优先围绕当前重点数据集补强首页信号和图表，先形成一个足够稳定的样板页面。',
          topDraftScenarios[0]
            ? `建议先把「${String(topDraftScenarios[0]?.label || '当前场景').trim()}」沉淀成标准页面结构，再复制到相近场景。`
            : '建议先把首页总览和经营页沉淀成标准页面结构，再复制到相近场景。',
          criticalCount > 0 || warningCount > 0
            ? '当前仍有少量运行信号需要继续收口，终稿前建议统一页面重点和风险表述。'
            : '当前运行态整体稳定，可将更多篇幅用于数据价值表达和行动建议。',
        ],
        enabled: true,
        status: 'generated',
        order: 9,
        layoutType: 'cta',
      },
    ],
  };

  return {
    groupKey,
    title: '项目工作台首页',
    summary: '已基于当前项目真实数据生成工作台首页草稿，可继续模块审改后进入终稿。',
    libraries: libraries.map((item) => ({
      key: String(item?.key || '').trim(),
      label: String(item?.label || '').trim(),
    })).filter((item) => item.key || item.label),
    draft,
  };
}
