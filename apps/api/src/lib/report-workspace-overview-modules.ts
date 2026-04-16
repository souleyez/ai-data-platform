import type { ReportOutputDraft } from './report-center.js';
import { buildWorkspaceShowcaseScenarioBullets } from './report-workspace-overview-copy.js';
import type { WorkspaceOverviewMetrics } from './report-workspace-overview-metrics.js';
import { buildWorkspaceOverviewModuleId, toWorkspaceOverviewNumber } from './report-workspace-overview-support.js';

export function buildWorkspaceOverviewDraft(input: {
  metrics: WorkspaceOverviewMetrics;
  visualStyle: ReportOutputDraft['visualStyle'];
}) : ReportOutputDraft {
  const { metrics, visualStyle } = input;
  return {
    reviewStatus: 'draft_generated',
    version: 1,
    audience: 'internal operators',
    objective: 'Summarize the current AI Data Platform state as a client-readable workspace overview homepage.',
    layoutVariant: 'operations-cockpit',
    visualStyle,
    mustHaveModules: ['项目摘要', '关键指标', '数据集分布', '解析链完成度', '采集运行状态', '报表状态', '后续动作'],
    optionalModules: ['交付样板'],
    evidencePriority: ['文档量', '解析完成度', '采集运行', '报表输出'],
    audienceTone: 'operator-facing',
    riskNotes: metrics.riskNotes,
    lastEditedAt: new Date().toISOString(),
    approvedAt: '',
    modules: [
      {
        moduleId: buildWorkspaceOverviewModuleId('hero', 0),
        moduleType: 'hero',
        title: 'AI Data Platform 工作台首页',
        purpose: 'Open with a concise summary of the current project state.',
        contentDraft: `当前平台已形成从采集、解析到页面生成的完整交付链。基于现有 ${metrics.totalFiles} 份文档、${metrics.totalOutputs} 份报表输出和持续运行的数据源任务，可以直接生成项目总览、经营页和方案页等客户可见页面。`,
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
        moduleId: buildWorkspaceOverviewModuleId('metrics', 1),
        moduleType: 'metric-grid',
        title: '关键指标',
        purpose: 'Show the four most important cross-project metrics first.',
        contentDraft: '',
        evidenceRefs: ['operations.parse.markdownSummary', 'operations.capture.taskSummary', 'operations.output.summary'],
        chartIntent: null,
        cards: metrics.cards,
        bullets: [],
        enabled: true,
        status: 'generated',
        order: 1,
        layoutType: 'metric-grid',
      },
      {
        moduleId: buildWorkspaceOverviewModuleId('signals', 2),
        moduleType: 'insight-list',
        title: '当前进展',
        purpose: 'Turn raw metrics and warnings into readable bullets.',
        contentDraft: '以下要点基于当前项目真实运行数据整理，可直接作为首页摘要初稿继续精修。',
        evidenceRefs: ['operations.stability', 'operations.capture.runSummary', 'operations.output.summary'],
        chartIntent: null,
        cards: [],
        bullets: metrics.warningBullets,
        enabled: true,
        status: 'generated',
        order: 2,
        layoutType: 'insight-list',
      },
      {
        moduleId: buildWorkspaceOverviewModuleId('library-focus', 3),
        moduleType: 'comparison',
        title: '重点数据集',
        purpose: 'Name the dataset groups that dominate the current workspace state.',
        contentDraft: metrics.topLibraries.length
          ? `当前数据量最大的 ${Math.min(metrics.topLibraries.length, 3)} 个数据集已经决定了首页叙事重心。终稿中应优先保留这些分组的信号和图表。`
          : '当前没有明显的数据集主导项，终稿中可以按业务优先级自行重排模块。',
        evidenceRefs: ['documents.overview.libraries'],
        chartIntent: null,
        cards: [],
        bullets: metrics.topLibraries.slice(0, 5).map((item) => {
          const label = String(item.label || item.key || '').trim() || '未命名数据集';
          const count = toWorkspaceOverviewNumber(item.documentCount);
          return `${label}：${count} 份文档，适合作为当前首页的重点信号来源。`;
        }),
        enabled: true,
        status: 'generated',
        order: 3,
        layoutType: 'comparison',
      },
      {
        moduleId: buildWorkspaceOverviewModuleId('library-chart', 4),
        moduleType: 'chart',
        title: '数据集文档分布',
        purpose: 'Show the heaviest dataset groups first.',
        contentDraft: '',
        evidenceRefs: ['documents.overview.libraries'],
        chartIntent: {
          title: '数据集文档分布',
          preferredChartType: 'horizontal-bar',
          items: metrics.topLibraries.map((item) => ({
            label: String(item.label || item.key || '').trim(),
            value: toWorkspaceOverviewNumber(item.documentCount),
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
        moduleId: buildWorkspaceOverviewModuleId('canonical-chart', 5),
        moduleType: 'chart',
        title: '解析链完成度',
        purpose: 'Show how much of the corpus is canonical-ready versus fallback.',
        contentDraft: '',
        evidenceRefs: ['operations.parse.markdownSummary'],
        chartIntent: {
          title: '解析链完成度',
          preferredChartType: 'bar',
          items: [
            { label: '就绪', value: metrics.canonicalReady },
            { label: '回退正文', value: metrics.fallbackCount },
            { label: 'Markdown 失败', value: metrics.markdownFailed },
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
        moduleId: buildWorkspaceOverviewModuleId('capture-chart', 6),
        moduleType: 'chart',
        title: '采集运行状态',
        purpose: 'Summarize recent datasource run health.',
        contentDraft: '',
        evidenceRefs: ['operations.capture.runSummary'],
        chartIntent: {
          title: '采集运行状态',
          preferredChartType: 'bar',
          items: [
            { label: '成功', value: metrics.successRuns },
            { label: '部分成功', value: metrics.partialRuns },
            { label: '失败', value: metrics.failedRuns },
            { label: '运行中', value: metrics.runningRuns },
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
        moduleId: buildWorkspaceOverviewModuleId('output-chart', 7),
        moduleType: 'chart',
        title: '报表状态',
        purpose: 'Show draft and ready output mix from the report center.',
        contentDraft: '',
        evidenceRefs: ['report-center.outputs'],
        chartIntent: {
          title: '报表状态',
          preferredChartType: 'bar',
          items: [
            { label: '终稿 ready', value: toWorkspaceOverviewNumber(metrics.outputStatusCounts.ready) },
            { label: '草稿中', value: toWorkspaceOverviewNumber(metrics.outputStatusCounts.draft_generated) + toWorkspaceOverviewNumber(metrics.outputStatusCounts.draft_reviewing) + toWorkspaceOverviewNumber(metrics.outputStatusCounts.final_generating) },
            { label: '失败', value: toWorkspaceOverviewNumber(metrics.outputStatusCounts.failed) },
            { label: '动态陈旧', value: metrics.staleDynamicOutputs },
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
        moduleId: buildWorkspaceOverviewModuleId('draft-benchmark', 8),
        moduleType: 'comparison',
        title: '交付样板',
        purpose: 'Name the page scenarios that are closest to being reusable customer-facing templates.',
        contentDraft: metrics.topDraftScenarios.length
          ? '以下页面类型已经形成可复用的初稿基础，适合作为后续客户展示与项目交付的样板继续沉淀。'
          : '当前还没有足够的静态页草稿积累来形成稳定样板，可先从首页总览和经营页开始沉淀。',
        evidenceRefs: ['operations.output.benchmark'],
        chartIntent: null,
        cards: [],
        bullets: buildWorkspaceShowcaseScenarioBullets(metrics.topDraftScenarios),
        enabled: true,
        status: 'generated',
        order: 8,
        layoutType: 'comparison',
      },
      {
        moduleId: buildWorkspaceOverviewModuleId('cta', 9),
        moduleType: 'cta',
        title: '下一步动作',
        purpose: 'Convert system signals into concrete operator actions.',
        contentDraft: '建议先把当前首页总览、经营页和方案页打磨成稳定样板，再继续扩展到更多静态页场景。',
        evidenceRefs: ['operations.stability.warnings', 'audit.summary'],
        chartIntent: null,
        cards: [],
        bullets: [
          metrics.topLibraries[0]
            ? `优先围绕「${String(metrics.topLibraries[0]?.label || metrics.topLibraries[0]?.key || '').trim()}」补强首页信号和图表，先形成一个足够稳定的样板页面。`
            : '优先围绕当前重点数据集补强首页信号和图表，先形成一个足够稳定的样板页面。',
          metrics.topDraftScenarios[0]
            ? `建议先把「${String(metrics.topDraftScenarios[0]?.label || '当前场景').trim()}」沉淀成标准页面结构，再复制到相近场景。`
            : '建议先把首页总览和经营页沉淀成标准页面结构，再复制到相近场景。',
          metrics.criticalCount > 0 || metrics.warningCount > 0
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
}
