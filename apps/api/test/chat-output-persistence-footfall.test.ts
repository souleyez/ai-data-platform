import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-chat-output-footfall-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;
process.env.OPENCLAW_GATEWAY_URL = '';
process.env.OPENCLAW_GATEWAY_TOKEN = '';

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const chatOutputPersistence = await importFresh<typeof import('../src/lib/chat-output-persistence.js')>(
  '../src/lib/chat-output-persistence.js',
);
const reportCenter = await importFresh<typeof import('../src/lib/report-center.js')>(
  '../src/lib/report-center.js',
);
const documentLibraries = await importFresh<typeof import('../src/lib/document-libraries.js')>(
  '../src/lib/document-libraries.js',
);

test.after(async () => {
  try {
    await fs.rm(storageRoot, { recursive: true, force: true });
  } catch {
    // ignore Windows file locking on transient .bak runtime files
  }
});

test('persistChatOutputIfNeeded should store footfall page outputs in GuangzhouAI report records', async () => {
  await documentLibraries.createDocumentLibrary({
    name: '广州AI',
    description: 'Mall footfall library',
    permissionLevel: 0,
  }).catch(() => undefined);

  const record = await chatOutputPersistence.persistChatOutputIfNeeded({
    prompt: '使用知识库广州AI对高明中港城客流采集的数据输出一份商场客流静态页并分析',
    output: {
      type: 'page',
      title: '高明中港城商场客流分析报告',
      content: '基于高明中港城客流数据输出的商场客流分析。',
      format: 'html',
      page: {
        summary: '按商场分区汇总高明中港城客流。',
        cards: [{ label: '总客流', value: '4,830 人次' }],
        sections: [{ title: '客流总览', bullets: ['统一按商场分区汇总，不展开楼层与单间。'] }],
        charts: [],
      },
    },
    libraries: [{ key: 'guangzhou-ai', label: '广州AI' }],
    reportTemplate: null,
  });

  const state = await reportCenter.loadReportCenterReadState();

  assert.ok(record);
  assert.equal(record?.title, '高明中港城商场客流分析报告');
  assert.equal(record?.groupLabel, '广州AI');
  assert.equal(record?.kind, 'page');
  assert.equal(record?.dynamicSource?.enabled, true);
  assert.deepEqual(record?.dynamicSource?.libraries, [{ key: 'guangzhou-ai', label: '广州AI' }]);
  assert.equal(state.outputs[0]?.title, '高明中港城商场客流分析报告');
  assert.equal(state.outputs[0]?.groupLabel, '广州AI');
});
