import test from 'node:test';
import assert from 'node:assert/strict';
import { filterDocumentsForBot, filterLibrariesForBot, isMemoryDocumentVisibleToBot } from '../src/lib/bot-visibility.js';
import type { BotDefinition } from '../src/lib/bot-definitions.js';
import type { DocumentLibrary } from '../src/lib/document-libraries.js';

const BOT: BotDefinition = {
  id: 'wecom-assistant',
  name: '企业微信助理',
  slug: 'wecom-assistant',
  description: '',
  enabled: true,
  isDefault: true,
  systemPrompt: '',
  visibleLibraryKeys: ['contract'],
  includeUngrouped: false,
  includeFailedParseDocuments: false,
  channelBindings: [{ channel: 'web', enabled: true }, { channel: 'wecom', enabled: true }],
  updatedAt: '2026-04-03T18:00:00.000Z',
};

const LIBRARIES: DocumentLibrary[] = [
  { key: 'ungrouped', label: '未分组', createdAt: '2026-04-03T18:00:00.000Z', isDefault: true },
  { key: 'contract', label: '合同协议', createdAt: '2026-04-03T18:00:00.000Z' },
  { key: 'resume', label: '人才简历', createdAt: '2026-04-03T18:00:00.000Z' },
];

test('filterLibrariesForBot should only keep authorized libraries', () => {
  const result = filterLibrariesForBot(BOT, LIBRARIES);
  assert.deepEqual(result.map((item) => item.key), ['contract']);
});

test('filterDocumentsForBot should drop documents outside visible libraries and failed parse docs by default', () => {
  const result = filterDocumentsForBot(BOT, [
    {
      path: 'C:\\tmp\\contract-a.txt',
      name: 'contract-a.txt',
      ext: '.txt',
      title: 'contract-a',
      category: 'contract',
      bizCategory: 'contract',
      parseStatus: 'parsed',
      groups: ['contract'],
      confirmedGroups: ['contract'],
      summary: '',
      excerpt: '',
      extractedChars: 0,
    } as any,
    {
      path: 'C:\\tmp\\resume-a.txt',
      name: 'resume-a.txt',
      ext: '.txt',
      title: 'resume-a',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      groups: ['resume'],
      confirmedGroups: ['resume'],
      summary: '',
      excerpt: '',
      extractedChars: 0,
    } as any,
    {
      path: 'C:\\tmp\\contract-failed.png',
      name: 'contract-failed.png',
      ext: '.png',
      title: 'contract-failed',
      category: 'contract',
      bizCategory: 'contract',
      parseStatus: 'error',
      detailParseStatus: 'failed',
      groups: ['contract'],
      confirmedGroups: ['contract'],
      summary: '',
      excerpt: '',
      extractedChars: 0,
    } as any,
  ], LIBRARIES);

  assert.deepEqual(result.map((item) => item.title), ['contract-a']);
});

test('isMemoryDocumentVisibleToBot should use bot library scope and failed parse policy', () => {
  assert.equal(isMemoryDocumentVisibleToBot(BOT, {
    id: 'doc-1',
    libraryKeys: ['contract'],
    title: 'contract-a',
    summary: '',
    availability: 'available',
    updatedAt: '2026-04-03T18:00:00.000Z',
    parseStatus: 'parsed',
    parseStage: 'detailed',
    detailParseStatus: 'succeeded',
    fingerprint: 'fp-1',
  }), true);

  assert.equal(isMemoryDocumentVisibleToBot(BOT, {
    id: 'doc-2',
    libraryKeys: ['resume'],
    title: 'resume-a',
    summary: '',
    availability: 'available',
    updatedAt: '2026-04-03T18:00:00.000Z',
    parseStatus: 'parsed',
    parseStage: 'detailed',
    detailParseStatus: 'succeeded',
    fingerprint: 'fp-2',
  }), false);

  assert.equal(isMemoryDocumentVisibleToBot(BOT, {
    id: 'doc-3',
    libraryKeys: ['contract'],
    title: 'contract-failed',
    summary: '',
    availability: 'parse-error',
    updatedAt: '2026-04-03T18:00:00.000Z',
    parseStatus: 'error',
    parseStage: 'detailed',
    detailParseStatus: 'failed',
    fingerprint: 'fp-3',
  }), false);
});
