import test from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedDocument } from '../src/lib/document-parser.js';
import { normalizeReportOutput } from '../src/lib/knowledge-output.js';

function buildOrderDocument(): ParsedDocument {
  return {
    path: 'order-generic.csv',
    name: 'order-generic.csv',
    ext: '.csv',
    title: 'Q1 order generic',
    category: 'general',
    bizCategory: 'order',
    parseStatus: 'parsed',
    parseMethod: 'csv-utf8',
    summary: 'order cockpit summary',
    excerpt: 'platform,category,inventory_index,replenishment_priority',
    fullText: [
      'platform,category,inventory_index,replenishment_priority',
      'Douyin,wearables,128,P0',
      'Tmall,audio,86,P1',
    ].join('\n'),
    extractedChars: 220,
    schemaType: 'report',
    topicTags: ['order', 'channel', 'sku'],
    structuredProfile: {
      platformSignals: ['tmall', 'douyin'],
      categorySignals: ['wearables', 'audio'],
      metricSignals: ['inventory-index'],
      replenishmentSignals: ['replenishment'],
    },
  };
}

function buildEnvelope() {
  return {
    title: '\u8ba2\u5355\u591a\u6e20\u9053\u7ecf\u8425\u9a7e\u9a76\u8231',
    fixedStructure: [],
    variableZones: [],
    outputHint: '\u8f93\u51fa\u591a\u6e20\u9053\u3001\u591aSKU\u7ecf\u8425\u9a7e\u9a76\u8231',
    pageSections: [
      '\u7ecf\u8425\u603b\u89c8',
      '\u6e20\u9053\u7ed3\u6784',
      '\u54c1\u7c7b\u7126\u70b9',
      '\u5e93\u5b58\u4e0e\u8865\u8d27',
      '\u5f02\u5e38\u6ce2\u52a8\u89e3\u91ca',
      '\u884c\u52a8\u5efa\u8bae',
      'AI\u7efc\u5408\u5206\u6790',
    ],
  };
}

test('normalizeReportOutput should canonicalize generic cockpit cards and charts', () => {
  const output = normalizeReportOutput(
    'page',
    '\u57fa\u4e8e\u8ba2\u5355\u5206\u6790\u77e5\u8bc6\u5e93\u751f\u6210\u4e00\u9875\u591a\u6e20\u9053\u591aSKU\u7ecf\u8425\u9a7e\u9a76\u8231\u9759\u6001\u9875',
    JSON.stringify({
      page: {
        summary: 'generic cockpit',
        cards: [
          { label: '\u6e20\u9053GMV', value: '2', note: 'Douyin / Tmall' },
          { label: '\u52a8\u9500SKU', value: '2', note: 'wearables / audio' },
          { label: '\u9ad8\u98ce\u9669SKU', value: '1', note: 'P0' },
          { label: '\u5e93\u5b58\u5065\u5eb7', value: '1', note: 'inventory-index' },
        ],
        charts: [
          { title: '\u6e20\u9053\u8d21\u732e\u7ed3\u6784', items: [{ label: 'Douyin', value: 2 }] },
          { title: 'SKU\u4e0e\u54c1\u7c7b\u7126\u70b9', items: [{ label: 'wearables', value: 2 }] },
          { title: '\u5e93\u5b58\u4e0e\u8d8b\u52bf\u4fe1\u53f7', items: [{ label: 'inventory-index', value: 1 }] },
        ],
      },
    }),
    buildEnvelope(),
    [buildOrderDocument()],
  );

  assert.equal(output.type, 'page');
  assert.deepEqual(
    (output.page?.cards || []).map((item) => item.label),
    [
      '\u6e20\u9053GMV',
      '\u52a8\u9500SKU',
      '\u9ad8\u98ce\u9669SKU',
      '\u8865\u8d27\u4f18\u5148\u7ea7',
      '\u5e93\u5b58\u5065\u5eb7\u6307\u6570',
    ],
  );
  assert.deepEqual(
    (output.page?.charts || []).map((item) => item.title),
    [
      '\u6e20\u9053\u8d21\u732e\u7ed3\u6784',
      '\u54c1\u7c7b\u68af\u961f\u4e0e\u82f1\u96c4SKU',
      '\u5e93\u5b58\u5065\u5eb7\u4e0e\u8865\u8d27\u4f18\u5148\u7ea7',
    ],
  );
});

test('normalizeReportOutput should replace json-like generic section bodies with fallback blueprint text', () => {
  const output = normalizeReportOutput(
    'page',
    '\u57fa\u4e8e\u8ba2\u5355\u5206\u6790\u77e5\u8bc6\u5e93\u751f\u6210\u4e00\u9875\u591a\u6e20\u9053\u591aSKU\u7ecf\u8425\u9a7e\u9a76\u8231\u9759\u6001\u9875',
    JSON.stringify({
      page: {
        summary: '\u7efc\u5408\u7ecf\u8425\u9875',
        sections: [
          {
            title: '\u7ecf\u8425\u603b\u89c8',
            body: JSON.stringify({ title: 'echo', page: { cards: [] } }),
            bullets: [],
          },
        ],
      },
    }),
    buildEnvelope(),
    [buildOrderDocument()],
  );

  assert.equal(output.type, 'page');
  assert.doesNotMatch(output.page?.sections?.[0]?.body || '', /^\s*\{/);
  assert.ok((output.page?.charts || []).length >= 3);
});
