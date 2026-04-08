import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildChatOutputDynamicSource,
  resolveChatOutputReportGroup,
  shouldPersistChatOutput,
} from '../src/lib/chat-output-persistence.js';
import type { ReportGroup } from '../src/lib/report-center.js';

const GROUPS: ReportGroup[] = [
  {
    key: '简历',
    label: '简历',
    description: '简历分组',
    triggerKeywords: ['简历', 'resume'],
    defaultTemplateKey: '简历-table',
    templates: [
      {
        key: '简历-table',
        label: '简历对比表格',
        type: 'table',
        description: '按简历输出表格',
        supported: true,
      },
    ],
    referenceImages: [],
  },
  {
    key: 'order',
    label: '订单分析',
    description: '订单分析分组',
    triggerKeywords: ['订单', '库存', 'order'],
    defaultTemplateKey: 'order-static-page',
    templates: [
      {
        key: 'order-static-page',
        label: '订单经营静态页',
        type: 'static-page',
        description: '按订单输出静态页',
        supported: true,
      },
    ],
    referenceImages: [],
  },
];

test('shouldPersistChatOutput should only persist document-like outputs', () => {
  assert.equal(shouldPersistChatOutput({ type: 'answer', content: 'hello' }), false);
  assert.equal(
    shouldPersistChatOutput({ type: 'table', title: '简历对比表', content: 'done', format: 'csv' }),
    true,
  );
});

test('resolveChatOutputReportGroup should prefer matched libraries over prompt fallback', () => {
  const group = resolveChatOutputReportGroup(
    GROUPS,
    [{ key: 'order', label: '订单分析' }],
    '请做一份简历对比表',
  );

  assert.equal(group?.key, 'order');
});

test('resolveChatOutputReportGroup should fall back to prompt keywords when libraries are missing', () => {
  const group = resolveChatOutputReportGroup(GROUPS, [], '请按库存情况生成经营静态页');
  assert.equal(group?.key, 'order');
});

test('resolveChatOutputReportGroup should try library label when key does not match a report group', () => {
  const group = resolveChatOutputReportGroup(
    [
      ...GROUPS,
      {
        key: '广州ai',
        label: '广州AI',
        description: '客流分组',
        triggerKeywords: ['广州AI', '客流'],
        defaultTemplateKey: 'footfall-page',
        templates: [
          {
            key: 'footfall-page',
            label: '商场客流分区驾驶舱',
            type: 'static-page',
            description: '商场客流静态页',
            supported: true,
          },
        ],
        referenceImages: [],
      },
    ],
    [{ key: 'guangzhou-ai', label: '广州AI' }],
    '请输出商场客流静态页',
  );

  assert.equal(group?.key, '广州ai');
});

test('buildChatOutputDynamicSource should only create page dynamic sources with libraries', () => {
  const dynamicSource = buildChatOutputDynamicSource({
    prompt: '请把简历库做成客户汇报静态页',
    output: {
      type: 'page',
      title: '简历客户汇报页',
      content: 'summary',
      format: 'html',
      page: { summary: 'summary', cards: [], sections: [], charts: [] },
    },
    libraries: [{ key: '简历', label: '简历' }],
    reportTemplate: null,
  });

  assert.equal(dynamicSource?.enabled, true);
  assert.equal(dynamicSource?.outputType, 'page');
  assert.equal(dynamicSource?.conceptMode, true);
  assert.deepEqual(dynamicSource?.libraries, [{ key: '简历', label: '简历' }]);
});

test('buildChatOutputDynamicSource should skip non-page outputs', () => {
  const dynamicSource = buildChatOutputDynamicSource({
    prompt: '请输出简历对比表',
    output: {
      type: 'table',
      title: '简历对比表',
      content: 'summary',
      format: 'csv',
      table: { title: '简历对比表', columns: ['候选人'], rows: [['张三']] },
    },
    libraries: [{ key: '简历', label: '简历' }],
    reportTemplate: null,
  });

  assert.equal(dynamicSource, null);
});
