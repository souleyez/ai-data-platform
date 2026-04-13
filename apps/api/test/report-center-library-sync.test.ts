import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-report-center-sync-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const reportCenter = await importFresh<typeof import('../src/lib/report-center.js')>(
  '../src/lib/report-center.js',
);
const documentLibraries = await importFresh<typeof import('../src/lib/document-libraries.js')>(
  '../src/lib/document-libraries.js',
);
const documentCacheRepository = await importFresh<typeof import('../src/lib/document-cache-repository.js')>(
  '../src/lib/document-cache-repository.js',
);

async function removeDirectoryWithRetries(targetPath: string, retries = 5) {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
  if (lastError) throw lastError;
}

test.beforeEach(async () => {
  await removeDirectoryWithRetries(storageRoot);
  await fs.mkdir(storageRoot, { recursive: true });
});

test.after(async () => {
  delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
  await removeDirectoryWithRetries(storageRoot);
});

test('createReportOutput and updateReportOutput should sync markdown copies into the knowledge library', async () => {
  const state = await reportCenter.loadReportCenterState();
  const group = state.groups[0];
  assert.ok(group);

  const library = await documentLibraries.createDocumentLibrary({
    name: 'bids',
    description: 'Bid knowledge base',
    permissionLevel: 0,
  });

  const record = await reportCenter.createReportOutput({
    groupKey: group.key,
    title: '投标响应草稿',
    triggerSource: 'chat',
    kind: 'md',
    format: 'md',
    content: '## 标书草稿\n\n第一章 项目理解',
    libraries: [{ key: library.key, label: library.label }],
  });

  let cache = await documentCacheRepository.readDocumentCache();
  const firstSynced = cache?.items.find((item) => String(item.path || '').includes(`${path.sep}generated-report-library${path.sep}`));
  assert.ok(firstSynced);
  assert.equal(firstSynced?.confirmedGroups?.includes(library.key), true);
  assert.match(firstSynced?.fullText || '', /第一章 项目理解/);

  await reportCenter.updateReportOutput(record.id, {
    content: '## 标书草稿\n\n第一章 项目理解（修订版）',
  });

  cache = await documentCacheRepository.readDocumentCache();
  const syncedItems = (cache?.items || []).filter((item) => String(item.path || '').includes(`${path.sep}generated-report-library${path.sep}`));
  assert.equal(syncedItems.length, 1);
  assert.match(syncedItems[0]?.fullText || '', /修订版/);
});

test('page outputs should stay in draft until finalized, then sync finalized content into the knowledge library', async () => {
  const state = await reportCenter.loadReportCenterState();
  const group = state.groups[0];
  assert.ok(group);

  const library = await documentLibraries.createDocumentLibrary({
    name: 'operations',
    description: 'Operations knowledge base',
    permissionLevel: 0,
  });

  const draftRecord = await reportCenter.createReportOutput({
    groupKey: group.key,
    title: '经营驾驶舱静态页',
    triggerSource: 'chat',
    kind: 'page',
    page: {
      summary: '本周经营总览',
      cards: [
        { label: '订单', value: '128', note: '环比 +12%' },
      ],
      sections: [
        { title: '经营概览', body: '收入和订单保持增长。', bullets: ['成交转化提升', '退款率稳定'] },
      ],
      charts: [
        {
          title: '订单趋势',
          items: [
            { label: '周一', value: 12 },
            { label: '周二', value: 18 },
          ],
        },
      ],
    },
    libraries: [{ key: library.key, label: library.label }],
  });

  assert.equal(draftRecord.status, 'draft_generated');
  assert.ok(draftRecord.draft);
  assert.ok((draftRecord.draft?.modules || []).length > 0);

  let cache = await documentCacheRepository.readDocumentCache();
  let syncedItems = (cache?.items || []).filter((item) => String(item.path || '').includes(`${path.sep}generated-report-library${path.sep}`));
  assert.equal(syncedItems.length, 0);

  const revisedDraft = {
    ...draftRecord.draft,
    modules: (draftRecord.draft?.modules || []).map((module) => (
      module.title === '经营概览'
        ? {
            ...module,
            title: '经营概览（客户确认）',
            contentDraft: '收入和订单保持增长，建议继续加码转化优化。',
          }
        : module
    )),
  };

  const reviewingRecord = await reportCenter.updateReportOutputDraft(draftRecord.id, revisedDraft);
  assert.equal(reviewingRecord.status, 'draft_reviewing');
  assert.equal(reviewingRecord.draft?.reviewStatus, 'draft_reviewing');

  const finalizedRecord = await reportCenter.finalizeDraftReportOutput(draftRecord.id);
  assert.equal(finalizedRecord.status, 'ready');
  assert.equal(finalizedRecord.draft?.reviewStatus, 'approved');

  cache = await documentCacheRepository.readDocumentCache();
  syncedItems = (cache?.items || []).filter((item) => String(item.path || '').includes(`${path.sep}generated-report-library${path.sep}`));
  assert.equal(syncedItems.length, 1);
  assert.match(syncedItems[0]?.fullText || '', /经营概览（客户确认）/);
  assert.match(syncedItems[0]?.fullText || '', /继续加码转化优化/);
});

test('finalizeDraftReportOutput should block drafts that are missing must-have modules', async () => {
  const state = await reportCenter.loadReportCenterState();
  const group = state.groups[0];
  assert.ok(group);

  const record = await reportCenter.createReportOutput({
    groupKey: group.key,
    title: '缺模块草稿页',
    triggerSource: 'chat',
    kind: 'page',
    page: {
      summary: '这里只保留一个摘要模块。',
      sections: [
        { title: '摘要', body: '当前只有一个摘要模块。', bullets: [] },
      ],
      pageSpec: {
        layoutVariant: 'solution-overview',
        heroCardLabels: [],
        heroDatavizSlotKeys: [],
        sections: [
          { title: '摘要', purpose: '开场摘要', completionMode: 'knowledge-plus-model', datavizSlotKeys: [] },
        ],
      },
      visualStyle: 'midnight-glass',
    },
  });

  const reviewingRecord = await reportCenter.updateReportOutputDraft(record.id, {
    ...record.draft,
    mustHaveModules: ['能力模块', '交付路径'],
    modules: (record.draft?.modules || []).filter((module) => module.title === '摘要'),
  });

  assert.equal(reviewingRecord.draft?.readiness, 'blocked');
  assert.deepEqual(reviewingRecord.draft?.missingMustHaveModules, ['能力模块', '交付路径']);

  await assert.rejects(
    () => reportCenter.finalizeDraftReportOutput(record.id),
    /draft is not ready to finalize/i,
  );
});

test('operations cockpit page outputs should build specialized draft modules for review', async () => {
  const state = await reportCenter.loadReportCenterState();
  const group = state.groups[0];
  assert.ok(group);

  const record = await reportCenter.createReportOutput({
    groupKey: group.key,
    title: '经营驾驶舱首页',
    triggerSource: 'chat',
    kind: 'page',
    page: {
      summary: '当前经营平稳，库存风险集中在少量 SKU。',
      cards: [
        { label: '订单', value: '128', note: '环比 +12%' },
        { label: '库存指数', value: '0.82', note: '安全区间内' },
      ],
      sections: [
        { title: '经营概览', body: '渠道销售保持稳定增长。', bullets: ['主要增量来自天猫', '退款率保持稳定'] },
        { title: '风险提醒', body: '少量 SKU 可能在 72 小时内触发断货。', bullets: ['高风险 SKU 需补货', '动销波动需要继续跟踪'] },
        { title: '行动建议', body: '建议先处理断货风险，再优化转化。', bullets: ['优先补货', '复盘投放结构'] },
      ],
      charts: [
        {
          title: '渠道趋势',
          items: [
            { label: '天猫', value: 52 },
            { label: '京东', value: 31 },
          ],
        },
      ],
      pageSpec: {
        layoutVariant: 'operations-cockpit',
        heroCardLabels: ['订单', '库存指数'],
        heroDatavizSlotKeys: ['channel-trend'],
        sections: [
          { title: '经营概览', purpose: 'Summarize the current operating picture.', completionMode: 'knowledge-plus-model', datavizSlotKeys: ['channel-trend'] },
          { title: '风险提醒', purpose: 'Call out the current risks.', completionMode: 'knowledge-plus-model', datavizSlotKeys: [] },
          { title: '行动建议', purpose: 'State the next steps.', completionMode: 'knowledge-plus-model', datavizSlotKeys: [] },
        ],
      },
      datavizSlots: [
        {
          key: 'channel-trend',
          title: '渠道趋势',
          purpose: 'Show the channel mix clearly.',
          preferredChartType: 'bar',
          placement: 'section',
          sectionTitle: '经营概览',
          evidenceFocus: '渠道结构',
          minItems: 2,
          maxItems: 8,
        },
      ],
      visualStyle: 'signal-board',
    },
  });

  assert.equal(record.status, 'draft_generated');
  assert.equal(record.draft?.layoutVariant, 'operations-cockpit');
  assert.equal(record.draft?.visualStyle, 'signal-board');
  assert.equal(record.draft?.audienceTone, 'operator-facing');
  assert.ok((record.draft?.modules || []).some((item) => item.moduleType === 'metric-grid'));
  assert.ok((record.draft?.modules || []).some((item) => item.moduleType === 'cta'));
  assert.ok((record.draft?.modules || []).some((item) => item.moduleType === 'chart'));
  assert.ok((record.draft?.riskNotes || []).length > 0);
  assert.ok((record.draft?.evidencePriority || []).some((title) => title === '关键指标'));
  assert.ok((record.draft?.evidencePriority || []).some((title) => title === '渠道趋势'));
  assert.equal(record.draft?.modules?.[0]?.moduleType, 'hero');
  assert.equal(record.draft?.modules?.[1]?.moduleType, 'metric-grid');
  assert.equal(record.draft?.modules?.at(-1)?.moduleType, 'cta');
  assert.ok(((record.draft?.modules || []).filter((item) => item.moduleType === 'insight-list').length) <= 1);
  assert.ok(((record.draft?.modules || []).filter((item) => item.moduleType === 'chart').length) <= 2);
});

test('risk brief page outputs should build risk-oriented draft modules for review', async () => {
  const state = await reportCenter.loadReportCenterState();
  const group = state.groups[0];
  assert.ok(group);

  const record = await reportCenter.createReportOutput({
    groupKey: group.key,
    title: '标书风险摘要页',
    triggerSource: 'chat',
    kind: 'page',
    page: {
      summary: '本次投标最大风险集中在资格材料缺口与交付边界不清。',
      sections: [
        { title: '项目概览', body: '项目范围清晰，但客户交付边界仍需澄清。', bullets: [] },
        { title: '资格风险', body: '部分资质材料存在缺失。', bullets: ['营业资质待补齐', '案例证明链不完整'] },
        { title: '应答建议', body: '建议先补资格链，再聚焦交付边界。', bullets: ['优先补证', '重写交付边界说明'] },
      ],
      charts: [
        {
          title: '风险主题分布',
          items: [
            { label: '资格材料', value: 4 },
            { label: '交付边界', value: 2 },
          ],
        },
      ],
      pageSpec: {
        layoutVariant: 'risk-brief',
        heroCardLabels: [],
        heroDatavizSlotKeys: [],
        sections: [
          { title: '项目概览', purpose: 'Summarize the bid scope.', completionMode: 'knowledge-plus-model', datavizSlotKeys: [] },
          { title: '资格风险', purpose: 'Highlight qualification risks.', completionMode: 'knowledge-first', datavizSlotKeys: ['risk-clusters'] },
          { title: '应答建议', purpose: 'Turn risks into response actions.', completionMode: 'knowledge-plus-model', datavizSlotKeys: [] },
        ],
      },
      datavizSlots: [
        {
          key: 'risk-clusters',
          title: '风险主题分布',
          purpose: 'Cluster the main risk themes.',
          preferredChartType: 'horizontal-bar',
          placement: 'section',
          sectionTitle: '资格风险',
          evidenceFocus: '风险主题',
          minItems: 2,
          maxItems: 8,
        },
      ],
      visualStyle: 'editorial-brief',
    },
  });

  assert.equal(record.status, 'draft_generated');
  assert.equal(record.draft?.layoutVariant, 'risk-brief');
  assert.equal(record.draft?.audienceTone, 'client-facing');
  assert.ok((record.draft?.modules || []).some((item) => item.title === '资格风险' && item.moduleType === 'insight-list'));
  assert.ok((record.draft?.modules || []).some((item) => item.title === '应答建议' && item.moduleType === 'cta'));
  assert.ok((record.draft?.modules || []).some((item) => item.moduleType === 'chart'));
  assert.ok(((record.draft?.modules || []).filter((item) => item.moduleType === 'chart').length) <= 1);
});

test('research brief page outputs should build research-oriented draft modules for review', async () => {
  const state = await reportCenter.loadReportCenterState();
  const group = state.groups[0];
  assert.ok(group);

  const record = await reportCenter.createReportOutput({
    groupKey: group.key,
    title: '论文研究综述页',
    triggerSource: 'chat',
    kind: 'page',
    page: {
      summary: '研究结论显示干预策略有效，但样本规模仍有限。',
      sections: [
        { title: '研究概览', body: '研究对象与问题设定较清晰。', bullets: [] },
        { title: '核心发现', body: '干预组指标显著提升。', bullets: ['主要效果集中在前两周', '样本差异需要继续校验'] },
        { title: '局限与风险', body: '样本规模和外部效度仍有限。', bullets: ['样本偏小', '长期效果未知'] },
        { title: '行动建议', body: '建议在终稿中强调适用边界。', bullets: ['补充方法约束', '明确应用范围'] },
      ],
      charts: [
        {
          title: '结果指标对比',
          items: [
            { label: '干预组', value: 76 },
            { label: '对照组', value: 61 },
          ],
        },
      ],
      pageSpec: {
        layoutVariant: 'research-brief',
        heroCardLabels: [],
        heroDatavizSlotKeys: [],
        sections: [
          { title: '研究概览', purpose: 'Summarize the study setup.', completionMode: 'knowledge-first', datavizSlotKeys: [] },
          { title: '核心发现', purpose: 'Highlight the main findings.', completionMode: 'knowledge-plus-model', datavizSlotKeys: ['result-metric'] },
          { title: '局限与风险', purpose: 'Call out the study limitations.', completionMode: 'knowledge-plus-model', datavizSlotKeys: [] },
          { title: '行动建议', purpose: 'Turn findings into next actions.', completionMode: 'knowledge-plus-model', datavizSlotKeys: [] },
        ],
      },
      datavizSlots: [
        {
          key: 'result-metric',
          title: '结果指标对比',
          purpose: 'Compare the primary groups clearly.',
          preferredChartType: 'bar',
          placement: 'section',
          sectionTitle: '核心发现',
          evidenceFocus: '结果指标',
          minItems: 2,
          maxItems: 8,
        },
      ],
      visualStyle: 'editorial-brief',
    },
  });

  assert.equal(record.status, 'draft_generated');
  assert.equal(record.draft?.layoutVariant, 'research-brief');
  assert.equal(record.draft?.audienceTone, 'analytical');
  assert.ok((record.draft?.modules || []).some((item) => item.title === '核心发现' && item.moduleType === 'insight-list'));
  assert.ok((record.draft?.modules || []).some((item) => item.title === '局限与风险' && item.moduleType === 'insight-list'));
  assert.ok((record.draft?.modules || []).some((item) => item.title === '行动建议' && item.moduleType === 'cta'));
  assert.ok((record.draft?.modules || []).filter((item) => item.moduleType === 'insight-list').length >= 2);
  assert.ok((record.draft?.modules || []).filter((item) => item.moduleType === 'insight-list').length <= 3);
});

test('solution overview page outputs should build solution-oriented draft modules for review', async () => {
  const state = await reportCenter.loadReportCenterState();
  const group = state.groups[0];
  assert.ok(group);

  const record = await reportCenter.createReportOutput({
    groupKey: group.key,
    title: '行业解决方案页',
    triggerSource: 'chat',
    kind: 'page',
    page: {
      summary: '当前方案主打多源采集、结构化治理和客户可见静态页交付。',
      cards: [
        { label: '覆盖场景', value: '6', note: '采集、解析、报表、审计' },
      ],
      sections: [
        { title: '方案概览', body: '系统核心能力围绕采集、治理、生成展开。', bullets: ['统一控制面', '模块级草稿生成'] },
        { title: '能力模块', body: '按能力模块说明方案结构。', bullets: ['采集与解析', '静态页生成', '审计治理'] },
        { title: '交付路径', body: '建议分阶段实施。', bullets: ['先接基础能力', '再做页面治理'] },
        { title: '行动建议', body: '建议先验证核心 benchmark 页面。', bullets: ['经营页先落地', '再推广到研究/方案页'] },
      ],
      charts: [
        {
          title: '方案能力覆盖',
          items: [
            { label: '采集', value: 4 },
            { label: '解析', value: 4 },
            { label: '报表', value: 5 },
          ],
        },
      ],
      pageSpec: {
        layoutVariant: 'solution-overview',
        heroCardLabels: ['覆盖场景'],
        heroDatavizSlotKeys: [],
        sections: [
          { title: '方案概览', purpose: 'Open with the solution summary.', completionMode: 'knowledge-plus-model', datavizSlotKeys: [] },
          { title: '能力模块', purpose: 'Break the solution into modules.', completionMode: 'knowledge-plus-model', datavizSlotKeys: ['solution-coverage'] },
          { title: '交付路径', purpose: 'State the implementation path.', completionMode: 'knowledge-plus-model', datavizSlotKeys: [] },
          { title: '行动建议', purpose: 'End with the next steps.', completionMode: 'knowledge-plus-model', datavizSlotKeys: [] },
        ],
      },
      datavizSlots: [
        {
          key: 'solution-coverage',
          title: '方案能力覆盖',
          purpose: 'Show the breadth of the solution clearly.',
          preferredChartType: 'bar',
          placement: 'section',
          sectionTitle: '能力模块',
          evidenceFocus: '能力覆盖',
          minItems: 2,
          maxItems: 8,
        },
      ],
      visualStyle: 'midnight-glass',
    },
  });

  assert.equal(record.status, 'draft_generated');
  assert.equal(record.draft?.layoutVariant, 'solution-overview');
  assert.ok((record.draft?.modules || []).some((item) => item.moduleType === 'comparison'));
  assert.ok((record.draft?.modules || []).some((item) => item.title === '交付路径' && item.moduleType === 'timeline'));
  assert.ok((record.draft?.modules || []).some((item) => item.title === '行动建议' && item.moduleType === 'cta'));
  assert.ok((record.draft?.mustHaveModules || []).some((title) => title === '能力模块'));
  assert.ok((record.draft?.mustHaveModules || []).some((title) => title === '交付路径'));
  assert.ok((record.draft?.evidencePriority || []).some((title) => title === '能力模块'));
  assert.ok((record.draft?.evidencePriority || []).some((title) => title === '交付路径'));
  assert.ok((record.draft?.modules || []).filter((item) => item.moduleType === 'chart').length <= 1);
});

test('talent showcase page outputs should build talent-oriented draft modules for review', async () => {
  const state = await reportCenter.loadReportCenterState();
  const group = state.groups[0];
  assert.ok(group);

  const record = await reportCenter.createReportOutput({
    groupKey: group.key,
    title: '人才履历页',
    triggerSource: 'chat',
    kind: 'page',
    page: {
      summary: '候选人的核心优势集中在复杂项目推进和客户沟通能力。',
      cards: [
        { label: '项目经验', value: '12+', note: '跨行业项目' },
      ],
      sections: [
        { title: '核心优势', body: '具备复杂项目推进和跨团队协同能力。', bullets: ['能独立控节奏', '客户沟通能力强'] },
        { title: '项目经历', body: '有多段项目交付经验。', bullets: ['大型交付项目', '数据治理项目'] },
        { title: '代表案例', body: '案例能体现项目深度。', bullets: ['经营驾驶舱', '静态页工作流'] },
        { title: '联系建议', body: '建议安排深度面试。', bullets: ['重点问项目边界', '重点问客户协作'] },
      ],
      pageSpec: {
        layoutVariant: 'talent-showcase',
        heroCardLabels: ['项目经验'],
        heroDatavizSlotKeys: [],
        sections: [
          { title: '核心优势', purpose: 'State the strongest points.', completionMode: 'knowledge-plus-model', datavizSlotKeys: [] },
          { title: '项目经历', purpose: 'Show the experience chronology.', completionMode: 'knowledge-plus-model', datavizSlotKeys: [] },
          { title: '代表案例', purpose: 'Anchor credibility with project examples.', completionMode: 'knowledge-plus-model', datavizSlotKeys: [] },
          { title: '联系建议', purpose: 'Close with a clear action.', completionMode: 'knowledge-plus-model', datavizSlotKeys: [] },
        ],
      },
      visualStyle: 'minimal-canvas',
    },
  });

  assert.equal(record.status, 'draft_generated');
  assert.equal(record.draft?.layoutVariant, 'talent-showcase');
  assert.equal(record.draft?.audienceTone, 'candidate-facing');
  assert.ok((record.draft?.modules || []).some((item) => item.title === '项目经历' && item.moduleType === 'timeline'));
  assert.ok((record.draft?.modules || []).some((item) => item.title === '代表案例' && item.moduleType === 'comparison'));
  assert.ok((record.draft?.modules || []).some((item) => item.title === '联系建议' && item.moduleType === 'cta'));
  assert.ok((record.draft?.mustHaveModules || []).some((title) => title === '项目经历'));
  assert.ok((record.draft?.mustHaveModules || []).some((title) => title === '代表案例'));
  assert.equal((record.draft?.modules || []).filter((item) => item.moduleType === 'chart').length, 0);
});
