import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConceptPageSupplyBlock,
  buildKnowledgeChatHistory,
  prepareKnowledgeRetrieval,
} from '../src/lib/knowledge-supply.js';

test('buildKnowledgeChatHistory should drop short operational feedback and keep relevant dialogue', () => {
  const history = buildKnowledgeChatHistory(
    [
      { role: 'assistant', content: '上传成功，已入库。' },
      { role: 'user', content: '我刚上传了一批简历。' },
      { role: 'assistant', content: '好的，我已经看到最近上传的简历摘要。' },
      { role: 'user', content: '按公司维度整理 IT 项目信息。' },
      { role: 'assistant', content: '可以，我会基于相关简历来整理。' },
    ],
    '按公司维度整理简历里的 IT 项目信息',
  );

  assert.equal(history.length, 2);
  assert.equal(history[0]?.content, '按公司维度整理 IT 项目信息。');
  assert.equal(history[1]?.content, '可以，我会基于相关简历来整理。');
});

test('prepareKnowledgeRetrieval should produce fallback metadata and chunk ids when rule retrieval is empty', async () => {
  const supply = await prepareKnowledgeRetrieval({
    requestText: 'zzqxv unmatched prompt',
    knowledgeChatHistory: [],
    libraries: [{ key: 'resume', label: '简历' }],
    scopedItems: [
      {
        path: 'C:\\tmp\\resume-1.txt',
        name: 'resume-1.txt',
        title: 'Resume 1',
        ext: '.txt',
        summary: '',
        excerpt: '',
        category: 'general',
        bizCategory: 'general',
        parseStatus: 'success',
        extractedChars: 120,
        topicTags: [],
        confirmedGroups: ['简历'],
        groups: ['简历'],
        evidenceChunks: ['Built an ERP integration project for employer A.'],
        claims: [],
      } as any,
      {
        path: 'C:\\tmp\\resume-2.txt',
        name: 'resume-2.txt',
        title: 'Resume 2',
        ext: '.txt',
        summary: '',
        excerpt: '',
        category: 'general',
        bizCategory: 'general',
        parseStatus: 'success',
        extractedChars: 160,
        topicTags: [],
        confirmedGroups: ['简历'],
        groups: ['简历'],
        evidenceChunks: ['Implemented API gateway migration for employer B.'],
        claims: [],
      } as any,
    ],
    docLimit: 6,
    evidenceLimit: 8,
  });

  assert.equal(supply.effectiveRetrieval.meta.candidateCount, 2);
  assert.equal(supply.effectiveRetrieval.meta.rerankedCount, 2);
  assert.equal(supply.effectiveRetrieval.documents.length, 2);
  assert.ok(supply.effectiveRetrieval.evidenceMatches.every((item) => item.chunkId.startsWith('fallback-')));
});

test('buildConceptPageSupplyBlock should provide structure hints for resume company pages', () => {
  const block = buildConceptPageSupplyBlock({
    requestText: '基于人才简历知识库，按公司维度输出数据可视化静态页',
    libraries: [{ key: 'resume', label: '人才简历' }],
    retrieval: {
      documents: [
        {
          path: 'C:\\tmp\\resume-1.txt',
          name: 'resume-1.txt',
          title: 'Resume 1',
          ext: '.txt',
          summary: 'A company-side ERP project.',
          excerpt: '',
          category: 'resume',
          bizCategory: 'general',
          parseStatus: 'success',
          extractedChars: 120,
          parseStage: 'detailed',
          detailParseStatus: 'succeeded',
          topicTags: ['ERP', '交付'],
          structuredProfile: {
            candidateName: '张三',
            latestCompany: '甲公司',
            companies: ['甲公司'],
            itProjectHighlights: ['ERP 升级项目'],
            skills: ['Java', 'ERP'],
          },
        } as any,
      ],
      evidenceMatches: [],
      meta: { candidateCount: 1, rerankedCount: 1 },
    } as any,
    templateTaskHint: 'resume-comparison',
  });

  assert.match(block, /Concept page supply:/);
  assert.match(block, /Primary grouping dimension: company/);
  assert.match(block, /Recommended sections:/);
  assert.match(block, /公司概览/);
  assert.match(block, /Recommended cards:/);
  assert.match(block, /Grouping hints:/);
});

test('buildConceptPageSupplyBlock should provide paper result sections when paper task is selected', () => {
  const block = buildConceptPageSupplyBlock({
    requestText: '请基于学术论文知识库按研究结果维度输出数据可视化静态页',
    libraries: [{ key: 'paper', label: '学术论文' }],
    retrieval: {
      documents: [
        {
          path: 'C:\\tmp\\paper-1.pdf',
          name: 'paper-1.pdf',
          title: 'Clinical Study 1',
          ext: '.pdf',
          summary: 'A randomized paper with outcome signals.',
          excerpt: '',
          category: 'paper',
          bizCategory: 'paper',
          parseStatus: 'success',
          extractedChars: 220,
          parseStage: 'detailed',
          detailParseStatus: 'succeeded',
          topicTags: ['试验', '结果'],
          structuredProfile: {
            methodology: 'randomized placebo controlled',
            resultSignals: ['改善主要指标'],
            metricSignals: ['primary endpoint'],
            publicationSignals: ['peer reviewed'],
          },
        } as any,
      ],
      evidenceMatches: [],
      meta: { candidateCount: 1, rerankedCount: 1 },
    } as any,
    templateTaskHint: 'paper-static-page',
  });

  assert.match(block, /Primary grouping dimension: result/);
  assert.match(block, /核心发现/);
  assert.match(block, /结果指标/);
});

test('buildConceptPageSupplyBlock should provide bid risk sections and grouping hints for bid concept pages', () => {
  const block = buildConceptPageSupplyBlock({
    requestText: '请基于 bids 知识库按风险维度输出静态页，重点看资格风险、材料缺口和时间风险。',
    libraries: [{ key: 'bids', label: 'bids' }],
    retrieval: {
      documents: [
        {
          path: 'C:\\tmp\\bid-1.md',
          name: 'bid-1.md',
          title: 'Hospital Tender 1',
          ext: '.md',
          summary: 'Medical device tender with qualification, materials, and deadline risks.',
          excerpt: '',
          category: 'general',
          bizCategory: 'general',
          parseStatus: 'success',
          extractedChars: 260,
          parseStage: 'detailed',
          detailParseStatus: 'succeeded',
          topicTags: ['医疗设备', '投标'],
          structuredProfile: {
            riskSignals: ['资格预审', '截止时间'],
            qualificationSignals: ['资质证书', '业绩案例'],
            sectionSignals: ['技术应答', '商务条款'],
          },
        } as any,
      ],
      evidenceMatches: [],
      meta: { candidateCount: 1, rerankedCount: 1 },
    } as any,
    templateTaskHint: 'bids-static-page',
  });

  assert.match(block, /Primary grouping dimension: risk/);
  assert.match(block, /Recommended sections:/);
  assert.match(block, /资格风险/);
  assert.match(block, /材料缺口/);
  assert.match(block, /Recommended cards:/);
  assert.match(block, /Grouping hints:/);
  assert.match(block, /资格预审/);
});

test('buildConceptPageSupplyBlock should use scenario grouping hints for iot concept pages', () => {
  const block = buildConceptPageSupplyBlock({
    requestText: '请基于 IOT解决方案 知识库按场景维度输出静态页，重点梳理行业场景、客户痛点和部署方式。',
    libraries: [{ key: 'iot解决方案', label: 'IOT解决方案' }],
    retrieval: {
      documents: [
        {
          path: 'C:\\tmp\\iot-1.md',
          name: 'iot-1.md',
          title: 'Smart Warehouse Solution',
          ext: '.md',
          summary: 'A smart warehouse IOT solution with edge and cloud deployment.',
          excerpt: '',
          category: 'technical',
          bizCategory: 'iot',
          parseStatus: 'success',
          extractedChars: 280,
          parseStage: 'detailed',
          detailParseStatus: 'succeeded',
          topicTags: ['智慧仓储', '仓配'],
          structuredProfile: {
            targetScenario: ['智慧仓储', '区域仓配'],
            deploymentMode: '边缘 + 云',
            customerSignals: ['仓配中心'],
          },
        } as any,
      ],
      evidenceMatches: [],
      meta: { candidateCount: 1, rerankedCount: 1 },
    } as any,
    templateTaskHint: 'iot-static-page',
  });

  assert.match(block, /Primary grouping dimension: scenario/);
  assert.match(block, /Recommended sections:/);
  assert.match(block, /场景概览/);
  assert.match(block, /Recommended cards:/);
  assert.match(block, /Grouping hints:/);
  assert.match(block, /智慧仓储/);
  assert.match(block, /边缘 \+ 云/);
});

test('buildConceptPageSupplyBlock should provide module sections for iot module pages', () => {
  const block = buildConceptPageSupplyBlock({
    requestText: '请基于 IOT解决方案 知识库按模块维度输出静态页，重点梳理设备、网关、平台和接口集成。',
    libraries: [{ key: 'iot解决方案', label: 'IOT解决方案' }],
    retrieval: {
      documents: [
        {
          path: 'C:\\tmp\\iot-2.md',
          name: 'iot-2.md',
          title: 'IOT Reference Architecture',
          ext: '.md',
          summary: 'Reference architecture covering gateway, rules engine, and API integration.',
          excerpt: '',
          category: 'technical',
          bizCategory: 'iot',
          parseStatus: 'success',
          extractedChars: 320,
          parseStage: 'detailed',
          detailParseStatus: 'succeeded',
          topicTags: ['设备接入', '接口集成'],
          structuredProfile: {
            moduleSignals: ['设备接入', '规则引擎'],
            interfaceType: 'MQTT / REST',
            integrationSignals: ['WMS', 'ERP'],
            valueSignals: ['库存可视化'],
          },
        } as any,
      ],
      evidenceMatches: [],
      meta: { candidateCount: 1, rerankedCount: 1 },
    } as any,
    templateTaskHint: 'iot-static-page',
  });

  assert.match(block, /Primary grouping dimension: module/);
  assert.match(block, /模块概览/);
  assert.match(block, /接口集成/);
  assert.match(block, /Grouping hints:/);
  assert.match(block, /设备接入/);
  assert.match(block, /MQTT \/ REST/);
});
