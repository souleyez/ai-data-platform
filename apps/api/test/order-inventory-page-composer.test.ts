import test from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedDocument } from '../src/lib/document-parser.js';
import {
  runOrderInventoryPageComposer,
  runOrderInventoryPageComposerDetailed,
} from '../src/lib/order-inventory-page-composer.js';

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
