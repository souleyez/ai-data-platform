import test from 'node:test';
import assert from 'node:assert/strict';
import { collectLibraryMatches, detectOutputKind } from '../src/lib/knowledge-plan.js';

test('collectLibraryMatches should prefer resume library for latest resume comparison prompts', () => {
  const matches = collectLibraryMatches(
    '\u770b\u770b\u7b80\u5386\u77e5\u8bc6\u5e93\u5185\u7684\u7b80\u5386\uff0c\u6700\u65b0\u7684\u51e0\u4efd\u5bf9\u6bd4\u4e0b',
    [
      {
        key: 'iot-solution',
        label: 'IOT\u89e3\u51b3\u65b9\u6848',
        createdAt: '2026-03-30T00:00:00.000Z',
      },
      {
        key: 'resume',
        label: '\u7b80\u5386',
        description: '\u4eba\u624d\u7b80\u5386\u77e5\u8bc6\u5e93',
        createdAt: '2026-03-30T00:00:00.000Z',
      },
    ],
  );

  assert.equal(matches[0]?.library.key, 'resume');
});

test('detectOutputKind should recognize doc and markdown outputs', () => {
  assert.equal(detectOutputKind('按合同库输出正式文档'), 'doc');
  assert.equal(detectOutputKind('按合同库输出 docs 文件'), 'doc');
  assert.equal(detectOutputKind('按合同库输出 markdown 文档'), 'md');
  assert.equal(detectOutputKind('按合同库输出 md'), 'md');
});
