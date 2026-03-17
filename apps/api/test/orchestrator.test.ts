import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackAnswer } from '../src/lib/orchestrator.js';
import type { ParsedDocument } from '../src/lib/document-parser.js';

const singleDoc: ParsedDocument = {
  path: '/tmp/whitebook.pdf',
  name: '后生元白皮书.pdf',
  ext: '.pdf',
  title: '后生元白皮书',
  category: 'technical',
  bizCategory: 'paper',
  parseStatus: 'parsed',
  summary: '后生元白皮书聚焦后生元定义、产业价值、应用方向与成果转化路径。',
  excerpt: '白皮书从产业生态、科研共建、应用场景三个方向介绍后生元的价值。',
  extractedChars: 3000,
  topicTags: ['肠道健康', '白皮书'],
};

const compareDocs: ParsedDocument[] = [
  {
    path: '/tmp/a.pdf',
    name: '减脂运动研究.pdf',
    ext: '.pdf',
    title: '减脂运动研究',
    category: 'paper',
    bizCategory: 'paper',
    parseStatus: 'parsed',
    summary: '该研究围绕减脂和运动表现展开。',
    excerpt: '研究提到 weight loss 与 exercise performance。',
    extractedChars: 2400,
    topicTags: ['运动代谢'],
  },
  {
    path: '/tmp/b.pdf',
    name: '脑健康研究.pdf',
    ext: '.pdf',
    title: '脑健康研究',
    category: 'paper',
    bizCategory: 'paper',
    parseStatus: 'parsed',
    summary: '该研究围绕脑功能和肠脑轴展开。',
    excerpt: '研究提到 brain function 与 gut microbiome。',
    extractedChars: 2500,
    topicTags: ['脑健康', '肠道健康'],
  },
];

test('fallback answer should be question-oriented for a single document', () => {
  const answer = buildFallbackAnswer('请总结后生元白皮书的主要价值和适用场景', 'doc', [singleDoc]);
  assert.match(answer, /围绕“主要价值”来看/);
  assert.match(answer, /后生元白皮书.pdf/);
  assert.doesNotMatch(answer, /技术文档汇总已完成/);
});

test('fallback answer should summarize multi-doc takeaway for comparison prompts', () => {
  const answer = buildFallbackAnswer('这批资料里哪些更偏减脂/运动，哪些更偏脑健康？', 'doc', compareDocs);
  assert.match(answer, /围绕“主题归纳”/);
  assert.match(answer, /减脂运动研究.pdf/);
  assert.match(answer, /脑健康研究.pdf/);
});
