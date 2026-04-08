import test from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedDocument } from '../src/lib/document-parser.js';
import { enhanceParsedDocumentsWithCloud } from '../src/lib/document-cloud-enrichment.js';

function buildImageItem(overrides: Partial<ParsedDocument> = {}): ParsedDocument {
  return {
    path: '/tmp/highming-footfall.png',
    name: 'highming-footfall.png',
    ext: '.png',
    title: '高明中港城客流截图',
    category: 'report',
    bizCategory: 'general',
    parseStatus: 'parsed',
    parseMethod: 'image-ocr',
    summary: '当前图片已完成 OCR。',
    excerpt: '当前图片已完成 OCR。',
    fullText: 'Image file: highming-footfall.png\n\nOCR text:\n高明中港城 A区 B区 营运流程',
    extractedChars: 64,
    evidenceChunks: [],
    entities: [],
    claims: [],
    intentSlots: {},
    topicTags: ['企业规范'],
    groups: ['广州AI'],
    parseStage: 'quick',
    detailParseStatus: 'queued',
    detailParseAttempts: 0,
    schemaType: 'generic',
    structuredProfile: {
      fieldTemplate: {
        preferredFieldKeys: ['documentKind', 'operationEntry'],
        requiredFieldKeys: ['documentKind'],
        fieldAliases: { documentKind: '文档类型', operationEntry: '操作入口' },
      },
    },
    ...overrides,
  };
}

test('enhanceParsedDocumentsWithCloud should enrich parsed image documents with VLM output', async () => {
  const [item] = await enhanceParsedDocumentsWithCloud(
    [buildImageItem()],
    {
      runImageParse: async () => ({
        content: '{"summary":"高明中港城营运制度截图","documentKind":"policy-standard","layoutType":"poster","topicTags":["企业规范","营运制度"],"visualSummary":"图片展示高明中港城营运制度与调整入口。","evidenceBlocks":[{"title":"主标题","text":"高明中港城营运制度"},{"title":"入口","text":"操作入口：营运后台 > 制度管理"}],"fieldCandidates":[{"key":"documentKind","value":"policy-standard","confidence":0.92,"evidenceText":"高明中港城营运制度"},{"key":"operationEntry","value":"营运后台 > 制度管理","confidence":0.89,"evidenceText":"操作入口：营运后台 > 制度管理"}],"transcribedText":"高明中港城营运制度 操作入口 营运后台 制度管理"}',
        model: 'minimax/MiniMax-M2.5-highspeed',
        provider: 'openclaw-skill',
        capability: {
          enabled: true,
          available: true,
          providerMode: 'openclaw-skill',
          toolName: 'image',
          reason: 'ready',
        },
        parsed: {
          summary: '高明中港城营运制度截图',
          documentKind: 'policy-standard',
          layoutType: 'poster',
          topicTags: ['企业规范', '营运制度'],
          visualSummary: '图片展示高明中港城营运制度与调整入口。',
          evidenceBlocks: [
            { title: '主标题', text: '高明中港城营运制度' },
            { title: '入口', text: '操作入口：营运后台 > 制度管理' },
          ],
          fieldCandidates: [
            { key: 'documentKind', value: 'policy-standard', confidence: 0.92, evidenceText: '高明中港城营运制度' },
            { key: 'operationEntry', value: '营运后台 > 制度管理', confidence: 0.89, evidenceText: '操作入口：营运后台 > 制度管理' },
          ],
          transcribedText: '高明中港城营运制度 操作入口 营运后台 制度管理',
        },
      }),
    },
  );

  assert.equal(item.parseStatus, 'parsed');
  assert.equal(item.parseMethod, 'image-ocr+vlm');
  assert.equal(item.detailParseStatus, 'succeeded');
  assert.equal(item.cloudStructuredModel, 'minimax/MiniMax-M2.5-highspeed');
  assert.match(String(item.summary || ''), /高明中港城/);
  assert.equal(String((item.structuredProfile as Record<string, unknown>)?.documentKind || ''), 'policy-standard');
  assert.equal(
    String(((item.structuredProfile as Record<string, unknown>)?.imageUnderstanding as Record<string, unknown>)?.layoutType || ''),
    'poster',
  );
  assert.equal(
    String((((item.structuredProfile as Record<string, unknown>)?.fieldDetails as Record<string, unknown>)?.documentKind as Record<string, unknown>)?.source || ''),
    'vlm',
  );
});

test('enhanceParsedDocumentsWithCloud should promote OCR-failed image documents when VLM succeeds', async () => {
  const [item] = await enhanceParsedDocumentsWithCloud(
    [buildImageItem({
      parseStatus: 'error',
      parseMethod: 'image-ocr-empty',
      summary: '图片 OCR 解析失败',
      excerpt: '图片 OCR 解析失败',
      fullText: 'Image file: highming-footfall.png\n\nOCR text was not extracted from this image.',
      extractedChars: 0,
      detailParseStatus: 'failed',
      detailParseError: 'ocr-text-not-extracted',
    })],
    {
      runImageParse: async () => ({
        content: '{"summary":"高明中港城客流截图","layoutType":"dashboard","topicTags":["客流分析"],"visualSummary":"图片展示商场分区客流驾驶舱。","evidenceBlocks":[{"title":"分区","text":"A区 2180 人次"}],"transcribedText":"A区 2180 人次 B区 1650 人次 C区 1000 人次"}',
        model: 'minimax/MiniMax-M2.5-highspeed',
        provider: 'openclaw-skill',
        capability: {
          enabled: true,
          available: true,
          providerMode: 'openclaw-skill',
          toolName: 'image',
          reason: 'ready',
        },
        parsed: {
          summary: '高明中港城客流截图',
          layoutType: 'dashboard',
          topicTags: ['客流分析'],
          visualSummary: '图片展示商场分区客流驾驶舱。',
          evidenceBlocks: [{ title: '分区', text: 'A区 2180 人次' }],
          transcribedText: 'A区 2180 人次 B区 1650 人次 C区 1000 人次',
        },
      }),
    },
  );

  assert.equal(item.parseStatus, 'parsed');
  assert.equal(item.parseMethod, 'image-ocr+vlm');
  assert.equal(item.detailParseStatus, 'succeeded');
  assert.match(String(item.fullText || ''), /A区 2180 人次/);
  assert.ok((item.extractedChars || 0) > 0);
});
