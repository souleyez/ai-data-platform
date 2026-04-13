import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-report-routes-benchmark-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const appModule = await importFresh<typeof import('../src/app.ts')>('../src/app.ts');
const documentLibraries = await importFresh<typeof import('../src/lib/document-libraries.js')>(
  '../src/lib/document-libraries.js',
);
const reportCenter = await importFresh<typeof import('../src/lib/report-center.js')>(
  '../src/lib/report-center.js',
);

const app = appModule.createApp();

test.after(async () => {
  await app.close();
  delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('report routes should expose draft benchmarks and support group filtering', async () => {
  await documentLibraries.createDocumentLibrary({
    name: 'operations',
    description: 'Operations benchmark',
    permissionLevel: 0,
  });
  await documentLibraries.createDocumentLibrary({
    name: 'research',
    description: 'Research benchmark',
    permissionLevel: 0,
  });

  const state = await reportCenter.loadReportCenterState();
  const groupA = state.groups.find((item) => item.key === 'operations');
  const groupB = state.groups.find((item) => item.key === 'research');
  assert.ok(groupA);
  assert.ok(groupB);

  await reportCenter.createReportOutput({
    groupKey: groupA.key,
    title: '经营驾驶舱基准页',
    triggerSource: 'chat',
    kind: 'page',
    page: {
      summary: '当前经营平稳，转化提升明显。',
      cards: [
        { label: '订单', value: '128', note: '环比 +12%' },
        { label: '库存指数', value: '0.82', note: '安全区间内' },
      ],
      sections: [
        { title: '经营概览', body: '渠道销售保持稳定增长。', bullets: ['天猫增幅更高', '退款率保持稳定'] },
        { title: '风险提醒', body: '库存风险集中在少量 SKU。', bullets: ['断货风险需关注'] },
        { title: '行动建议', body: '优先补货并复盘投放。', bullets: ['优先补货', '复盘投放结构'] },
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
          { title: '经营概览', purpose: 'Summarize operations.', completionMode: 'knowledge-plus-model', datavizSlotKeys: ['channel-trend'] },
          { title: '风险提醒', purpose: 'Call out risks.', completionMode: 'knowledge-plus-model', datavizSlotKeys: [] },
          { title: '行动建议', purpose: 'State next steps.', completionMode: 'knowledge-plus-model', datavizSlotKeys: [] },
        ],
      },
      datavizSlots: [
        {
          key: 'channel-trend',
          title: '渠道趋势',
          purpose: 'Show channel mix.',
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

  const blockedRecord = await reportCenter.createReportOutput({
    groupKey: groupA.key,
    title: '方案草稿待补齐',
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

  await reportCenter.updateReportOutputDraft(blockedRecord.id, {
    ...blockedRecord.draft,
    mustHaveModules: ['能力模块', '交付路径'],
    modules: (blockedRecord.draft?.modules || []).filter((module) => module.title === '摘要'),
  });

  const needsAttentionRecord = await reportCenter.createReportOutput({
    groupKey: groupB.key,
    title: '研究草稿待优化',
    triggerSource: 'chat',
    kind: 'page',
    page: {
      summary: '先给一个文字摘要。',
      sections: [
        { title: '研究摘要', body: '当前只有摘要，没有图表。', bullets: [] },
      ],
      pageSpec: {
        layoutVariant: 'research-brief',
        heroCardLabels: [],
        heroDatavizSlotKeys: [],
        sections: [
          { title: '研究摘要', purpose: '研究摘要', completionMode: 'knowledge-plus-model', datavizSlotKeys: [] },
        ],
      },
      visualStyle: 'editorial-brief',
    },
  });

  await reportCenter.updateReportOutputDraft(needsAttentionRecord.id, {
    ...needsAttentionRecord.draft,
    mustHaveModules: [],
    evidencePriority: [],
    modules: [
      {
        moduleId: 'summary-only',
        moduleType: 'summary',
        title: '研究摘要',
        purpose: '先保留摘要',
        contentDraft: '当前只有摘要，没有图表和指标。',
        evidenceRefs: [],
        chartIntent: null,
        cards: [],
        bullets: [],
        enabled: true,
        status: 'edited',
        order: 1,
        layoutType: 'summary',
      },
    ],
  });

  await reportCenter.createReportOutput({
    groupKey: groupA.key,
    title: '非页面输出',
    triggerSource: 'chat',
    kind: 'md',
    format: 'md',
    content: '# markdown',
  });

  const listResponse = await app.inject({
    method: 'GET',
    url: '/api/reports',
  });
  assert.equal(listResponse.statusCode, 200);
  const listPayload = listResponse.json();
  assert.equal(listPayload.benchmark.totals.drafts, 3);
  assert.equal(listPayload.benchmark.totals.ready, 1);
  assert.equal(listPayload.benchmark.totals.needsAttention, 1);
  assert.equal(listPayload.benchmark.totals.blocked, 1);
  assert.equal(listPayload.benchmark.scenarios.length, 3);

  const filteredResponse = await app.inject({
    method: 'GET',
    url: `/api/reports/benchmark?groupKey=${encodeURIComponent(groupA.key)}`,
  });
  assert.equal(filteredResponse.statusCode, 200);
  const filteredPayload = filteredResponse.json();
  assert.equal(filteredPayload.benchmark.totals.drafts, 2);
  assert.equal(filteredPayload.benchmark.totals.ready, 1);
  assert.equal(filteredPayload.benchmark.totals.needsAttention, 0);
  assert.equal(filteredPayload.benchmark.totals.blocked, 1);
  assert.deepEqual(
    filteredPayload.benchmark.scenarios.map((item: { key: string }) => item.key).sort(),
    ['operations-cockpit', 'solution-overview'],
  );

  const snapshotResponse = await app.inject({
    method: 'GET',
    url: '/api/reports/snapshot',
  });
  assert.equal(snapshotResponse.statusCode, 200);
  const snapshotPayload = snapshotResponse.json();
  assert.equal(snapshotPayload.benchmark.totals.drafts, 3);
});

test('saving a draft through the route should persist a diff-oriented history detail', async () => {
  await documentLibraries.createDocumentLibrary({
    name: 'history-diff',
    description: 'Draft save diff history',
    permissionLevel: 0,
  });

  const created = await reportCenter.createReportOutput({
    groupKey: 'history-diff',
    title: '草稿历史测试',
    triggerSource: 'chat',
    kind: 'page',
    page: {
      summary: '初始摘要',
      sections: [
        { title: '摘要', body: '初始正文', bullets: ['第一条'] },
      ],
      pageSpec: {
        layoutVariant: 'research-brief',
        heroCardLabels: [],
        heroDatavizSlotKeys: [],
        sections: [
          { title: '摘要', purpose: '摘要', completionMode: 'knowledge-plus-model', datavizSlotKeys: [] },
        ],
      },
      visualStyle: 'midnight-glass',
    },
  });

  const nextDraft = {
    ...created.draft,
    modules: [
      ...(created.draft?.modules || []).map((module, index) => (
        index === 0
          ? {
              ...module,
              title: '重新编写的摘要',
              contentDraft: '正文已更新',
              bullets: ['第一条', '第二条'],
            }
          : module
      )),
      {
        moduleId: 'extra-chart-module',
        moduleType: 'chart',
        title: '新增图表',
        purpose: '补一个图表模块',
        contentDraft: '',
        evidenceRefs: [],
        chartIntent: {
          title: '新增图表',
          preferredChartType: 'bar',
          items: [{ label: '样本', value: 1 }],
        },
        cards: [],
        bullets: [],
        enabled: true,
        status: 'edited',
        order: 99,
        layoutType: 'chart',
      },
    ],
  };

  const response = await app.inject({
    method: 'PATCH',
    url: `/api/reports/output/${encodeURIComponent(created.id)}/draft`,
    payload: { draft: nextDraft },
  });
  assert.equal(response.statusCode, 200);
  const payload = response.json();
  const historyEntry = payload.item?.draft?.history?.at(-1);
  assert.equal(historyEntry?.action, 'saved');
  assert.equal(historyEntry?.label, '保存草稿');
  assert.match(String(historyEntry?.detail || ''), /当前共 \d+ 个模块/);
  assert.match(String(historyEntry?.detail || ''), /新增 1 个/);
  assert.match(String(historyEntry?.detail || ''), /改文案 1 个/);
});

test('restoring a draft history entry should recover the earlier snapshot', async () => {
  await documentLibraries.createDocumentLibrary({
    name: 'history-restore',
    description: 'Draft restore route',
    permissionLevel: 0,
  });

  const created = await reportCenter.createReportOutput({
    groupKey: 'history-restore',
    title: '草稿恢复测试',
    triggerSource: 'chat',
    kind: 'page',
    page: {
      summary: '初始摘要',
      sections: [
        { title: '摘要', body: '初始正文', bullets: ['第一条'] },
      ],
      pageSpec: {
        layoutVariant: 'research-brief',
        heroCardLabels: [],
        heroDatavizSlotKeys: [],
        sections: [
          { title: '摘要', purpose: '摘要', completionMode: 'knowledge-plus-model', datavizSlotKeys: [] },
        ],
      },
      visualStyle: 'midnight-glass',
    },
  });

  const saveA = await app.inject({
    method: 'PATCH',
    url: `/api/reports/output/${encodeURIComponent(created.id)}/draft`,
    payload: {
      draft: {
        ...created.draft,
        modules: [
          ...(created.draft?.modules || []),
          {
            moduleId: 'extra-timeline-module',
            moduleType: 'timeline',
            title: '新增时间线',
            purpose: '补一个时间线模块',
            contentDraft: '第一阶段、第二阶段',
            evidenceRefs: [],
            chartIntent: null,
            cards: [],
            bullets: ['第一阶段', '第二阶段'],
            enabled: true,
            status: 'edited',
            order: 99,
            layoutType: 'timeline',
          },
        ],
      },
    },
  });
  assert.equal(saveA.statusCode, 200);
  const savedA = saveA.json();
  const restoreHistoryId = savedA.item?.draft?.history?.at(-1)?.id;
  assert.ok(restoreHistoryId);

  const saveB = await app.inject({
    method: 'PATCH',
    url: `/api/reports/output/${encodeURIComponent(created.id)}/draft`,
    payload: {
      draft: {
        ...savedA.item?.draft,
        modules: (savedA.item?.draft?.modules || []).filter((module: { moduleId?: string }) => module.moduleId !== 'extra-timeline-module'),
      },
    },
  });
  assert.equal(saveB.statusCode, 200);

  const restored = await app.inject({
    method: 'POST',
    url: `/api/reports/output/${encodeURIComponent(created.id)}/restore-draft-history`,
    payload: { historyId: restoreHistoryId },
  });
  assert.equal(restored.statusCode, 200);
  const restoredPayload = restored.json();
  const restoredModules = restoredPayload.item?.draft?.modules || [];
  assert.ok(restoredModules.some((module: { moduleId?: string; title?: string }) => module.moduleId === 'extra-timeline-module' && module.title === '新增时间线'));
  assert.equal(restoredPayload.item?.draft?.history?.at(-1)?.action, 'restored');
  assert.match(String(restoredPayload.item?.draft?.history?.at(-1)?.detail || ''), /已恢复到 保存草稿/);
});
