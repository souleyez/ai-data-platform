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
    assert.equal(doc.canonicalParseStatus, 'ready');
    assert.match(String(doc.fullText || ''), /Canonical title/);
    assert.match(String(doc.markdownText || ''), /Canonical body/);
    assert.equal(doc.detailParseStatus, 'succeeded');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('detailed parse should treat legacy extracted text as canonical for supported plain-text formats when MarkItDown is unavailable', async () => {
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
    assert.equal(doc.canonicalParseStatus, 'ready');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('detailed parse should treat txt legacy extraction as canonical-ready when MarkItDown is unavailable', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-txt-canonical-'));
  const filePath = path.join(tempDir, 'notes.txt');

  try {
    await fs.writeFile(filePath, 'plain text note body', 'utf8');
    const doc = await parseDocument(filePath, undefined, {
      stage: 'detailed',
    });

    assert.equal(doc.parseStatus, 'parsed');
    assert.equal(doc.parseMethod, 'text-utf8');
    assert.equal(doc.markdownError, undefined);
    assert.equal(doc.canonicalParseStatus, 'ready');
    assert.match(String(doc.fullText || ''), /plain text note body/);
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
    assert.equal(doc.canonicalParseStatus, 'ready');
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
    assert.equal(doc.canonicalParseStatus, 'failed');
    assert.match(String(doc.summary || ''), /尚未接入音频 VLM 兜底/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('detailed parse should skip legacy extraction when MarkItDown already succeeds for supported formats', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-markdown-first-'));
  const filePath = path.join(tempDir, 'broken.json');

  try {
    await fs.writeFile(filePath, '{not-valid-json', 'utf8');
    const doc = await parseDocument(filePath, undefined, {
      stage: 'detailed',
      resolveMarkdown: async () => ({
        status: 'succeeded',
        markdownText: '# Canonical JSON\n\n- Recovered through markdown pipeline',
        method: 'markitdown',
      }),
    });

    assert.equal(doc.parseStatus, 'parsed');
    assert.equal(doc.parseMethod, 'markitdown');
    assert.equal(doc.canonicalParseStatus, 'ready');
    assert.match(String(doc.fullText || ''), /Recovered through markdown pipeline/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
