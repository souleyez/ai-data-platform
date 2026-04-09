import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-chat-background-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;
process.env.OPENCLAW_GATEWAY_URL = '';
process.env.OPENCLAW_GATEWAY_TOKEN = '';

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const chatBackgroundJobs = await importFresh<typeof import('../src/lib/chat-background-jobs.js')>(
  '../src/lib/chat-background-jobs.js',
);
const reportCenter = await importFresh<typeof import('../src/lib/report-center.js')>(
  '../src/lib/report-center.js',
);

test.beforeEach(async () => {
  await fs.rm(storageRoot, { recursive: true, force: true });
  await fs.mkdir(storageRoot, { recursive: true });
});

test.after(async () => {
  delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
  delete process.env.OPENCLAW_GATEWAY_URL;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('handoffTimedOutChatToBackground should create a processing markdown report and queued job', async () => {
  const handoff = await chatBackgroundJobs.handoffTimedOutChatToBackground({
    prompt: '根据最新上传的招标文件制作一份标书',
    chatHistory: [{ role: 'user', content: '先分析招标文件，再产出标书' }],
  });

  assert.equal(handoff.savedReport.status, 'processing');
  assert.equal(handoff.savedReport.kind, 'md');
  assert.match(handoff.savedReport.content || '', /后台继续生成/);

  const state = await reportCenter.loadReportCenterReadState();
  assert.equal(state.outputs[0]?.id, handoff.savedReport.id);
  assert.equal(state.outputs[0]?.status, 'processing');

  const jobs = await chatBackgroundJobs.loadChatBackgroundJobState();
  assert.equal(jobs.items.length, 1);
  assert.equal(jobs.items[0]?.status, 'queued');
  assert.equal(jobs.items[0]?.attemptCount, 0);
  assert.equal(jobs.items[0]?.reportOutputId, handoff.savedReport.id);
});

test('runChatBackgroundJobsOnce should finalize queued jobs into ready markdown reports', async () => {
  const handoff = await chatBackgroundJobs.handoffTimedOutChatToBackground({
    prompt: '根据最新上传的招标文件制作一份标书',
  });

  await chatBackgroundJobs.runChatBackgroundJobsOnce({
    execute: async (job) => ({
      content: `完成内容：${job.prompt}`,
      summary: '后台生成已完成。',
      libraries: job.libraries,
      kind: 'md',
      format: 'md',
    }),
  });

  const jobs = await chatBackgroundJobs.loadChatBackgroundJobState();
  assert.equal(jobs.items[0]?.status, 'succeeded');
  assert.equal(jobs.items[0]?.attemptCount, 1);
  assert.ok(jobs.items[0]?.finishedAt);

  const state = await reportCenter.loadReportCenterReadState();
  const record = state.outputs.find((item) => item.id === handoff.savedReport.id);
  assert.ok(record);
  assert.equal(record?.status, 'ready');
  assert.equal(record?.kind, 'md');
  assert.equal(record?.format, 'md');
  assert.equal(record?.content, '完成内容：根据最新上传的招标文件制作一份标书');
});

test('runChatBackgroundJobsOnce should mark reports failed when execution throws', async () => {
  const handoff = await chatBackgroundJobs.handoffTimedOutChatToBackground({
    prompt: '根据最新上传的招标文件制作一份标书',
  });

  const previous = process.env.CHAT_BACKGROUND_JOB_MAX_ATTEMPTS;
  process.env.CHAT_BACKGROUND_JOB_MAX_ATTEMPTS = '1';
  try {
    await chatBackgroundJobs.runChatBackgroundJobsOnce({
      execute: async () => {
        throw new Error('mock timeout');
      },
    });
  } finally {
    if (previous === undefined) {
      delete process.env.CHAT_BACKGROUND_JOB_MAX_ATTEMPTS;
    } else {
      process.env.CHAT_BACKGROUND_JOB_MAX_ATTEMPTS = previous;
    }
  }

  const jobs = await chatBackgroundJobs.loadChatBackgroundJobState();
  assert.equal(jobs.items[0]?.status, 'failed');
  assert.match(jobs.items[0]?.error || '', /mock timeout/);

  const state = await reportCenter.loadReportCenterReadState();
  const record = state.outputs.find((item) => item.id === handoff.savedReport.id);
  assert.ok(record);
  assert.equal(record?.status, 'failed');
  assert.match(record?.summary || '', /mock timeout/);
});

test('runChatBackgroundJobsOnce should requeue timeout failures before max attempts', async () => {
  const handoff = await chatBackgroundJobs.handoffTimedOutChatToBackground({
    prompt: '根据最新上传的招标文件制作一份标书',
  });

  await chatBackgroundJobs.runChatBackgroundJobsOnce({
    execute: async () => {
      throw new Error('Cloud gateway request timed out after 240000ms');
    },
  });

  const jobs = await chatBackgroundJobs.loadChatBackgroundJobState();
  assert.equal(jobs.items[0]?.status, 'queued');
  assert.equal(jobs.items[0]?.attemptCount, 1);
  assert.match(jobs.items[0]?.error || '', /240000ms/);

  const state = await reportCenter.loadReportCenterReadState();
  const record = state.outputs.find((item) => item.id === handoff.savedReport.id);
  assert.ok(record);
  assert.equal(record?.status, 'processing');
  assert.match(record?.summary || '', /继续重试/);
});

test('buildBackgroundContinuationSystemConstraints should append final-deliverable rules', () => {
  const text = chatBackgroundJobs.buildBackgroundContinuationSystemConstraints('保留专业中文输出');
  assert.match(text, /保留专业中文输出/);
  assert.match(text, /直接输出最终可交付内容本身/);
  assert.match(text, /不要描述你的执行过程/);
});

test('sanitizeBackgroundMarkdownContent should strip process narration and fake file-save lines', () => {
  const cleaned = chatBackgroundJobs.sanitizeBackgroundMarkdownContent([
    '让我先读取最新上传的招标文件内容，然后进行分析并制作标书。',
    '',
    '我已经读取了招标文件的详细分析。现在让我搜索一些相关信息来制作更完善的标书。',
    '',
    '## 招标要点',
    '',
    '- 项目名称：开平市乡镇公共区域停车泊位与新能源汽车充电基础设施建设项目',
    '',
    '完整投标标书已保存至：',
    '**`/home/soulzyn/.openclaw/workspace/开平停车充电项目_完整投标标书.md`**',
    '',
    '## 标书草稿',
    '',
    '第一章 项目理解',
    '',
    '是否需要我对某个章节进行补充或调整？',
  ].join('\n'));

  assert.doesNotMatch(cleaned, /让我先读取/);
  assert.doesNotMatch(cleaned, /workspace/);
  assert.doesNotMatch(cleaned, /是否需要我/);
  assert.match(cleaned, /## 招标要点/);
  assert.match(cleaned, /## 标书草稿/);
});
