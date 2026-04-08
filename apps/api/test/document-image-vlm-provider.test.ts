import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildDocumentImageVlmPrompt,
  buildDocumentImageVlmSystemPrompt,
  normalizeDocumentImageFieldCandidateKey,
  runDocumentImageVlm,
} from '../src/lib/document-image-vlm-provider.js';

const PNG_PIXEL_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+X1sAAAAASUVORK5CYII=';

function buildImageItem(filePath: string) {
  return {
    path: filePath,
    name: path.basename(filePath),
    ext: '.png',
    title: '高明中港城制度截图',
    category: 'technical',
    bizCategory: 'general' as const,
    parseStatus: 'parsed' as const,
    parseMethod: 'image-ocr',
    summary: '当前图片已提取 OCR 文本。',
    excerpt: '当前图片已提取 OCR 文本。',
    fullText: 'Image file: screenshot.png\n\nOCR text:\n高明中港城 营运制度 调整流程',
    extractedChars: 48,
    evidenceChunks: [],
    entities: [],
    claims: [],
    intentSlots: {},
    topicTags: ['企业规范'],
    groups: ['广州AI'],
    detailParseStatus: 'queued' as const,
    structuredProfile: {
      fieldTemplate: {
        preferredFieldKeys: ['documentKind', 'operationEntry'],
        requiredFieldKeys: ['documentKind'],
        fieldAliases: { documentKind: '文档类型', operationEntry: '操作入口' },
        fieldPrompts: { documentKind: '识别制度、流程、FAQ、操作指引等类型', operationEntry: '识别入口页面或操作入口' },
      },
    },
  };
}

test('buildDocumentImageVlmSystemPrompt should require strict JSON and image understanding', () => {
  const prompt = buildDocumentImageVlmSystemPrompt();
  assert.match(prompt, /strict JSON/i);
  assert.match(prompt, /image understanding/i);
  assert.match(prompt, /fieldCandidates/);
});

test('buildDocumentImageVlmPrompt should include local file path and governed field hints', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-image-vlm-provider-'));
  const filePath = path.join(tempDir, 'screenshot.png');
  await fs.writeFile(filePath, Buffer.from(PNG_PIXEL_BASE64, 'base64'));

  try {
    const prompt = buildDocumentImageVlmPrompt(buildImageItem(filePath), filePath);
    assert.match(prompt, new RegExp(filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(prompt, /documentKind/);
    assert.match(prompt, /operationEntry/);
    assert.match(prompt, /文档类型/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('normalizeDocumentImageFieldCandidateKey should normalize aliases and canonical keys', () => {
  assert.equal(normalizeDocumentImageFieldCandidateKey('document_kind'), 'documentKind');
  assert.equal(normalizeDocumentImageFieldCandidateKey('文档类型', { documentKind: '文档类型' }), 'documentKind');
  assert.equal(normalizeDocumentImageFieldCandidateKey('unknown_key'), '');
});

test('runDocumentImageVlm should return null when gateway is not configured', async () => {
  const previousUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  delete process.env.OPENCLAW_GATEWAY_URL;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-image-vlm-provider-'));
  const filePath = path.join(tempDir, 'screenshot.png');
  await fs.writeFile(filePath, Buffer.from(PNG_PIXEL_BASE64, 'base64'));

  try {
    const result = await runDocumentImageVlm({
      item: buildImageItem(filePath),
      imagePath: filePath,
    });
    assert.equal(result, null);
  } finally {
    if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = previousUrl;
    if (previousToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = previousToken;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
