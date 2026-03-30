import test from 'node:test';
import assert from 'node:assert/strict';
import { collectLibraryMatches } from '../src/lib/knowledge-plan.js';

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
