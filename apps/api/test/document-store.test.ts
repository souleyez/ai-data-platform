import test from 'node:test';
import assert from 'node:assert/strict';
import { matchDocumentsByPrompt } from '../src/lib/document-store.js';
import type { ParsedDocument } from '../src/lib/document-parser.js';

const docs: ParsedDocument[] = [
  {
    path: '/tmp/sample-contract.txt',
    name: 'sample-contract.txt',
    ext: '.txt',
    title: 'sample-contract',
    category: 'contract',
    bizCategory: 'contract',
    parseStatus: 'parsed',
    summary: '合同付款节点定义不够清晰，存在回款周期过长与违约责任偏弱风险。',
    excerpt: '合同编号 HT-2026-018，付款条款为验收后90天支付70%。',
    extractedChars: 80,
    riskLevel: 'high',
    topicTags: [],
    contractFields: {
      contractNo: 'HT-2026-018',
      paymentTerms: '验收后90天支付70%',
      duration: '12个月',
    },
  },
  {
    path: '/tmp/sample-tech-doc.txt',
    name: 'sample-tech-doc.txt',
    ext: '.txt',
    title: 'sample-tech-doc',
    category: 'technical',
    bizCategory: 'technical',
    parseStatus: 'parsed',
    summary: '技术文档覆盖设备接入、边缘计算、数据采集与告警联动。',
    excerpt: '重点包括 API 接口设计、部署规范与异常告警推送。',
    extractedChars: 72,
    topicTags: ['设备接入', '边缘计算', '数据采集', '告警联动', '接口设计'],
  },
  {
    path: '/tmp/allergic-rhinitis-study.pdf',
    name: 'allergic-rhinitis-study.pdf',
    ext: '.pdf',
    title: 'allergic-rhinitis-study',
    category: 'paper',
    bizCategory: 'paper',
    parseStatus: 'parsed',
    summary: 'Randomized placebo-controlled study about allergic rhinitis in children.',
    excerpt: 'Double-blind randomized placebo-controlled study with clear abstract and results sections.',
    extractedChars: 2400,
    topicTags: ['过敏免疫', '随机对照'],
  },
  {
    path: '/tmp/scanned-paper.pdf',
    name: 'scanned-paper.pdf',
    ext: '.pdf',
    title: 'scanned-paper',
    category: 'paper',
    bizCategory: 'paper',
    parseStatus: 'parsed',
    summary: '文档内容为空或暂未提取到文本。',
    excerpt: '文档内容为空或暂未提取到文本。',
    extractedChars: 0,
    topicTags: [],
  },
];

test('matches technical document for Chinese prompt without whitespace tokenization', () => {
  const matches = matchDocumentsByPrompt(docs, '帮我总结技术文档重点');
  assert.equal(matches[0]?.category, 'technical');
});

test('matches contract document for Chinese risk prompt', () => {
  const matches = matchDocumentsByPrompt(docs, '看下这个合同的付款风险');
  assert.equal(matches[0]?.category, 'contract');
  assert.equal(matches[0]?.contractFields?.contractNo, 'HT-2026-018');
});

test('contract intent should prioritize contract docs over technical docs', () => {
  const matches = matchDocumentsByPrompt(docs, '请审查这个合同的付款条款和违约风险');
  assert.equal(matches[0]?.category, 'contract');
  assert.ok(matches.every((item, index) => index === 0 || item.category !== 'technical'));
});

test('technical intent should prioritize technical docs over contract docs', () => {
  const matches = matchDocumentsByPrompt(docs, '请基于论文和技术文档做摘要');
  assert.equal(matches[0]?.category, 'technical');
  assert.ok(matches.every((item, index) => index === 0 || item.category !== 'contract'));
});

test('paper prompts should prioritize parsed study documents over empty parsed PDFs', () => {
  const matches = matchDocumentsByPrompt(docs, '请总结这篇过敏性鼻炎随机对照论文的结论');
  assert.equal(matches[0]?.name, 'allergic-rhinitis-study.pdf');
  assert.notEqual(matches[0]?.name, 'scanned-paper.pdf');
});
