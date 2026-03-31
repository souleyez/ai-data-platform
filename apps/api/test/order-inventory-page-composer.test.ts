import test from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedDocument } from '../src/lib/document-parser.js';
import {
  resolveOrderInventoryComposerAttemptModes,
  runOrderInventoryPageComposer,
  runOrderInventoryPageComposerDetailed,
  selectOrderInventoryEvidenceDocuments,
} from '../src/lib/order-inventory-page-composer.js';

test('resolveOrderInventoryComposerAttemptModes should keep stock requests on compact mode only', () => {
  assert.deepEqual(resolveOrderInventoryComposerAttemptModes('stock'), ['compact']);
  assert.deepEqual(resolveOrderInventoryComposerAttemptModes('generic'), ['rich', 'compact']);
});

test('runOrderInventoryPageComposer should return null and expose debug detail when gateway is not configured', async () => {
  const previousUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  delete process.env.OPENCLAW_GATEWAY_URL;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  const documents: ParsedDocument[] = [
    {
      path: 'storage/files/uploads/order-dashboard.csv',
      name: 'order-dashboard.csv',
      ext: '.csv',
      title: '2026 Q1 订单渠道经营驾驶舱',
      category: 'order',
      bizCategory: 'order',
      parseStatus: 'parsed',
      summary: '覆盖天猫、京东、抖音三大渠道的订单、库存和补货信号。',
      excerpt: '包含渠道结构、SKU焦点、库存健康和补货动作。',
      extractedChars: 2048,
      schemaType: 'report',
      topicTags: ['渠道经营', '库存补货', 'SKU结构'],
      structuredProfile: {
        platforms: ['tmall', 'jd', 'douyin'],
        platformSignals: ['tmall', 'jd', 'douyin'],
        categorySignals: ['耳机', '智能穿戴'],
        metricSignals: ['gmv', 'inventory-index'],
        replenishmentSignals: ['replenishment', 'restock'],
        anomalySignals: ['anomaly'],
      },
    },
  ];

  try {
    const composerInput = {
      requestText: '请生成一页多渠道订单经营驾驶舱静态页',
      documents,
      envelope: {
        title: '订单渠道经营驾驶舱',
        fixedStructure: [],
        variableZones: [],
        outputHint: '输出多渠道、多SKU订单经营驾驶舱，突出渠道贡献、库存风险和补货优先级。',
        pageSections: ['经营总览', '渠道结构', 'SKU动销焦点', '库存与补货', '异常波动解释', 'AI综合分析'],
      },
      reportPlan: null,
    };

    const result = await runOrderInventoryPageComposer(composerInput);
    assert.equal(result, null);

    const detailed = await runOrderInventoryPageComposerDetailed(composerInput);
    assert.equal(detailed.content, null);
    assert.equal(detailed.attemptMode, '');
    assert.deepEqual(detailed.attemptedModes, []);
    assert.match(detailed.error, /gateway/i);
  } finally {
    if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = previousUrl;

    if (previousToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = previousToken;
  }
});

test('selectOrderInventoryEvidenceDocuments should exclude skill guides and unrelated proposals', () => {
  const documents: ParsedDocument[] = [
    {
      path: 'default-samples/assets/order-electronics-omni-1000-orders-q1-2026.csv',
      name: 'order-electronics-omni-1000-orders-q1-2026.csv',
      ext: '.csv',
      title: 'month,platform,category,sku,net_sales',
      category: 'order',
      bizCategory: 'order',
      parseStatus: 'parsed',
      summary: 'Omni-channel order detail with Tmall, JD, Douyin, SKU and net sales signals.',
      excerpt: 'Tmall,JD,Douyin',
      extractedChars: 2400,
      schemaType: 'report',
      topicTags: ['order', 'channel'],
      structuredProfile: {
        platforms: ['tmall', 'jd', 'douyin'],
        metricSignals: ['gmv'],
      },
    },
    {
      path: 'default-samples/assets/order-inventory-snapshot-q1-2026.csv',
      name: 'order-inventory-snapshot-q1-2026.csv',
      ext: '.csv',
      title: 'Q1 inventory snapshot',
      category: 'inventory',
      bizCategory: 'inventory',
      parseStatus: 'parsed',
      summary: 'Inventory index, replenishment priority, risk flag, days of cover.',
      excerpt: 'inventory_index,days_of_cover,replenishment_priority',
      extractedChars: 1200,
      schemaType: 'report',
      topicTags: ['inventory', 'stock'],
      structuredProfile: {
        replenishmentSignals: ['replenishment'],
        anomalySignals: ['anomaly'],
      },
    },
    {
      path: 'skills/order-inventory-page-composer/references/layout-guidance.md',
      name: 'layout-guidance.md',
      ext: '.md',
      title: 'layout guidance',
      category: 'general',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: 'Design guidance for cockpit layouts.',
      excerpt: 'Use 4 cards and 2 charts.',
      extractedChars: 400,
      schemaType: 'generic',
      topicTags: ['dashboard'],
    },
    {
      path: 'docs/CUSTOMER_PROPOSAL_DIVOOM_CLIENT.md',
      name: 'CUSTOMER_PROPOSAL_DIVOOM_CLIENT.md',
      ext: '.md',
      title: 'AI Data Platform proposal for Divoom',
      category: 'general',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: 'Sales proposal deck for Divoom.',
      excerpt: 'Proposal sections and pricing.',
      extractedChars: 600,
      schemaType: 'report',
      topicTags: ['proposal'],
    },
  ];

  const selected = selectOrderInventoryEvidenceDocuments(documents, { maxDocuments: 3 });

  assert.equal(selected.length, 2);
  assert.ok(selected.every((item) => !/layout-guidance|divoom/i.test(item.path)));
  assert.deepEqual(
    selected.map((item) => item.name),
    [
      'order-electronics-omni-1000-orders-q1-2026.csv',
      'order-inventory-snapshot-q1-2026.csv',
    ],
  );
});
