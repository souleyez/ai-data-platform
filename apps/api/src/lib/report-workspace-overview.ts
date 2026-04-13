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
    `当前文档总量 ${input.totalFiles}，canonical 正文就绪 ${input.canonicalReady}，覆盖率 ${formatPercent(input.canonicalReady, input.totalFiles)}。`,
    `采集链最近失败运行 ${input.failedRuns} 次，error 任务 ${input.errorTasks} 个。`,
    `当前报表输出 ${input.outputs} 份，其中动态输出 ${input.dynamicOutputs} 份。`,
    `当前静态页草稿 ${input.draftOutputs} 份，其中可终稿 ${input.draftReadyOutputs} 份、需补齐 ${input.draftBlockedOutputs} 份、建议继续优化 ${input.draftNeedsAttentionOutputs} 份。`,
  ];
  if (input.warnings.length) {
    bullets.push(...input.warnings.slice(0, 3).map((item) => `${item.title || '告警'}：${item.detail || '需要关注当前运行态。'}`));
  } else {
    bullets.push('当前没有 critical 告警，适合继续完善页面结构、图表和客户可见文案。');
  }
  return bullets;
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
    { label: '文档总量', value: String(totalFiles), note: `数据集 ${libraries.length}` },
    { label: 'Canonical 就绪', value: formatPercent(canonicalReady, totalFiles), note: `${canonicalReady} / ${totalFiles}` },
    { label: '采集任务', value: String(toNumber(operations.capture?.taskSummary?.totalTasks)), note: `已排程 ${toNumber(operations.capture?.taskSummary?.scheduledTasks)}` },
    { label: '报表输出', value: String(totalOutputs), note: `动态 ${dynamicOutputs}` },
    { label: '草稿可终稿', value: String(draftReadyOutputs), note: `需补齐 ${draftBlockedOutputs}` },
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
    optionalModules: ['静态页基准', '审计建议'],
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
        contentDraft: `基于当前项目真实运行数据生成的工作台首页。当前共有 ${totalFiles} 份文档、${totalOutputs} 份报表输出、${toNumber(operations.capture?.taskSummary?.totalTasks)} 个采集任务，当前 canonical 正文就绪率为 ${formatPercent(canonicalReady, totalFiles)}。`,
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
        title: '当前信号',
        purpose: 'Turn raw metrics and warnings into readable bullets.',
        contentDraft: '以下信号基于当前项目运行态自动生成，可在进入终稿前逐条改写或删减。',
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
        title: '静态页基准',
        purpose: 'Show which draft scenarios are currently easiest to finalize.',
        contentDraft: topDraftScenarios.length
          ? '以下场景来自当前真实静态页草稿输出，适合用来判断哪类页面已经可以稳定对外呈现。'
          : '当前还没有足够的静态页草稿积累来形成可靠基准。',
        evidenceRefs: ['operations.output.benchmark'],
        chartIntent: null,
        cards: [],
        bullets: topDraftScenarios.map((item) => {
          const label = String(item.label || '通用静态页').trim();
          const readyRatio = formatPercent(toNumber(item.readyRatio) * 100, 100);
          const blocked = toNumber(item.blocked);
          const total = toNumber(item.total);
          const evidenceCoverage = formatPercent(toNumber(item.averageEvidenceCoverage) * 100, 100);
          return `${label}：草稿 ${total} 份，通过率 ${readyRatio}，证据覆盖 ${evidenceCoverage}，阻塞 ${blocked} 份。`;
        }),
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
        contentDraft: '这部分应在进入终稿前按当前客户或内部读者的关注点微调措辞。',
        evidenceRefs: ['operations.stability.warnings', 'audit.summary'],
        chartIntent: null,
        cards: [],
        bullets: [
          criticalCount > 0 ? `优先处理 ${criticalCount} 条 critical 告警，避免把异常状态直接暴露到客户页面。` : '当前没有 critical 告警，可优先优化文案和视觉表达。',
          warningCount > 0 ? `还有 ${warningCount} 条 warning 告警，建议在终稿前决定是否展示或转化为风险提醒。` : '告警较少，可将更多篇幅用于经营亮点和可执行建议。',
          `审计建议：建议清理 ${toNumber(operations.audit?.summary?.cleanupRecommendedDocuments)} 份文档、${toNumber(operations.audit?.summary?.cleanupRecommendedCaptureTasks)} 个采集任务。`,
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
