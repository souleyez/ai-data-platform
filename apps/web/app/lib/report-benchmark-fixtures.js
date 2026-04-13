function buildModule(module) {
  return {
    evidenceRefs: [],
    chartIntent: null,
    cards: [],
    bullets: [],
    enabled: true,
    status: 'generated',
    layoutType: module.moduleType,
    ...module,
  };
}

export function buildOperationsDraftBenchmarkItem() {
  return {
    id: 'benchmark-operations-draft',
    title: '经营驾驶舱 Benchmark',
    createdAt: '2026-04-13T12:00:00.000Z',
    kind: 'page',
    status: 'draft_generated',
    outputType: '静态页',
    groupLabel: '经营数据集',
    draft: {
      reviewStatus: 'draft_reviewing',
      version: 3,
      audience: 'internal operators',
      objective: 'Summarize current operating signals in a client-readable cockpit page.',
      layoutVariant: 'operations-cockpit',
      visualStyle: 'signal-board',
      mustHaveModules: ['页面摘要', '关键指标', '风险提醒', '行动建议'],
      optionalModules: ['渠道结构', '执行节奏'],
      evidencePriority: ['订单', '库存', '风险', '动作'],
      audienceTone: 'operator-facing',
      riskNotes: ['库存风险主要集中在少量 SKU。'],
      lastEditedAt: '2026-04-13T12:10:00.000Z',
      approvedAt: '',
      modules: [
        buildModule({
          moduleId: 'ops-hero',
          order: 0,
          moduleType: 'hero',
          title: '页面摘要',
          purpose: 'Open with the current operating picture.',
          contentDraft: '本周经营整体平稳，订单和转化继续增长，但库存风险集中在少量 SKU。',
        }),
        buildModule({
          moduleId: 'ops-metrics',
          order: 1,
          moduleType: 'metric-grid',
          title: '关键指标',
          purpose: 'Lead with four metrics.',
          cards: [
            { label: '订单', value: '128', note: '环比 +12%' },
            { label: '库存指数', value: '0.82', note: '安全区间内' },
            { label: '转化率', value: '6.8%', note: '本周提升' },
            { label: '退款率', value: '1.2%', note: '保持稳定' },
          ],
        }),
        buildModule({
          moduleId: 'ops-risk',
          order: 2,
          moduleType: 'insight-list',
          title: '风险提醒',
          purpose: 'Highlight what needs operator attention.',
          contentDraft: '短期内需要优先处理库存断货风险，再调整渠道投放。',
          bullets: ['高风险 SKU 需在 72 小时内补货', '天猫增量显著，但库存周转需同步跟上'],
        }),
        buildModule({
          moduleId: 'ops-comparison',
          order: 3,
          moduleType: 'comparison',
          title: '重点数据集',
          purpose: 'Explain which datasets dominate the story.',
          contentDraft: '当前经营页叙事主要由订单、库存和渠道三个数据集驱动。',
          bullets: ['订单数据集：38 份文档', '库存数据集：22 份文档', '渠道数据集：17 份文档'],
        }),
        buildModule({
          moduleId: 'ops-chart',
          order: 4,
          moduleType: 'chart',
          title: '渠道趋势',
          purpose: 'Show the channel mix clearly.',
          chartIntent: {
            title: '渠道趋势',
            preferredChartType: 'bar',
            items: [
              { label: '天猫', value: 52 },
              { label: '京东', value: 31 },
              { label: '私域', value: 19 },
            ],
          },
        }),
        buildModule({
          moduleId: 'ops-cta',
          order: 5,
          moduleType: 'cta',
          title: '行动建议',
          purpose: 'Close with the next actions.',
          contentDraft: '建议先处理补货，再复盘投放结构。',
          bullets: ['今天完成高风险 SKU 补货计划', '本周内复盘渠道投放结构'],
        }),
      ],
    },
  };
}

export function buildWorkspaceFinalBenchmarkItem() {
  return {
    id: 'benchmark-workspace-final',
    title: 'AI Data Platform 工作台首页',
    createdAt: '2026-04-13T12:00:00.000Z',
    kind: 'page',
    status: 'ready',
    outputType: '静态页',
    page: {
      visualStyle: 'midnight-glass',
      summary: '基于当前项目真实运行数据生成的工作台首页，聚焦文档、采集、报表与审计四条主线。',
      cards: [
        { label: '文档总量', value: '39', note: '数据集 6' },
        { label: 'Canonical 就绪', value: '97%', note: '38 / 39' },
        { label: '采集任务', value: '6', note: '已排程 4' },
        { label: '报表输出', value: '15', note: '动态 9' },
      ],
      sections: [
        {
          title: '当前信号',
          body: '当前没有 critical 告警，适合继续完善页面结构、图表和客户可见文案。',
          bullets: [
            '当前文档总量 39，canonical 正文就绪 38。',
            '采集链最近失败运行 0 次。',
            '动态静态页输出保持活跃。',
          ],
          displayMode: 'insight-list',
        },
        {
          title: '重点数据集',
          body: '订单、库存和报表模板三个数据集决定了当前首页叙事重心。',
          bullets: [
            '订单数据集：38 份文档',
            '库存数据集：22 份文档',
            '报表模板数据集：14 份文档',
          ],
          displayMode: 'comparison',
        },
        {
          title: '下一步动作',
          body: '继续推进静态页 draft workflow，并锁住 benchmark 回归。',
          bullets: ['经营页先做 benchmark', '再推进研究/方案页', '补 screenshot regression'],
          displayMode: 'cta',
        },
      ],
      charts: [
        {
          title: '数据集文档分布',
          items: [
            { label: '订单', value: 38 },
            { label: '库存', value: 22 },
            { label: '报表模板', value: 14 },
          ],
          render: null,
        },
      ],
      pageSpec: {
        layoutVariant: 'operations-cockpit',
        heroCardLabels: ['文档总量', 'Canonical 就绪', '采集任务', '报表输出'],
        heroDatavizSlotKeys: ['dataset-distribution'],
        sections: [
          { title: '当前信号', purpose: 'Summarize current signals.', completionMode: 'knowledge-plus-model', displayMode: 'insight-list', datavizSlotKeys: [] },
          { title: '重点数据集', purpose: 'Explain which dataset groups drive the story.', completionMode: 'knowledge-plus-model', displayMode: 'comparison', datavizSlotKeys: ['dataset-distribution'] },
          { title: '下一步动作', purpose: 'Close with actions.', completionMode: 'knowledge-plus-model', displayMode: 'cta', datavizSlotKeys: [] },
        ],
      },
      datavizSlots: [
        {
          key: 'dataset-distribution',
          title: '数据集文档分布',
          purpose: 'Show the heaviest dataset groups first.',
          preferredChartType: 'horizontal-bar',
          placement: 'section',
          sectionTitle: '重点数据集',
          evidenceFocus: '数据集文档量',
          minItems: 2,
          maxItems: 8,
        },
      ],
    },
    draft: {
      reviewStatus: 'approved',
      version: 4,
      audience: 'internal operators',
      objective: 'Summarize the current workspace state as a strong homepage.',
      layoutVariant: 'operations-cockpit',
      visualStyle: 'midnight-glass',
      mustHaveModules: ['项目摘要', '关键指标', '重点数据集', '下一步动作'],
      optionalModules: ['报表状态'],
      evidencePriority: ['文档量', '解析就绪率', '数据集分布'],
      audienceTone: 'operator-facing',
      riskNotes: [],
      lastEditedAt: '2026-04-13T12:30:00.000Z',
      approvedAt: '2026-04-13T12:32:00.000Z',
      modules: [
        buildModule({
          moduleId: 'home-hero',
          order: 0,
          moduleType: 'hero',
          title: '项目摘要',
          purpose: 'Open with the strongest current state summary.',
          contentDraft: '当前项目运行稳定，文档解析、采集链和报表输出均处于可持续优化阶段。',
        }),
        buildModule({
          moduleId: 'home-metrics',
          order: 1,
          moduleType: 'metric-grid',
          title: '关键指标',
          purpose: 'Pin four core numbers first.',
          cards: [
            { label: '文档总量', value: '39', note: '数据集 6' },
            { label: 'Canonical 就绪', value: '97%', note: '38 / 39' },
            { label: '采集任务', value: '6', note: '已排程 4' },
            { label: '报表输出', value: '15', note: '动态 9' },
          ],
        }),
        buildModule({
          moduleId: 'home-focus',
          order: 2,
          moduleType: 'comparison',
          title: '重点数据集',
          purpose: 'Explain which datasets dominate the homepage.',
          contentDraft: '订单、库存和报表模板三个数据集决定了当前首页叙事重心。',
          bullets: [
            '订单数据集：38 份文档',
            '库存数据集：22 份文档',
            '报表模板数据集：14 份文档',
          ],
        }),
        buildModule({
          moduleId: 'home-cta',
          order: 3,
          moduleType: 'cta',
          title: '下一步动作',
          purpose: 'Close with clear actions.',
          contentDraft: '继续推进静态页草稿工作流，并锁定 benchmark 回归。',
          bullets: [
            '经营页先做 benchmark',
            '再推进研究/方案页',
            '补 screenshot regression',
          ],
        }),
      ],
    },
  };
}

export function buildHomepageFeaturedBenchmarkItems() {
  const workspace = buildWorkspaceFinalBenchmarkItem();
  const operations = buildOperationsDraftBenchmarkItem();
  return [
    workspace,
    {
      ...operations,
      id: 'benchmark-home-operations-draft',
      title: '经营驾驶舱 草稿',
    },
  ];
}
