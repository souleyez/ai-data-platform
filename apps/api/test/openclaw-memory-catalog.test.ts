import test from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedDocument } from '../src/lib/document-parser.js';
import {
  buildCatalogMemoryDetail,
  buildReportOutputMemorySnapshots,
  resolveCatalogMemoryDetailLevel,
  selectCatalogMemoryTitle,
} from '../src/lib/openclaw-memory-catalog.js';

test('resolveCatalogMemoryDetailLevel should deepen memory for smaller libraries', () => {
  assert.equal(resolveCatalogMemoryDetailLevel(8), 'deep');
  assert.equal(resolveCatalogMemoryDetailLevel(40), 'medium');
  assert.equal(resolveCatalogMemoryDetailLevel(300), 'shallow');
});

test('selectCatalogMemoryTitle should fall back to file name for raw csv-like titles', () => {
  const title = selectCatalogMemoryTitle({
    title: 'order_id,order_date,platform,shop_name,region,category,sku,unit_price,quantity',
    name: 'default-sample-order-electronics-omni-1000-orders-q1-2026.csv',
    path: 'C:/tmp/default-sample-order-electronics-omni-1000-orders-q1-2026.csv',
  });

  assert.equal(title, 'default-sample-order-electronics-omni-1000-orders-q1-2026');
});

test('buildCatalogMemoryDetail should expose deeper key facts for small-library resume documents', () => {
  const item = {
    path: 'resume-a.md',
    name: 'resume-a.md',
    ext: '.md',
    title: 'Alice Zhang Resume',
    category: 'resume',
    bizCategory: 'general',
    parseStatus: 'parsed',
    summary: 'Focused on IOT solutions, product design, and delivery.',
    excerpt: 'Latest company is Guangzhou AFT Electronics with 10 years of experience.',
    extractedChars: 800,
    schemaType: 'resume',
    topicTags: ['resume', 'product-manager'],
    resumeFields: {
      candidateName: 'Alice Zhang',
      targetRole: 'Product Manager',
      latestCompany: 'Guangzhou AFT Electronics',
      yearsOfExperience: '10 years',
      education: 'Bachelor',
      skills: ['product design', 'requirements analysis', 'IOT', 'delivery'],
      projectHighlights: ['smart park platform', 'device access platform'],
    },
    evidenceChunks: [
      { id: 'chunk-1', order: 0, text: 'Led smart park platform planning and device access delivery.', charLength: 62 },
    ],
  } satisfies ParsedDocument;

  const detail = buildCatalogMemoryDetail(item, 'deep');
  assert.deepEqual(detail.topicTags, ['resume', 'product-manager']);
  assert.ok(detail.keyFacts.some((line) => line.includes('Candidate: Alice Zhang')));
  assert.ok(detail.keyFacts.some((line) => line.includes('Latest company: Guangzhou AFT Electronics')));
  assert.ok(detail.keyFacts.some((line) => line.includes('Skills: product design, requirements analysis, IOT, delivery')));
  assert.ok(detail.evidenceHighlights.some((line) => line.includes('smart park platform')));
});

test('buildCatalogMemoryDetail should keep order library details compact but informative', () => {
  const item = {
    path: 'order-summary.csv',
    name: 'order-summary.csv',
    ext: '.csv',
    title: '2026 Q1 multi-channel order summary',
    category: 'general',
    bizCategory: 'order',
    parseStatus: 'parsed',
    summary: 'Summarizes Tmall, JD, and Douyin performance with sales, margin, and replenishment signals.',
    excerpt: 'month,platform,category,net_sales,gross_profit,replenishment',
    extractedChars: 500,
    schemaType: 'report',
    topicTags: ['order-analysis', 'channel-ops', 'quarterly-review'],
    structuredProfile: {
      platforms: ['tmall', 'jd', 'douyin'],
      categorySignals: ['wearables', 'audio', 'smart-home'],
      metricSignals: ['gmv', 'inventory-index'],
      replenishmentSignals: ['replenishment', 'restock'],
      anomalySignals: ['anomaly'],
    },
    evidenceChunks: [
      { id: 'chunk-1', order: 0, text: 'Douyin leads net sales, while wearables and audio remain the core categories.', charLength: 82 },
    ],
  } satisfies ParsedDocument;

  const detail = buildCatalogMemoryDetail(item, 'medium');
  assert.deepEqual(detail.topicTags, ['order-analysis', 'channel-ops', 'quarterly-review']);
  assert.ok(detail.keyFacts.some((line) => line.includes('platforms: tmall, jd, douyin')));
  assert.ok(detail.keyFacts.some((line) => line.includes('category Signals: wearables, audio, smart-home') || line.includes('category signals: wearables, audio, smart-home')));
  assert.ok(!detail.keyFacts.some((line) => line.startsWith('Candidate:')));
  assert.ok(!detail.keyFacts.some((line) => line.startsWith('Latest company:')));
  assert.ok(!detail.keyFacts.some((line) => line.startsWith('companies:')));
  assert.ok(detail.evidenceHighlights.some((line) => line.includes('Douyin leads net sales')));
});

test('buildCatalogMemoryDetail should suppress resume facts for non-resume business documents', () => {
  const item = {
    path: 'divoom-proposal.pdf',
    name: 'divoom-proposal.pdf',
    ext: '.pdf',
    title: 'Divoom AI Collaboration Platform',
    category: 'technical',
    bizCategory: 'order',
    parseStatus: 'parsed',
    summary: 'Build an AI collaboration layer on top of ERP and ecommerce data.',
    excerpt: 'Website / ERP / ecommerce backends feed a shared AI layer.',
    extractedChars: 600,
    schemaType: 'resume',
    topicTags: ['erp-integration', 'ecommerce-platform'],
    resumeFields: {
      candidateName: 'Marketing',
      latestCompany: 'AI Collaboration Platform',
      companies: ['AI Collaboration Platform'],
    },
    evidenceChunks: [
      { id: 'chunk-1', order: 0, text: 'Use product knowledge and ERP data to build an enterprise AI collaboration platform.', charLength: 88 },
    ],
  } satisfies ParsedDocument;

  const detail = buildCatalogMemoryDetail(item, 'deep');
  assert.ok(!detail.keyFacts.some((line) => line.startsWith('Candidate:')));
  assert.ok(!detail.keyFacts.some((line) => line.startsWith('Latest company:')));
  assert.ok(!detail.keyFacts.some((line) => line.startsWith('companies:')));
  assert.ok(detail.evidenceHighlights.some((line) => line.includes('ERP data')));
});

test('buildReportOutputMemorySnapshots should expose reusable saved outputs for memory replay', () => {
  const snapshots = buildReportOutputMemorySnapshots([
    {
      id: 'report-1',
      groupKey: 'resume',
      groupLabel: '简历',
      templateKey: 'tpl-resume-page',
      templateLabel: '客户汇报页',
      title: '简历客户汇报页',
      outputType: '静态页',
      kind: 'page',
      format: 'html',
      createdAt: '2026-04-01T05:30:00.000Z',
      status: 'ready',
      summary: '整理了 4 位候选人的代表经历与匹配建议。',
      triggerSource: 'chat',
      content: '',
      page: {
        summary: '整理了 4 位候选人的代表经历与匹配建议。',
        cards: [],
        sections: [],
        charts: [],
      },
      libraries: [{ key: 'resume', label: '简历' }],
      dynamicSource: {
        enabled: true,
        request: '请输出静态页',
        outputType: 'page',
        libraries: [{ key: 'resume', label: '简历' }],
        updatedAt: '2026-04-01T05:35:00.000Z',
        lastRenderedAt: '2026-04-01T05:36:00.000Z',
      },
    },
  ]);

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].id, 'report-1');
  assert.equal(snapshots[0].kind, 'page');
  assert.equal(snapshots[0].templateLabel, '客户汇报页');
  assert.deepEqual(snapshots[0].libraryLabels, ['简历']);
  assert.equal(snapshots[0].triggerSource, 'chat');
  assert.equal(snapshots[0].reusable, true);
  assert.equal(snapshots[0].updatedAt, '2026-04-01T05:36:00.000Z');
});
