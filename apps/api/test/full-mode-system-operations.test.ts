import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFullModeSystemOperation } from '../src/lib/full-mode-system-operations.js';

test('detectFullModeSystemOperation should route png reparse requests into image reparse operation', () => {
  const intent = detectFullModeSystemOperation('把文档库里几个png图片重新扫描一下');
  assert.ok(intent);
  assert.equal(intent?.kind, 'documents_reparse_images');
  assert.deepEqual(intent?.targetExtensions, ['.png']);
  assert.equal(intent?.limit, 6);
  assert.equal(intent?.failedOnly, false);
});

test('detectFullModeSystemOperation should mark failed image retries as failedOnly', () => {
  const intent = detectFullModeSystemOperation('把所有解析失败的图片重新解析一遍');
  assert.ok(intent);
  assert.equal(intent?.kind, 'documents_reparse_images');
  assert.equal(intent?.failedOnly, true);
  assert.equal(intent?.limit, null);
});

test('detectFullModeSystemOperation should ignore ordinary knowledge questions', () => {
  const intent = detectFullModeSystemOperation('合同库里最近有哪些新文档');
  assert.equal(intent, null);
});
