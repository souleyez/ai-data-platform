import test from 'node:test';
import assert from 'node:assert/strict';
import type { RetrievalResult } from '../src/lib/document-retrieval.js';
import {
  buildReportPlan,
  buildReportPlanContextBlock,
  inferReportPlanTaskHint,
} from '../src/lib/report-planner.js';
import type { SelectedKnowledgeTemplate } from '../src/lib/knowledge-template.js';

function makeRetrieval(overrides?: Partial<RetrievalResult>): RetrievalResult {
  return {
    documents: [
      {
        path: 'storage/files/uploads/bid-a.pdf',
        name: 'bid-a.pdf',
        ext: '.pdf',
        title: '投标响应资料',
        category: 'bid',
        parseStatus: 'parsed',
        summary: '包含资格条件、材料清单和应答要求。',
        excerpt: '包含资格条件、材料清单和应答要求。',
        extractedChars: 1200,
        schemaType: 'bid',
        topicTags: ['资格风险', '材料缺口'],
        parseStage: 'detailed',
      },
      {
        path: 'storage/files/uploads/bid-b.pdf',
        name: 'bid-b.pdf',
        ext: '.pdf',
        title: '项目招标说明',
        category: 'bid',
        parseStatus: 'parsed',
        summary: '包含交付范围、时间节点和评分规则。',
        excerpt: '包含交付范围、时间节点和评分规则。',
        extractedChars: 1100,
        schemaType: 'bid',
        topicTags: ['时间风险', '交付要求'],
        parseStage: 'quick',
      },
    ],
    evidenceMatches: [],
    meta: {
      stages: ['rule', 'rerank'],
      vectorEnabled: false,
      candidateCount: 2,
      rerankedCount: 2,
      intent: 'generic',
      templateTask: 'bids-static-page',
    },
    ...overrides,
  };
}

function makeSelectedTemplate(preferredLayoutVariant?: 'insight-brief' | 'risk-brief' | 'operations-cockpit' | 'talent-showcase' | 'research-brief' | 'solution-overview'): SelectedKnowledgeTemplate {
  return {
    group: {
      key: 'bids',
      label: 'bids',
      description: '标书知识库',
      triggerKeywords: ['标书', '招标', '投标'],
      defaultTemplateKey: 'bids-static-page',
      templates: [],
      referenceImages: [],
    },
    template: {
      key: 'bids-static-page',
      label: '标书摘要静态页',
      type: 'static-page',
      description: '标书摘要静态页模板',
      preferredLayoutVariant,
      supported: true,
      referenceImages: [],
    },
    envelope: {
      title: '标书风险维度静态页',
      fixedStructure: ['按风险维度组织标书内容'],
      variableZones: ['风险概览', '资格风险', '材料缺口', '应答建议'],
      outputHint: '输出适合客户和团队传阅的静态页',
      pageSections: ['风险概览', '资格风险', '材料缺口', '应答建议', 'AI综合分析'],
    },
  };
}

test('buildReportPlan should produce a client-facing page plan with reusable envelope', () => {
  const plan = buildReportPlan({
    requestText: '请基于 bids 知识库按风险维度生成可视化静态页报表。',
    templateTaskHint: 'bids-static-page',
    conceptPageMode: true,
    selectedTemplates: [makeSelectedTemplate()],
    retrieval: makeRetrieval(),
    libraries: [{ key: 'bids', label: 'bids' }],
  });

  assert.equal(plan.audience, 'client');
  assert.equal(plan.templateMode, 'concept-page');
  assert.equal(plan.envelope.title, '标书风险维度静态页');
  assert.deepEqual(plan.envelope.pageSections, ['风险概览', '资格风险', '材料缺口', '应答建议', 'AI综合分析']);
  assert.ok(plan.cards.length >= 3);
  assert.ok(plan.datavizSlots.length >= 2);
  assert.equal(plan.datavizSlots[0]?.placement, 'hero');
  assert.equal(plan.datavizSlots[0]?.preferredChartType, 'horizontal-bar');
  assert.equal(plan.pageSpec.layoutVariant, 'risk-brief');
  assert.equal(plan.pageSpec.heroDatavizSlotKeys[0], plan.datavizSlots[0]?.key);
  assert.ok(plan.sections.some((item) => (item.datavizSlotKeys || []).length > 0));
  assert.ok(plan.sections.some((item) => item.title === 'AI综合分析' && item.completionMode === 'knowledge-plus-model'));
  assert.match(plan.objective, /bid analysis page/i);
  assert.deepEqual(plan.knowledgeScope.dominantTopics, ['资格风险', '材料缺口', '时间风险', '交付要求']);
});

test('buildReportPlan should prefer selected template layoutVariant over task inference', () => {
  const plan = buildReportPlan({
    requestText: '请基于 bids 知识库按风险维度生成可视化静态页报表。',
    templateTaskHint: 'bids-static-page',
    conceptPageMode: true,
    selectedTemplates: [makeSelectedTemplate('solution-overview')],
    retrieval: makeRetrieval(),
    libraries: [{ key: 'bids', label: 'bids' }],
  });

  assert.equal(plan.pageSpec.layoutVariant, 'solution-overview');
});

test('buildReportPlanContextBlock should expose planning constraints for the generator', () => {
  const plan = buildReportPlan({
    requestText: '请基于 IOT 解决方案知识库生成可视化静态页。',
    templateTaskHint: 'iot-static-page',
    conceptPageMode: false,
    selectedTemplates: [],
    retrieval: makeRetrieval({
      documents: [
        {
          path: 'storage/files/uploads/iot-a.pdf',
          name: 'iot-a.pdf',
          ext: '.pdf',
          title: 'IOT 方案资料',
          category: 'technical',
          parseStatus: 'parsed',
          summary: '包含设备、网关、平台和接口能力。',
          excerpt: '包含设备、网关、平台和接口能力。',
          extractedChars: 1300,
          schemaType: 'technical',
          topicTags: ['设备接入', '平台能力'],
          parseStage: 'detailed',
        },
      ],
      meta: {
        stages: ['rule'],
        vectorEnabled: false,
        candidateCount: 1,
        rerankedCount: 1,
        intent: 'iot',
        templateTask: 'iot-static-page',
      },
    }),
    libraries: [{ key: 'iot', label: 'IOT解决方案' }],
  });

  const block = buildReportPlanContextBlock(plan);
  assert.match(block, /Audience: client/);
  assert.match(block, /Template mode: shared-template/);
  assert.match(block, /Planned sections:/);
  assert.match(block, /Planned cards:/);
  assert.match(block, /Planned dataviz slots:/);
  assert.match(block, /Page spec layout: solution-overview/);
  assert.match(block, /Page spec sections:/);
  assert.match(block, /type=bar/);
  assert.match(block, /Knowledge libraries: IOT解决方案/);
});

test('inferReportPlanTaskHint should resolve domain page hints from request, group, and template signals', () => {
  assert.equal(
    inferReportPlanTaskHint({
      requestText: '请基于 bids 知识库输出静态页',
      kind: 'page',
    }),
    'bids-static-page',
  );
  assert.equal(
    inferReportPlanTaskHint({
      groupLabel: 'IOT解决方案',
      templateLabel: 'IOT 解决方案静态页',
      kind: 'page',
    }),
    'iot-static-page',
  );
  assert.equal(
    inferReportPlanTaskHint({
      requestText: '请按简历候选人维度整理客户汇报页',
      kind: 'page',
    }),
    'resume-comparison',
  );
  assert.equal(
    inferReportPlanTaskHint({
      requestText: '请整理合同风险要点',
      kind: 'page',
    }),
    'contract-risk',
  );
  assert.equal(
    inferReportPlanTaskHint({
      requestText: '请基于广州AI知识库输出商场客流报表，按商场分区汇总',
      kind: 'page',
    }),
    'footfall-static-page',
  );
});

test('buildReportPlan should use client-facing resume sections and planned visuals', () => {
  const plan = buildReportPlan({
    requestText: '请基于简历库生成客户汇报型静态页',
    templateTaskHint: 'resume-comparison',
    conceptPageMode: true,
    selectedTemplates: [],
    retrieval: {
      documents: [
        {
          path: 'storage/files/uploads/resume-a.pdf',
          name: 'resume-a.pdf',
          ext: '.pdf',
          title: '夏天宇简历',
          category: 'resume',
          parseStatus: 'parsed',
          summary: '夏天宇，阿里斑马网络产品经理，负责智能座舱与 AIGC 项目。',
          excerpt: '夏天宇，5年经验。',
          extractedChars: 1200,
          schemaType: 'resume',
          topicTags: ['智能座舱', 'AIGC'],
          parseStage: 'detailed',
        },
      ],
      evidenceMatches: [],
      meta: {
        stages: ['rule'],
        vectorEnabled: false,
        candidateCount: 1,
        rerankedCount: 1,
        intent: 'resume',
        templateTask: 'resume-comparison',
      },
    },
    libraries: [{ key: 'resume', label: '简历' }],
  });

  assert.equal(plan.envelope.title, '简历客户汇报静态页');
  assert.deepEqual(plan.envelope.pageSections, ['客户概览', '代表候选人', '代表项目', '技能覆盖', '匹配建议', 'AI综合分析']);
  assert.deepEqual(plan.cards.map((item) => item.label), ['候选人覆盖', '公司覆盖', '项目匹配', '技能热点']);
  assert.deepEqual(plan.charts.map((item) => item.title), ['公司覆盖分布', '技能热点分布']);
  assert.deepEqual(plan.datavizSlots.map((item) => item.title), ['公司覆盖分布', '技能热点分布']);
  assert.ok(plan.datavizSlots.every((item) => item.preferredChartType === 'horizontal-bar'));
  assert.deepEqual(plan.pageSpec.heroCardLabels, ['候选人覆盖', '公司覆盖', '项目匹配', '技能热点']);
  assert.equal(plan.pageSpec.layoutVariant, 'talent-showcase');
});

test('buildReportPlan should keep footfall reports at mall-zone aggregation level', () => {
  const plan = buildReportPlan({
    requestText: '请基于广州AI知识库输出商场客流报表静态页，统一按商场分区汇总，不展开楼层和单间。',
    templateTaskHint: 'footfall-static-page',
    conceptPageMode: true,
    selectedTemplates: [],
    retrieval: {
      documents: [
        {
          path: 'storage/files/uploads/footfall-a.csv',
          name: 'footfall-a.csv',
          ext: '.csv',
          title: '广州 AI 商场客流日报',
          category: 'report',
          bizCategory: 'footfall',
          parseStatus: 'parsed',
          summary: '包含商场分区、楼层分区和单间粒度的客流数据，当前统一按商场分区汇总。',
          excerpt: 'mall_zone,floor_zone,room_unit,visitor_count',
          extractedChars: 980,
          schemaType: 'report',
          topicTags: ['客流分析', '商场分区', '客流报表'],
          parseStage: 'detailed',
          structuredProfile: {
            reportFocus: 'footfall',
            totalFootfall: '4830',
            topMallZone: 'A区',
            mallZoneCount: '3',
            aggregationLevel: 'mall-zone',
            mallZones: ['A区', 'B区', 'C区'],
          },
        },
      ],
      evidenceMatches: [],
      meta: {
        stages: ['rule'],
        vectorEnabled: false,
        candidateCount: 1,
        rerankedCount: 1,
        intent: 'footfall',
        templateTask: 'footfall-static-page',
      },
    },
    libraries: [{ key: 'guangzhou-ai', label: '广州AI' }],
  });

  assert.equal(plan.envelope.title, '客户汇报型商场客流分区驾驶舱');
  assert.deepEqual(plan.envelope.pageSections, ['客流总览', '商场分区贡献', '重点分区对比', '商场动线提示', '行动建议', 'AI综合分析']);
  assert.ok(plan.objective.includes('mall-zone level'));
  assert.deepEqual(plan.cards.map((item) => item.label), ['总客流', '商场分区数', '头部分区', '展示口径']);
  assert.deepEqual(plan.charts.map((item) => item.title), ['商场分区客流贡献', '重点分区客流梯队']);
  assert.equal(plan.datavizSlots[0]?.preferredChartType, 'bar');
  assert.equal(plan.datavizSlots[1]?.preferredChartType, 'horizontal-bar');
  assert.ok(plan.pageSpec.sections.some((item) => item.datavizSlotKeys.length > 0));
});

test('buildReportPlan should prefer business-specific footfall titles when the request names a mall', () => {
  const plan = buildReportPlan({
    requestText: '使用知识库广州AI对高明中港城客流采集的数据输出一份商场客流静态页并分析',
    templateTaskHint: 'footfall-static-page',
    conceptPageMode: true,
    selectedTemplates: [],
    retrieval: {
      documents: [
        {
          path: 'storage/files/uploads/gaoming-footfall.xlsx',
          name: 'gaoming-footfall.xlsx',
          ext: '.xlsx',
          title: '高明中港城客流日报',
          category: 'report',
          bizCategory: 'footfall',
          parseStatus: 'parsed',
          summary: '高明中港城按商场分区汇总的客流数据。',
          excerpt: 'mall_zone,visitor_count',
          extractedChars: 720,
          schemaType: 'report',
          topicTags: ['客流分析', '商场分区'],
          parseStage: 'detailed',
          structuredProfile: {
            reportFocus: 'footfall',
            totalFootfall: '4830',
            topMallZone: 'A区',
            mallZoneCount: '3',
            aggregationLevel: 'mall-zone',
          },
        },
      ],
      evidenceMatches: [],
      meta: {
        stages: ['rule'],
        vectorEnabled: false,
        candidateCount: 1,
        rerankedCount: 1,
        intent: 'footfall',
        templateTask: 'footfall-static-page',
      },
    },
    libraries: [{ key: 'guangzhou-ai', label: '广州AI' }],
  });

  assert.equal(plan.envelope.title, '高明中港城商场客流分析报告');
});
