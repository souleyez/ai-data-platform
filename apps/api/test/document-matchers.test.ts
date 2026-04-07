import test from 'node:test';
import assert from 'node:assert/strict';
import { matchDocumentsByPrompt } from '../src/lib/document-matchers.js';
import type { ParsedDocument } from '../src/lib/document-parser.js';

function makeDocument(overrides: Partial<ParsedDocument>): ParsedDocument {
  return {
    path: 'C:/tmp/1700000000000-default.md',
    name: 'default.md',
    ext: '.md',
    title: '榛樿鏂囨。',
    category: 'contract',
    bizCategory: 'contract',
    parseStatus: 'parsed',
    summary: '榛樿鎽樿',
    excerpt: '榛樿鎽樿',
    extractedChars: 240,
    topicTags: [],
    groups: [],
    confirmedGroups: [],
    suggestedGroups: [],
    ...overrides,
  };
}

test('matchDocumentsByPrompt should match structured alias names and values', () => {
  const aliasDocument = makeDocument({
    path: 'C:/tmp/1700000000100-contract-a.md',
    name: 'contract-a.md',
    title: '鍟嗗姟鏈嶅姟鍚堝悓',
    summary: '杩欐槸涓€浠藉晢鍔℃湇鍔″悎鍚屻€?',
    structuredProfile: {
      partyA: '骞垮窞杞诲伐闆嗗洟',
      fieldTemplate: {
        fieldSet: 'contract',
        fieldAliases: {
          partyA: '鐢叉柟',
        },
      },
      aliasFields: {
        鐢叉柟: '骞垮窞杞诲伐闆嗗洟',
      },
      focusedAliasFields: {
        鐢叉柟: '骞垮窞杞诲伐闆嗗洟',
      },
    },
  });
  const distractor = makeDocument({
    path: 'C:/tmp/1700000000200-contract-b.md',
    name: 'contract-b.md',
    title: '鍚堝悓 B',
    summary: '杩欐槸鍙︿竴浠藉悎鍚屻€?',
    structuredProfile: {
      partyA: '鍏朵粬鍏徃',
    },
  });

  const result = matchDocumentsByPrompt([distractor, aliasDocument], '鍚堝悓閲岀殑鐢叉柟鏄皝');

  assert.equal(result[0]?.path, aliasDocument.path);
});
