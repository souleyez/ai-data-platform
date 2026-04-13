import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-chat-platform-actions-test-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;
delete process.env.OPENCLAW_GATEWAY_URL;
delete process.env.OPENCLAW_GATEWAY_TOKEN;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const orchestrator = await importFresh<typeof import('../src/lib/orchestrator.js')>(
  '../src/lib/orchestrator.js',
);
const platformControl = await importFresh<typeof import('../src/lib/platform-control.js')>(
  '../src/lib/platform-control.js',
);

async function removeDirWithRetry(targetPath: string, attempts = 8) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (
        index === attempts - 1
        || !(error && typeof error === 'object' && 'code' in error)
        || !['ENOTEMPTY', 'EPERM', 'EBUSY'].includes(String((error as { code?: string }).code || ''))
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * (index + 1)));
    }
  }
}

test.after(async () => {
  await removeDirWithRetry(storageRoot);
});

test('chat orchestration should execute create-library as a host action and return actionResult', async () => {
  const result = await orchestrator.runChatOrchestrationV2({
    prompt: '新建一个订单分析数据集',
    mode: 'general',
    chatHistory: [],
  });

  assert.equal(result.mode, 'host');
  assert.equal(result.message?.meta, '系统操作已执行');
  assert.equal(result.actionResult?.action, 'documents.create-library');
  assert.equal(result.actionResult?.domain, 'documents');
  assert.deepEqual(result.actionResult?.invalidate, ['documents']);
  assert.match(String(result.message?.content || ''), /订单分析/u);
  assert.ok(Array.isArray(result.libraries));
  assert.equal(result.libraries[0]?.label, '订单分析');
  assert.equal(result.message?.actionResult?.action, 'documents.create-library');
});

test('chat orchestration should not misclassify ordinary dataset analysis as create-library action', async () => {
  const result = await orchestrator.runChatOrchestrationV2({
    prompt: '分析订单数据集最近30天趋势',
    mode: 'general',
    chatHistory: [],
  });

  assert.notEqual(result.mode, 'host');
  assert.equal(result.actionResult || null, null);
});

test('chat orchestration should rename a dataset library and keep documents invalidation', async () => {
  await platformControl.executePlatformControlCommand([
    'documents',
    'create-library',
    '--name',
    '销售归档',
  ]);

  const result = await orchestrator.runChatOrchestrationV2({
    prompt: '把销售归档数据集改名为销售经营',
    mode: 'general',
    chatHistory: [],
  });

  assert.equal(result.mode, 'host');
  assert.equal(result.actionResult?.action, 'documents.update-library');
  assert.equal(result.actionResult?.status, 'completed');
  assert.deepEqual(result.actionResult?.invalidate, ['documents']);
  assert.match(String(result.message?.content || ''), /销售经营/u);
});

test('chat orchestration should delete a dataset library through host action', async () => {
  await platformControl.executePlatformControlCommand([
    'documents',
    'create-library',
    '--name',
    '待删分组',
  ]);

  const result = await orchestrator.runChatOrchestrationV2({
    prompt: '删除待删分组数据集',
    mode: 'general',
    chatHistory: [],
  });

  assert.equal(result.mode, 'host');
  assert.equal(result.actionResult?.action, 'documents.delete-library');
  assert.equal(result.actionResult?.status, 'completed');
  assert.deepEqual(result.actionResult?.invalidate, ['documents']);
});

test('chat orchestration should switch models through host action', async () => {
  const result = await orchestrator.runChatOrchestrationV2({
    prompt: '切换到 MiniMax M2.5 Highspeed 模型',
    mode: 'general',
    chatHistory: [],
  });

  assert.equal(result.mode, 'host');
  assert.equal(result.actionResult?.action, 'models.select');
  assert.equal(result.actionResult?.status, 'completed');
  assert.deepEqual(result.actionResult?.invalidate, ['models']);
  assert.match(String(result.message?.content || ''), /MiniMax/u);
});

test('chat orchestration should pause a datasource through host action', async () => {
  await platformControl.executePlatformControlCommand([
    'documents',
    'create-library',
    '--name',
    '订单分析数据源库',
  ]);
  await platformControl.executePlatformControlCommand([
    'datasources',
    'create',
    '--name',
    '订单采集',
    '--kind',
    'web_public',
    '--library',
    '订单分析数据源库',
    '--url',
    'https://example.com/orders',
  ]);

  const result = await orchestrator.runChatOrchestrationV2({
    prompt: '暂停订单采集数据源',
    mode: 'general',
    chatHistory: [],
  });

  assert.equal(result.mode, 'host');
  assert.equal(result.actionResult?.action, 'datasources.pause');
  assert.equal(result.actionResult?.status, 'completed');
  assert.deepEqual(result.actionResult?.invalidate, ['datasources']);
  assert.match(String(result.message?.content || ''), /订单采集/u);
});
