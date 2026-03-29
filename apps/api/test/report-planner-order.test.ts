import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportPlan } from '../src/lib/report-planner.js';

test('buildReportPlan should promote order pages into a multi-channel operating cockpit', () => {
  const plan = buildReportPlan({
    requestText: '请基于订单分析知识库生成多渠道多SKU经营驾驶舱，重点看天猫、京东、抖音、库存健康和补货优先级。',
    templateTaskHint: 'order-static-page',
    conceptPageMode: true,
    selectedTemplates: [],
    retrieval: {
      documents: [
        {
          path: 'storage/files/uploads/order-a.csv',
          name: 'order-a.csv',
          ext: '.csv',
          title: '2026 Q1 订单经营驾驶舱',
          category: 'order',
          parseStatus: 'parsed',
          summary: '覆盖天猫、京东、抖音、拼多多的多渠道订单经营与库存补货信息。',
          excerpt: '包含渠道GMV、动销SKU、库存健康和补货优先级。',
          extractedChars: 1600,
          schemaType: 'order',
          topicTags: ['渠道经营', '库存补货', 'SKU结构'],
          parseStage: 'detailed',
        },
      ],
      evidenceMatches: [],
      meta: {
        stages: ['rule'],
        vectorEnabled: false,
        candidateCount: 1,
        rerankedCount: 1,
        intent: 'order',
        templateTask: 'order-static-page',
      },
    },
    libraries: [{ key: 'orders', label: '订单分析' }],
  });

  assert.equal(plan.envelope.title, '客户汇报型多渠道经营驾驶舱');
  assert.deepEqual(plan.envelope.pageSections, ['经营总览', '渠道结构', 'SKU与品类焦点', '库存与补货', '异常波动解释', '行动建议', 'AI综合分析']);
  assert.deepEqual(plan.cards.map((item) => item.label), ['渠道GMV', '动销SKU', '高风险SKU', '库存健康', '补货优先级']);
  assert.deepEqual(plan.charts.map((item) => item.title), ['渠道贡献结构', 'SKU动销/库存风险矩阵', '月度GMV与库存指数联动', '补货优先级队列']);
  assert.match(plan.objective, /multi-channel, multi-SKU operating cockpit/i);
});
