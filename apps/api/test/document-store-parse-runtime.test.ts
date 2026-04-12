import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getParsedDocumentCanonicalParseStatus, getParsedDocumentCanonicalSource } from '../src/lib/document-canonical-text.js';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-parse-runtime-test-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const parseRuntime = await importFresh<typeof import('../src/lib/document-store-parse-runtime.js')>(
  '../src/lib/document-store-parse-runtime.js',
);

test.after(async () => {
  delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('parseDetailedDocument should prefer markdown-first parsing and still allow pdf visual fallback orchestration', async () => {
  const scanRoot = path.join(storageRoot, 'files');
  const configFile = path.join(storageRoot, 'config', 'document-categories.json');
  const pdfPath = path.join(scanRoot, 'bid-spec.pdf');

  await fs.mkdir(path.dirname(configFile), { recursive: true });
  await fs.mkdir(scanRoot, { recursive: true });
  await fs.writeFile(configFile, JSON.stringify({
    scanRoot,
    scanRoots: [scanRoot],
    categories: [],
    customCategories: [],
    upload: {
      enabled: true,
      maxBytes: 10 * 1024 * 1024,
      allowedExtensions: ['.pdf'],
    },
  }, null, 2), 'utf8');
  await fs.writeFile(pdfPath, Buffer.from('fake-pdf'));

  const item = await parseRuntime.parseDetailedDocument(pdfPath, [scanRoot], {
    cloudEnhancement: true,
    cloudOptions: {
      runTextParse: async () => {
        throw new Error('text parse should not be used when pdf rendering succeeds');
      },
      renderPdf: async () => ({
        images: [{ pageNumber: 1, imagePath: '/tmp/pdf-page-1.png' }],
        cleanup: async () => undefined,
      }),
      runImageParse: async () => ({
        content: '{"summary":"招标文件重点","layoutType":"document-page","topicTags":["招标"],"visualSummary":"页面展示控制价。","evidenceBlocks":[{"title":"控制价","text":"招标控制价 437.69 万元"}],"transcribedText":"招标控制价 437.69 万元"}',
        model: 'minimax/MiniMax-VL-01',
        provider: 'openclaw-skill',
        capability: {
          enabled: true,
          available: true,
          providerMode: 'openclaw-skill',
          toolName: 'image',
          reason: 'ready',
        },
        parsed: {
          summary: '招标文件重点',
          layoutType: 'document-page',
          topicTags: ['招标'],
          visualSummary: '页面展示控制价。',
          evidenceBlocks: [{ title: '控制价', text: '招标控制价 437.69 万元' }],
          transcribedText: '招标控制价 437.69 万元',
        },
      }),
    },
  });

  assert.ok(item);
  assert.equal(item?.parseStatus, 'parsed');
  assert.equal(item?.detailParseStatus, 'succeeded');
  assert.ok(['markitdown', 'vlm-pdf'].includes(getParsedDocumentCanonicalSource(item)));
  assert.equal(getParsedDocumentCanonicalParseStatus(item), 'ready');
  if (getParsedDocumentCanonicalSource(item) === 'vlm-pdf') {
    assert.match(String(item?.parseMethod || ''), /pdf-vlm/);
  }
});

test('canonical parse status should treat legacy plain-text parse methods as ready for historical cache rows', () => {
  assert.equal(getParsedDocumentCanonicalParseStatus({
    parseStatus: 'parsed',
    parseMethod: 'text-utf8',
    canonicalParseStatus: 'fallback_full_text',
    fullText: 'plain text body',
  }), 'ready');

  assert.equal(getParsedDocumentCanonicalParseStatus({
    parseStatus: 'parsed',
    parseMethod: 'html-utf8',
    canonicalParseStatus: 'fallback_full_text',
    fullText: 'legacy html body',
  }), 'ready');
});
