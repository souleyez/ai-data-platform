import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseDocument } from '../src/lib/document-parser.js';

const PNG_PIXEL_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+X1sAAAAASUVORK5CYII=';

test('parseDocument should mark images without OCR text as parse failures', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-image-'));
  const imagePath = path.join(tempDir, 'uploaded-note.png');

  try {
    await fs.writeFile(imagePath, Buffer.from(PNG_PIXEL_BASE64, 'base64'));
    const doc = await parseDocument(imagePath);

    assert.equal(doc.parseStatus, 'error');
    assert.equal(doc.detailParseStatus, 'failed');
    assert.equal(doc.detailParseError, 'ocr-text-not-extracted');
    assert.equal(doc.parseMethod, 'image-ocr-empty');
    assert.match(doc.summary, /OCR/);
    assert.equal(doc.ext, '.png');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
