import test from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedDocument } from '../src/lib/document-parser.js';
import type { RetrievalResult } from '../src/lib/document-retrieval.js';
import {
  buildKnowledgeDetailFallbackAnswer,
  runKnowledgeDetailFetch,
} from '../src/lib/knowledge-detail-fetch.js';

const DEGRADED_HINT = /\u6ca1\u6709\u5b8c\u6210\u4e91\u7aef\u8be6\u60c5\u751f\u6210/;

function makeRetrievalResult(): RetrievalResult {
  const document: ParsedDocument = {
    path: 'storage/files/uploads/resume-a.pdf',
    name: 'resume-a.pdf',
    ext: '.pdf',
    title: 'Candidate A Resume',
    category: 'resume',
    bizCategory: 'general',
    parseStatus: 'parsed',
    summary: 'Candidate A led the smart-campus platform and payment-middle-office delivery.',
    excerpt: 'Candidate A has stable project evidence.',
    extractedChars: 1024,
    schemaType: 'resume',
    evidenceChunks: [
      {
        id: 'chunk-1',
        order: 0,
        text: 'Latest company is Guangzhou Avanti Electronics and the candidate joined the smart-campus delivery.',
        charLength: 96,
      },
    ],
    structuredProfile: {
      candidateName: 'Candidate A',
      latestCompany: 'Guangzhou Avanti Electronics',
      projectHighlights: ['Smart Campus Platform'],
    },
  };

  return {
    documents: [document],
    evidenceMatches: [
      {
        item: document,
        chunkText: 'Latest company is Guangzhou Avanti Electronics and the candidate joined the smart-campus delivery.',
        score: 0.91,
      },
    ],
    meta: {
      stages: ['rule'],
      vectorEnabled: false,
      candidateCount: 1,
      rerankedCount: 1,
      intent: 'resume',
      templateTask: 'general',
    },
  };
}

test('buildKnowledgeDetailFallbackAnswer should stay honest about degraded detail generation', () => {
  const content = buildKnowledgeDetailFallbackAnswer({
    requestText: '\u6700\u65b0\u90a3\u4efd\u7b80\u5386\u6700\u8fd1\u516c\u53f8\u662f\u4ec0\u4e48\uff1f',
    libraries: [{ key: 'resume', label: '\u7b80\u5386' }],
    retrieval: makeRetrievalResult(),
  });

  assert.match(content, /\u7b80\u5386/);
  assert.match(content, DEGRADED_HINT);
  assert.match(content, /Candidate A Resume/);
  assert.match(content, /Guangzhou Avanti Electronics/);
});

test('runKnowledgeDetailFetch should degrade locally when gateway is not configured', async () => {
  const previousUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  delete process.env.OPENCLAW_GATEWAY_URL;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const result = await runKnowledgeDetailFetch({
      requestText: '\u6700\u65b0\u90a3\u4efd\u7b80\u5386\u6700\u8fd1\u516c\u53f8\u662f\u4ec0\u4e48\uff1f',
      libraries: [{ key: 'resume', label: '\u7b80\u5386' }],
      retrieval: makeRetrievalResult(),
    });

    assert.equal(result.provider, 'degraded-local');
    assert.equal(result.model, 'degraded-local');
    assert.match(result.content, DEGRADED_HINT);
    assert.match(result.content, /Guangzhou Avanti Electronics/);
  } finally {
    if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = previousUrl;

    if (previousToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = previousToken;
  }
});
