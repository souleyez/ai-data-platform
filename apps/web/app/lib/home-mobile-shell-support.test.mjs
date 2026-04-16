import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMobileDatasetSummary, sumLibraryDocuments } from './home-mobile-shell-support.mjs';

test('sumLibraryDocuments should total document counts safely', () => {
  assert.equal(
    sumLibraryDocuments([
      { key: 'resume', documentCount: 3 },
      { key: 'order', documentCount: 7 },
    ]),
    10,
  );
});

test('buildMobileDatasetSummary should collapse to all datasets when none are explicitly selected', () => {
  assert.deepEqual(
    buildMobileDatasetSummary({
      selectedLibraries: [],
      totalLibraries: 4,
      totalDocuments: 28,
    }),
    {
      title: '全部数据集',
      meta: '4 个数据集 · 28 份文档',
    },
  );
});

test('buildMobileDatasetSummary should show the single selected dataset directly', () => {
  assert.deepEqual(
    buildMobileDatasetSummary({
      selectedLibraries: [{ key: 'resume', label: '人才简历库', documentCount: 6 }],
      totalLibraries: 4,
      totalDocuments: 28,
    }),
    {
      title: '人才简历库',
      meta: '6 份文档',
    },
  );
});

test('buildMobileDatasetSummary should collapse long multi-selection into counts', () => {
  assert.deepEqual(
    buildMobileDatasetSummary({
      selectedLibraries: [
        { key: 'resume', label: '人才简历库', documentCount: 6 },
        { key: 'order', label: '订单分析知识库', documentCount: 8 },
        { key: 'paper', label: '学术论文资料集', documentCount: 5 },
      ],
      totalLibraries: 5,
      totalDocuments: 40,
    }),
    {
      title: '3 个数据集',
      meta: '19 份文档',
    },
  );
});
