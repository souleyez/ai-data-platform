import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseDocument } from '../src/lib/document-parser.js';

test('detailed parse should prefer MarkItDown markdown when available', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-markdown-'));
  const filePath = path.join(tempDir, 'sample.html');

  try {
    await fs.writeFile(filePath, '<html><body><h1>Legacy title</h1><p>Legacy body</p></body></html>', 'utf8');
    const doc = await parseDocument(filePath, undefined, {
      stage: 'detailed',
      resolveMarkdown: async () => ({
        status: 'succeeded',
        markdownText: '# Canonical title\n\n- Canonical body',
        method: 'markitdown',
      }),
    });

    assert.equal(doc.parseStatus, 'parsed');
    assert.equal(doc.parseMethod, 'markitdown');
    assert.equal(doc.markdownMethod, 'markitdown');
    assert.match(String(doc.fullText || ''), /Canonical title/);
    assert.match(String(doc.markdownText || ''), /Canonical body/);
    assert.equal(doc.detailParseStatus, 'succeeded');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('detailed parse should fall back to legacy extracted text when MarkItDown is unavailable for supported text formats', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-markdown-fallback-'));
  const filePath = path.join(tempDir, 'sample.html');

  try {
    await fs.writeFile(filePath, '<html><body><h1>Legacy title</h1><p>Legacy body</p></body></html>', 'utf8');
    const doc = await parseDocument(filePath, undefined, {
      stage: 'detailed',
      resolveMarkdown: async () => ({
        status: 'failed',
        error: 'markitdown-unavailable',
      }),
    });

    assert.equal(doc.parseStatus, 'parsed');
    assert.notEqual(doc.parseMethod, 'markitdown');
    assert.match(String(doc.fullText || ''), /Legacy title/);
    assert.equal(doc.markdownError, 'markitdown-unavailable');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('quick parse should leave audio files queued for detailed markdown parsing', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-audio-'));
  const filePath = path.join(tempDir, 'meeting.mp3');

  try {
    await fs.writeFile(filePath, Buffer.from('fake-audio'));
    const doc = await parseDocument(filePath, undefined, { stage: 'quick' });

    assert.equal(doc.parseStatus, 'unsupported');
    assert.equal(doc.detailParseStatus, 'queued');
    assert.equal(doc.ext, '.mp3');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('detailed parse should convert audio files through MarkItDown when available', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-audio-detailed-'));
  const filePath = path.join(tempDir, 'meeting.mp3');

  try {
    await fs.writeFile(filePath, Buffer.from('fake-audio'));
    const doc = await parseDocument(filePath, undefined, {
      stage: 'detailed',
      resolveMarkdown: async () => ({
        status: 'succeeded',
        markdownText: '# Transcript\n\nHello from audio',
        method: 'markitdown',
      }),
    });

    assert.equal(doc.parseStatus, 'parsed');
    assert.equal(doc.parseMethod, 'markitdown');
    assert.equal(doc.markdownMethod, 'markitdown');
    assert.match(String(doc.fullText || ''), /Hello from audio/);
    assert.equal(doc.detailParseStatus, 'succeeded');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('detailed parse should fail audio files explicitly when markdown conversion fails', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-audio-failed-'));
  const filePath = path.join(tempDir, 'meeting.mp3');

  try {
    await fs.writeFile(filePath, Buffer.from('fake-audio'));
    const doc = await parseDocument(filePath, undefined, {
      stage: 'detailed',
      resolveMarkdown: async () => ({
        status: 'failed',
        error: 'markitdown-unavailable',
      }),
    });

    assert.equal(doc.parseStatus, 'error');
    assert.equal(doc.detailParseStatus, 'failed');
    assert.equal(doc.markdownError, 'markitdown-unavailable');
    assert.match(String(doc.summary || ''), /音频详细解析失败/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
