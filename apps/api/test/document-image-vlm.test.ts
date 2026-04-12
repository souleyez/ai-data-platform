import test from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedDocument } from '../src/lib/document-parser.js';
import { getParsedDocumentCanonicalParseStatus, getParsedDocumentCanonicalSource } from '../src/lib/document-canonical-text.js';
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

function buildPresentationItem(overrides: Partial<ParsedDocument> = {}): ParsedDocument {
  return {
    path: '/tmp/bid-deck.pptx',
    name: 'bid-deck.pptx',
    ext: '.pptx',
    title: '投标汇报',
    category: 'technical',
    bizCategory: 'general',
    parseStatus: 'parsed',
    parseMethod: 'pptx-ooxml',
    summary: '投标汇报初步解析',
    excerpt: '投标汇报初步解析',
    fullText: '# Slide 1\n项目概览\n\n# Slide 2\n实施计划',
    extractedChars: 48,
    evidenceChunks: [],
    entities: [],
    claims: [],
    intentSlots: {},
    topicTags: ['投标', '汇报'],
    groups: ['广州AI'],
    parseStage: 'quick',
    detailParseStatus: 'queued',
    detailParseAttempts: 0,
    schemaType: 'technical',
    structuredProfile: {},
    ...overrides,
  };
}

function buildPdfItem(overrides: Partial<ParsedDocument> = {}): ParsedDocument {
  return {
    path: '/tmp/bid-spec.pdf',
    name: 'bid-spec.pdf',
    ext: '.pdf',
    title: '招标文件',
    category: 'contract',
    bizCategory: 'general',
    parseStatus: 'error',
    parseMethod: 'pdf-ocr-empty',
    summary: '招标文件详细解析失败',
    excerpt: '招标文件详细解析失败',
    fullText: 'PDF OCR did not extract usable text.',
    extractedChars: 0,
    evidenceChunks: [],
    entities: [],
    claims: [],
    intentSlots: {},
    topicTags: ['招标'],
    groups: ['bids'],
    parseStage: 'detailed',
    detailParseStatus: 'failed',
    detailParseAttempts: 1,
    detailParseError: 'markitdown-unavailable',
    markdownError: 'markitdown-unavailable',
    schemaType: 'contract',
    structuredProfile: {},
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

test('enhanceParsedDocumentsWithCloud should use image VLM for presentation documents by default', async () => {
  const [item] = await enhanceParsedDocumentsWithCloud(
    [buildPresentationItem()],
    {
      runTextParse: async () => {
        throw new Error('text parse should not be used when presentation rendering succeeds');
      },
      renderPresentation: async () => ({
        images: [
          { pageNumber: 1, imagePath: '/tmp/slide-1.png' },
          { pageNumber: 2, imagePath: '/tmp/slide-2.png' },
        ],
        cleanup: async () => undefined,
      }),
      runImageParse: async ({ imagePath }) => ({
        content: '{"summary":"投标汇报","layoutType":"slide","topicTags":["投标","建设规模"],"visualSummary":"演示页展示项目规模。","evidenceBlocks":[{"title":"规模","text":"建设 8 个乡镇，4499 个车位"}],"transcribedText":"建设 8 个乡镇 4499 个车位"}',
        model: 'minimax/MiniMax-VL-01',
        provider: 'openclaw-skill',
        capability: {
          enabled: true,
          available: true,
          providerMode: 'openclaw-skill',
          toolName: 'image',
          reason: 'ready',
        },
        parsed: String(imagePath || '').includes('slide-1')
          ? {
            summary: '投标汇报',
            layoutType: 'slide',
            topicTags: ['投标', '建设规模'],
            visualSummary: '演示页展示项目规模。',
            evidenceBlocks: [{ title: '规模', text: '建设 8 个乡镇，4499 个车位' }],
            transcribedText: '建设 8 个乡镇 4499 个车位',
          }
          : {
            summary: '投标汇报',
            layoutType: 'slide',
            topicTags: ['投标', '实施计划'],
            visualSummary: '演示页展示实施工期与里程碑。',
            evidenceBlocks: [{ title: '工期', text: '设计周期 45 日历天' }],
            transcribedText: '设计周期 45 日历天',
          },
      }),
    },
  );

  assert.equal(item.parseStatus, 'parsed');
  assert.equal(item.detailParseStatus, 'succeeded');
  assert.match(String(item.parseMethod || ''), /presentation-vlm/);
  assert.equal(item.cloudStructuredModel, 'minimax/MiniMax-VL-01');
  assert.match(String(item.fullText || ''), /\[Presentation VLM understanding\]/);
  assert.match(String(item.fullText || ''), /4499 个车位/);
  assert.equal(
    Number(((item.structuredProfile as Record<string, unknown>)?.presentationUnderstanding as Record<string, unknown>)?.slideCount || 0),
    2,
  );
});

test('enhanceParsedDocumentsWithCloud should use image VLM fallback for pdf documents', async () => {
  const [item] = await enhanceParsedDocumentsWithCloud(
    [buildPdfItem()],
    {
      runTextParse: async () => {
        throw new Error('text parse should not be used when pdf rendering succeeds');
      },
      renderPdf: async () => ({
        images: [
          { pageNumber: 1, imagePath: '/tmp/pdf-page-1.png' },
          { pageNumber: 2, imagePath: '/tmp/pdf-page-2.png' },
        ],
        cleanup: async () => undefined,
      }),
      runImageParse: async ({ imagePath }) => ({
        content: '{"summary":"招标文件重点","layoutType":"document-page","topicTags":["招标","评分"],"visualSummary":"页面展示评分办法与资格要求。","evidenceBlocks":[{"title":"控制价","text":"招标控制价 437.69 万元"}],"transcribedText":"招标控制价 437.69 万元 评分权重 技术 40 商务 40 报价 20"}',
        model: 'minimax/MiniMax-VL-01',
        provider: 'openclaw-skill',
        capability: {
          enabled: true,
          available: true,
          providerMode: 'openclaw-skill',
          toolName: 'image',
          reason: 'ready',
        },
        parsed: String(imagePath || '').includes('page-1')
          ? {
            summary: '招标文件重点',
            layoutType: 'document-page',
            topicTags: ['招标', '控制价'],
            visualSummary: '页面展示项目控制价与规模。',
            evidenceBlocks: [{ title: '控制价', text: '招标控制价 437.69 万元' }],
            transcribedText: '招标控制价 437.69 万元',
          }
          : {
            summary: '招标文件重点',
            layoutType: 'document-page',
            topicTags: ['招标', '评分'],
            visualSummary: '页面展示评分权重与资格要求。',
            evidenceBlocks: [{ title: '评分', text: '评分权重 技术 40 商务 40 报价 20' }],
            transcribedText: '评分权重 技术 40 商务 40 报价 20',
          },
      }),
    },
  );

  assert.equal(item.parseStatus, 'parsed');
  assert.equal(item.detailParseStatus, 'succeeded');
  assert.match(String(item.parseMethod || ''), /pdf-vlm/);
  assert.equal(getParsedDocumentCanonicalSource(item), 'vlm-pdf');
  assert.equal(getParsedDocumentCanonicalParseStatus(item), 'ready');
  assert.equal(item.cloudStructuredModel, 'minimax/MiniMax-VL-01');
  assert.match(String(item.fullText || ''), /\[PDF VLM understanding\]/);
  assert.match(String(item.fullText || ''), /437\.69 万元/);
  assert.equal(
    Number(((item.structuredProfile as Record<string, unknown>)?.pdfUnderstanding as Record<string, unknown>)?.pageCount || 0),
    2,
  );
});
