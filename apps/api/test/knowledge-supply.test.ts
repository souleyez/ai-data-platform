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
