import test from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedDocument } from '../src/lib/document-parser.js';
import { normalizeReportOutput } from '../src/lib/knowledge-output.js';

test('normalizeReportOutput should hydrate order cockpit pages to the minimum visual shell', () => {
  const documents: ParsedDocument[] = [
    {
      path: 'order-q1.csv',
      name: 'order-q1.csv',
      ext: '.csv',
      title: '2026 Q1 订单经营复盘',
      category: 'order',
      bizCategory: 'order',
      parseStatus: 'parsed',
      summary: '覆盖天猫、京东、抖音多渠道经营，包含库存健康和补货信号。',
      excerpt: '核心主题为渠道结构、SKU焦点、库存风险和补货动作。',
      extractedChars: 1800,
      schemaType: 'report',
      topicTags: ['渠道经营', '库存补货', 'SKU结构'],
      structuredProfile: {
        platforms: ['tmall', 'jd', 'douyin'],
        platformSignals: ['tmall', 'jd', 'douyin'],
        categorySignals: ['耳机', '智能穿戴'],
        metricSignals: ['gmv', 'inventory-index'],
        replenishmentSignals: ['replenishment', 'restock'],
        anomalySignals: ['anomaly', 'volatility'],
      },
    },
  ];

  const output = normalizeReportOutput(
    'page',
    '请基于订单分析知识库生成一页多渠道、多SKU经营驾驶舱静态页，重点看天猫、京东、抖音、库存健康和补货优先级。',
    JSON.stringify({
      title: '订单经营静态页',
      summary: '聚焦多渠道经营结构与库存动作。',
      cards: [
        { label: '渠道GMV', value: '多渠道', note: 'Tmall / JD / Douyin' },
      ],
      sections: [
        { title: '经营总览', body: '当前经营重点已转向主渠道与主销 SKU 的结构协同。' },
        { title: '渠道结构', body: '天猫、京东、抖音承担不同角色。' },
      ],
      charts: [
        {
          title: '渠道贡献结构',
          items: [{ label: 'Tmall', value: 3 }],
        },
      ],
    }),
    {
      title: '订单渠道经营驾驶舱',
      fixedStructure: [],
      variableZones: [],
      outputHint: '输出多渠道、多SKU订单经营驾驶舱，突出渠道贡献、库存风险和补货优先级。',
      pageSections: ['经营总览', '渠道结构', 'SKU与品类焦点', '库存与补货', '异常波动解释', '行动建议', 'AI综合分析'],
    },
    documents,
  );

  assert.equal(output.type, 'page');
  assert.equal(output.title, '多渠道订单经营驾驶舱');
  assert.ok((output.page?.cards || []).length >= 5);
  assert.ok((output.page?.charts || []).length >= 3);
  assert.equal(output.page?.sections?.[0]?.title, '经营总览');
});

test('normalizeReportOutput should fall back to order cockpit output for prompt echo pages', () => {
  const documents: ParsedDocument[] = [
    {
      path: 'order-summary.csv',
      name: 'order-summary.csv',
      ext: '.csv',
      title: '2026 Q1 多渠道订单经营汇总',
      category: 'general',
      bizCategory: 'order',
      parseStatus: 'parsed',
      parseMethod: 'csv-utf8',
      summary: '覆盖天猫、京东、抖音、拼多多的订单经营汇总，含净销售额、毛利率和退款信号。',
      excerpt: 'month,platform,category,order_count,units_sold,net_sales,gross_profit,gross_margin',
      fullText: [
        'month,platform,category,order_count,units_sold,net_sales,gross_profit,gross_margin,refund_total',
        '2026-01,Douyin,智能穿戴,120,148,82350,26120,31.7,4200',
        '2026-01,Tmall,耳机,96,121,71320,24550,34.4,2600',
        '2026-01,JD,智能家居,74,82,46880,15990,34.1,1800',
      ].join('\n'),
      extractedChars: 320,
      schemaType: 'report',
      topicTags: ['订单分析', '渠道经营', 'SKU结构', '经营复盘'],
      structuredProfile: {
        platforms: ['tmall', 'jd', 'douyin'],
        categorySignals: ['智能穿戴', '耳机', '智能家居'],
      },
    },
    {
      path: 'inventory.csv',
      name: 'inventory.csv',
      ext: '.csv',
      title: 'Q1 库存快照',
      category: 'general',
      bizCategory: 'inventory',
      parseStatus: 'parsed',
      parseMethod: 'csv-utf8',
      summary: '含库存指数、覆盖天数和补货优先级。',
      excerpt: 'platform_focus,category,sku,inventory_index,days_of_cover,replenishment_priority,risk_flag',
      fullText: [
        'platform_focus,category,sku,inventory_index,days_of_cover,replenishment_priority,risk_flag',
        'Douyin,智能穿戴,旗舰手表X1,128,18,P0,high',
        'Tmall,耳机,降噪耳机Pro,86,26,P1,medium',
        'JD,智能家居,智能门锁S3,74,34,P1,medium',
      ].join('\n'),
      extractedChars: 260,
      schemaType: 'report',
      topicTags: ['库存监控', '库存管理', '备货建议', '异常波动'],
      structuredProfile: {
        replenishmentSignals: ['replenishment'],
        anomalySignals: ['anomaly'],
      },
    },
  ];

  const output = normalizeReportOutput(
    'page',
    '基于订单分析知识库全部材料生成多渠道多SKU经营驾驶舱静态页',
    '基于订单分析知识库全部材料生成多渠道多SKU经营驾驶舱静态页',
    {
      title: '订单多渠道经营驾驶舱',
      fixedStructure: [],
      variableZones: [],
      outputHint: '输出多渠道、多SKU经营驾驶舱',
      pageSections: ['经营总览', '渠道结构', 'SKU与品类焦点', '库存与补货', '异常波动解释', '行动建议', 'AI综合分析'],
    },
    documents,
  );

  assert.equal(output.type, 'page');
  assert.equal(output.title, '订单多渠道经营驾驶舱');
  assert.ok((output.page?.cards || []).length >= 5);
  assert.ok((output.page?.charts || []).length >= 3);
  assert.match(output.page?.summary || '', /多渠道|SKU|库存|补货/);
});

test('normalizeReportOutput should unwrap nested stringified order page payloads', () => {
  const documents: ParsedDocument[] = [
    {
      path: 'order-summary.csv',
      name: 'order-summary.csv',
      ext: '.csv',
      title: '2026 Q1 多渠道订单经营汇总',
      category: 'general',
      bizCategory: 'order',
      parseStatus: 'parsed',
      parseMethod: 'csv-utf8',
      summary: '覆盖天猫、京东、抖音、拼多多的订单经营汇总，含净销售额、毛利率和退款信号。',
      excerpt: 'month,platform,category,order_count,units_sold,net_sales,gross_profit,gross_margin',
      fullText: [
        'month,platform,category,order_count,units_sold,net_sales,gross_profit,gross_margin,refund_total',
        '2026-01,Douyin,智能穿戴,120,148,82350,26120,31.7,4200',
        '2026-01,Tmall,耳机,96,121,71320,24550,34.4,2600',
      ].join('\n'),
      extractedChars: 220,
      schemaType: 'report',
      topicTags: ['订单分析', '渠道经营', 'SKU结构', '经营复盘'],
      structuredProfile: {
        platforms: ['tmall', 'jd', 'douyin'],
        categorySignals: ['智能穿戴', '耳机'],
        metricSignals: ['gmv', 'inventory-index'],
      },
    },
  ];

  const embeddedPage = {
    title: '订单品类/SKU经营驾驶舱',
    summary: '2026年Q1订单与库存经营总览。',
    page: {
      summary: '本页面基于订单分析知识库构建，覆盖多渠道经营、品类梯队和库存动作。',
      cards: [
        { label: '渠道GMV', value: '抖音主导', note: '抖音、天猫、京东三大渠道' },
        { label: '高风险SKU', value: '旗舰手表X1', note: '超库存风险，建议清仓' },
      ],
      sections: [
        { title: '经营总览', body: 'Q1覆盖抖音、京东、天猫三大渠道。', bullets: ['抖音主导', '耳机和智能穿戴贡献最高'] },
        { title: '库存与补货', body: '旗舰手表X1超库存，建议优先清理。', bullets: ['P0清理', '补货节奏收紧'] },
      ],
      charts: [
        { title: '渠道贡献结构', items: [{ label: '抖音', value: 8 }, { label: '天猫', value: 3 }] },
      ],
    },
  };

  const output = normalizeReportOutput(
    'page',
    '基于订单分析知识库全部材料，生成多渠道多SKU经营驾驶舱静态页',
    JSON.stringify({
      output: {
        type: 'page',
        title: '订单品类/SKU经营驾驶舱',
        content: JSON.stringify(embeddedPage),
        format: 'html',
        page: {
          summary: JSON.stringify(embeddedPage),
        },
      },
    }),
    {
      title: '订单多渠道经营驾驶舱',
      fixedStructure: [],
      variableZones: [],
      outputHint: '输出多渠道、多SKU经营驾驶舱',
      pageSections: ['经营总览', '品类梯队', 'SKU集中度', '动销与毛利焦点', '库存与补货', '异常波动解释', 'AI综合分析'],
    },
    documents,
  );

  assert.equal(output.type, 'page');
  assert.equal(output.title, '订单多渠道经营驾驶舱');
  assert.equal(output.page?.summary, '本页面基于订单分析知识库构建，覆盖多渠道经营、品类梯队和库存动作。');
  assert.equal(output.page?.sections?.[0]?.body, 'Q1覆盖抖音、京东、天猫三大渠道。');
  assert.ok((output.page?.cards || []).some((item) => item.label === '渠道GMV'));
  assert.ok((output.page?.charts || []).length >= 3);
  assert.doesNotMatch(output.page?.summary || '', /^\s*\{/);
});

test('normalizeReportOutput should keep stock requests on inventory cockpit titles and labels', () => {
  const documents: ParsedDocument[] = [
    {
      path: 'inventory-stock.csv',
      name: 'inventory-stock.csv',
      ext: '.csv',
      title: 'Q1 库存与补货快照',
      category: 'general',
      bizCategory: 'inventory',
      parseStatus: 'parsed',
      parseMethod: 'csv-utf8',
      summary: '含库存指数、断货风险、补货优先级和跨仓调拨信号。',
      excerpt: 'platform_focus,inventory_index,days_of_cover,replenishment_priority,risk_flag',
      fullText: [
        'platform_focus,category,sku,inventory_index,days_of_cover,replenishment_priority,risk_flag',
        'Douyin,智能穿戴,旗舰手表X1,128,18,P0,high',
        'Tmall,耳机,降噪耳机Pro,86,26,P1,medium',
      ].join('\n'),
      extractedChars: 260,
      schemaType: 'report',
      topicTags: ['库存监控', '库存管理', '备货建议'],
      structuredProfile: {
        metricSignals: ['inventory-index'],
        replenishmentSignals: ['replenishment'],
        anomalySignals: ['anomaly'],
      },
    },
  ];

  const output = normalizeReportOutput(
    'page',
    '基于订单分析知识库生成库存与补货驾驶舱静态页，重点看断货风险、滞销库存和72小时补货优先级',
    JSON.stringify({
      title: '订单多渠道经营驾驶舱',
      summary: '库存风险与补货动作需要优先前置。',
      cards: [
        { label: '库存健康', value: '3 项', note: 'inventory-index / stock' },
      ],
      sections: [
        { title: '经营总览', body: '先看库存风险，再看补货动作。' },
      ],
      charts: [
        { title: '库存健康信号', items: [{ label: 'inventory-index', value: 3 }] },
      ],
    }),
    {
      title: '订单多渠道经营驾驶舱',
      fixedStructure: [],
      variableZones: [],
      outputHint: '输出库存与补货驾驶舱，突出库存健康、高风险SKU和72小时补货优先级。',
      pageSections: ['经营总览', '库存健康', '高风险SKU', '动销与周转', '补货优先级', '异常波动解释', 'AI综合分析'],
    },
    documents,
  );

  assert.equal(output.type, 'page');
  assert.equal(output.title, '库存与补货驾驶舱');
  assert.ok((output.page?.cards || []).some((item) => item.label === '库存健康指数'));
  assert.ok((output.page?.cards || []).some((item) => item.label === '72小时补货动作'));
});

test('normalizeReportOutput should keep mixed channel and sku prompts on the generic cockpit shell', () => {
  const documents: ParsedDocument[] = [
    {
      path: 'order-generic.csv',
      name: 'order-generic.csv',
      ext: '.csv',
      title: 'Q1 多渠道经营汇总',
      category: 'general',
      bizCategory: 'order',
      parseStatus: 'parsed',
      parseMethod: 'csv-utf8',
      summary: '覆盖渠道贡献、SKU结构、库存健康和补货动作。',
      excerpt: 'platform,category,sku,inventory_index,replenishment_priority',
      fullText: [
        'platform,category,sku,inventory_index,replenishment_priority',
        'Douyin,智能穿戴,旗舰手表X1,128,P0',
        'Tmall,耳机,降噪耳机Pro,86,P1',
      ].join('\n'),
      extractedChars: 240,
      schemaType: 'report',
      topicTags: ['订单分析', '渠道经营', 'SKU结构'],
      structuredProfile: {
        platformSignals: ['tmall', 'douyin'],
        categorySignals: ['智能穿戴', '耳机'],
        metricSignals: ['inventory-index'],
        replenishmentSignals: ['replenishment'],
      },
    },
  ];

  const output = normalizeReportOutput(
    'page',
    '请基于订单分析知识库生成一页多渠道多SKU经营驾驶舱静态页，重点看渠道贡献、核心品类、库存健康和补货优先级。',
    JSON.stringify({
      title: '订单品类/SKU经营驾驶舱',
      summary: '综合经营页需要同时看渠道和SKU结构。',
      page: {
        summary: '综合经营页需要同时看渠道和SKU结构。',
        cards: [{ label: '渠道GMV', value: '2 渠道', note: 'Douyin / Tmall' }],
        sections: [{ title: '经营总览', body: '同时关注渠道、SKU 和库存动作。', bullets: [] }],
        charts: [{ title: '渠道贡献结构', items: [{ label: 'Douyin', value: 2 }] }],
      },
    }),
    {
      title: '订单多渠道经营驾驶舱',
      fixedStructure: [],
      variableZones: [],
      outputHint: '输出多渠道、多SKU经营驾驶舱。',
      pageSections: ['经营总览', '渠道结构', 'SKU与品类焦点', '库存与补货', '异常波动解释', '行动建议', 'AI综合分析'],
    },
    documents,
  );

  assert.equal(output.type, 'page');
  assert.equal(output.title, '订单多渠道经营驾驶舱');
});
