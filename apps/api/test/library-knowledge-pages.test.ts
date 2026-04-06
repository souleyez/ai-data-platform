import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildLibraryKnowledgePagesContextBlock,
  syncLibraryKnowledgePagesForLibraryKeys,
} from '../src/lib/library-knowledge-pages.js';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..', '..', '..');
const STORAGE_ROOT = path.join(REPO_ROOT, 'storage');
const CONFIG_ROOT = path.join(STORAGE_ROOT, 'config');
const CACHE_ROOT = path.join(STORAGE_ROOT, 'cache');
const MEMORY_ROOT = path.join(REPO_ROOT, 'memory', 'library-pages');
const LIBRARIES_FILE = path.join(CONFIG_ROOT, 'document-libraries.json');
const CACHE_FILE = path.join(CACHE_ROOT, 'documents-cache.json');

test('library knowledge pages should compile summary json and context block', async () => {
  const previousLibraries = existsSync(LIBRARIES_FILE) ? readFileSync(LIBRARIES_FILE, 'utf8') : null;
  const previousCache = existsSync(CACHE_FILE) ? readFileSync(CACHE_FILE, 'utf8') : null;
  const libraryDir = path.join(MEMORY_ROOT, 'xinshijie-ioa');

  try {
    await fs.mkdir(CONFIG_ROOT, { recursive: true });
    await fs.mkdir(CACHE_ROOT, { recursive: true });
    await fs.rm(libraryDir, { recursive: true, force: true });

    await fs.writeFile(LIBRARIES_FILE, JSON.stringify({
      items: [
        {
          key: 'xinshijie-ioa',
          label: '新世界IOA',
          description: '企业规范与流程问答资料',
          permissionLevel: 0,
          knowledgePagesEnabled: true,
          knowledgePagesMode: 'overview',
          createdAt: '2026-04-06T00:00:00.000Z',
        },
      ],
    }, null, 2), 'utf8');

    await fs.writeFile(CACHE_FILE, JSON.stringify({
      generatedAt: '2026-04-06T00:00:00.000Z',
      scanRoot: '',
      scanRoots: [],
      totalFiles: 2,
      indexedPaths: [
        'C:\\mock\\1775117515295-ioa-guide-1.md',
        'C:\\mock\\1775117515296-ioa-guide-2.md',
      ],
      items: [
        {
          path: 'C:\\mock\\1775117515295-ioa-guide-1.md',
          name: '1775117515295-ioa-guide-1.md',
          title: 'IOA登录与做单指引',
          summary: '说明 IOA 登录入口、申请做单步骤与常见限制。',
          parseStatus: 'parsed',
          parseStage: 'detailed',
          detailParseStatus: 'succeeded',
          detailParsedAt: '2026-04-06T09:00:00.000Z',
          groups: ['xinshijie-ioa'],
          confirmedGroups: ['xinshijie-ioa'],
          topicTags: ['IOA登录', '做单流程'],
          structuredProfile: {
            focusedFields: {
              businessSystem: 'IOA',
              operationEntry: '内网入口、企微入口',
            },
            focusedFieldEntries: [
              { key: 'businessSystem', alias: '业务系统', value: 'IOA' },
              { key: 'operationEntry', alias: '操作入口', value: '内网入口、企微入口' },
            ],
          },
        },
        {
          path: 'C:\\mock\\1775117515296-ioa-guide-2.md',
          name: '1775117515296-ioa-guide-2.md',
          title: '预算调整审批规范',
          summary: '描述非工程合同预算调整适用范围、审批层级和规则。',
          parseStatus: 'parsed',
          parseStage: 'detailed',
          detailParseStatus: 'succeeded',
          detailParsedAt: '2026-04-06T10:00:00.000Z',
          groups: ['xinshijie-ioa'],
          confirmedGroups: ['xinshijie-ioa'],
          topicTags: ['预算调整', '审批层级'],
          structuredProfile: {
            focusedFields: {
              documentKind: '预算调整指引',
              approvalLevels: '部门负责人、集团审批',
            },
            focusedFieldEntries: [
              { key: 'documentKind', alias: '文档类型', value: '预算调整指引' },
              { key: 'approvalLevels', alias: '审批层级', value: '部门负责人、集团审批' },
            ],
          },
        },
      ],
    }, null, 2), 'utf8');

    const result = await syncLibraryKnowledgePagesForLibraryKeys(['xinshijie-ioa'], 'test-sync');
    assert.equal(result.updatedLibraryCount, 1);

    const summaryFile = path.join(libraryDir, 'summary.json');
    const overviewFile = path.join(libraryDir, 'overview.md');
    const updatesFile = path.join(libraryDir, 'updates.md');
    assert.equal(existsSync(summaryFile), true);
    assert.equal(existsSync(overviewFile), true);
    assert.equal(existsSync(updatesFile), true);

    const summary = JSON.parse(await fs.readFile(summaryFile, 'utf8'));
    assert.equal(summary.libraryKey, 'xinshijie-ioa');
    assert.equal(summary.documentCount, 2);
    assert.match(summary.overview, /新世界IOA|IOA/);
    assert.ok(Array.isArray(summary.keyTopics) && summary.keyTopics.length >= 1);
    assert.ok(Array.isArray(summary.keyFacts) && summary.keyFacts.length >= 1);

    const contextBlock = await buildLibraryKnowledgePagesContextBlock([
      { key: 'xinshijie-ioa', label: '新世界IOA' },
    ]);
    assert.match(contextBlock, /Compiled library knowledge summary/);
    assert.match(contextBlock, /新世界IOA/);
    assert.match(contextBlock, /Key topics:/);
  } finally {
    await fs.rm(libraryDir, { recursive: true, force: true }).catch(() => undefined);
    if (previousLibraries === null) {
      await fs.rm(LIBRARIES_FILE, { force: true }).catch(() => undefined);
    } else {
      await fs.writeFile(LIBRARIES_FILE, previousLibraries, 'utf8');
    }
    if (previousCache === null) {
      await fs.rm(CACHE_FILE, { force: true }).catch(() => undefined);
    } else {
      await fs.writeFile(CACHE_FILE, previousCache, 'utf8');
    }
  }
});
