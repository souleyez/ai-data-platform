import test from 'node:test';
import assert from 'node:assert/strict';
import { matchDocumentsByPrompt } from '../src/lib/document-store.js';
import type { ParsedDocument } from '../src/lib/document-parser.js';

const docs: ParsedDocument[] = [
  {
    path: '/tmp/sample-contract.txt',
    name: 'sample-contract.txt',
    ext: '.txt',
    category: 'contract',
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
    category: 'technical',
    parseStatus: 'parsed',
    summary: '技术文档覆盖设备接入、边缘计算、数据采集与告警联动。',
    excerpt: '重点包括 API 接口设计、部署规范与异常告警推送。',
    extractedChars: 72,
    topicTags: ['设备接入', '边缘计算', '数据采集', '告警联动', '接口设计'],
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
