import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseDocument } from '../src/lib/document-parser.js';

test('parseDocument should include page and section metadata in evidence chunks', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-evidence-'));
  const filePath = path.join(tempDir, 'contract-sample.md');
  const content = [
    '# Payment Terms',
    '',
    'Contract HT-2026-018 between Guangzhou Light Industry Construction Installation Engineering Company and Guangzhou Lianming Construction Co., Ltd. Payment is due within 7 days after signing and the total amount is RMB 120000.',
    '',
    '\f',
    '',
    '## Scope of Work',
    '',
    'This page describes delivery scope, implementation milestones, acceptance requirements, and supporting obligations for the project team during the full service period.',
  ].join('\n');

  try {
    await fs.writeFile(filePath, content, 'utf8');
    const doc = await parseDocument(filePath, undefined, { stage: 'detailed' });

    assert.equal(doc.parseStatus, 'parsed');
    assert.ok(doc.evidenceChunks && doc.evidenceChunks.length >= 2);

    const firstChunk = doc.evidenceChunks?.[0];
    const secondPageChunk = doc.evidenceChunks?.find((chunk) => chunk.page === 2);

    assert.equal(firstChunk?.page, 1);
    assert.equal(firstChunk?.sectionTitle, 'Payment Terms');
    assert.equal(firstChunk?.title, 'Payment Terms');
    assert.match(String(firstChunk?.regionHint), /^page-1:/);

    assert.ok(secondPageChunk);
    assert.equal(secondPageChunk?.sectionTitle, 'Scope of Work');
    assert.match(String(secondPageChunk?.regionHint), /^page-2:/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
