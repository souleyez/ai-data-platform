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
  assert.equal(output.title, '订单渠道经营驾驶舱');
  assert.ok((output.page?.cards || []).length >= 4);
  assert.ok((output.page?.charts || []).length >= 2);
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
  assert.ok((output.page?.cards || []).length >= 4);
  assert.ok((output.page?.charts || []).length >= 2);
  assert.match(output.page?.summary || '', /多渠道|SKU|库存|补货/);
});
