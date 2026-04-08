import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildDocumentImageVlmChatRequest,
  buildDocumentImageVlmPrompt,
  buildDocumentImageVlmSystemPrompt,
  normalizeDocumentImageFieldCandidateKey,
  resolveDocumentImageVlmModelOverride,
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
    const promptPath = process.platform === 'win32'
      ? `/mnt/${filePath.slice(0, 1).toLowerCase()}/${filePath.slice(3).replace(/\\/g, '/')}`
      : filePath;
    assert.match(prompt, new RegExp(promptPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
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

test('resolveDocumentImageVlmModelOverride should scope runtime image models to minimax', () => {
  assert.equal(resolveDocumentImageVlmModelOverride({ imageModelId: 'MiniMax-VL-01' }), 'minimax/MiniMax-VL-01');
  assert.equal(resolveDocumentImageVlmModelOverride({ imageModelId: 'minimax/MiniMax-VL-01' }), 'minimax/MiniMax-VL-01');
  assert.equal(resolveDocumentImageVlmModelOverride({ imageModelId: '' }), '');
});

test('buildDocumentImageVlmChatRequest should pin image parsing to the explicit MiniMax image model', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-image-vlm-provider-'));
  const filePath = path.join(tempDir, 'screenshot.png');
  await fs.writeFile(filePath, Buffer.from(PNG_PIXEL_BASE64, 'base64'));

  try {
    const request = buildDocumentImageVlmChatRequest({
      item: buildImageItem(filePath),
      imagePath: filePath,
      imageUrl: 'http://127.0.0.1:9999/document-image-vlm/test.png',
      capability: { imageModelId: 'MiniMax-VL-01' },
    });
    assert.equal(request.modelOverride, 'minimax/MiniMax-VL-01');
    assert.equal(request.sessionUser, 'document-image-vlm');
    assert.match(String(request.prompt || ''), /http:\/\/127\.0\.0\.1:9999\/document-image-vlm\/test\.png/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runDocumentImageVlm should return null when image VLM is explicitly disabled', async () => {
  const previousMode = process.env.DOCUMENT_IMAGE_PARSE_MODE;
  process.env.DOCUMENT_IMAGE_PARSE_MODE = 'ocr-only';

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
    if (previousMode === undefined) delete process.env.DOCUMENT_IMAGE_PARSE_MODE;
    else process.env.DOCUMENT_IMAGE_PARSE_MODE = previousMode;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
