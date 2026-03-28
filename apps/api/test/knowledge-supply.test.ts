import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKnowledgeChatHistory, prepareKnowledgeRetrieval } from '../src/lib/knowledge-supply.js';

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
