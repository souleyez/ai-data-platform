import path from 'node:path';
import type { BotDefinition } from './bot-definitions.js';
import { resolveChatOutputReportGroup } from './chat-output-persistence.js';
import { UNGROUPED_LIBRARY_KEY } from './document-libraries.js';
import { loadLatestVisibleDetailedDocumentContext } from './knowledge-chat-dispatch.js';
import type { ResolvedChannelAccess } from './channel-access-resolver.js';
import { STORAGE_CONFIG_DIR } from './paths.js';
import {
  createReportOutput,
  loadReportCenterState,
  resolveReportGroup,
  updateReportOutput,
  type ReportOutputRecord,
} from './report-center.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';

const CHAT_BACKGROUND_JOBS_FILE = path.join(STORAGE_CONFIG_DIR, 'chat-background-jobs.json');

export type ChatBackgroundJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type ChatBackgroundJobRequest = {
  prompt: string;
  sessionUser?: string;
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  mode?: 'general' | 'knowledge_output';
  systemConstraints?: string;
  botId?: string;
  effectiveVisibleLibraryKeys?: string[];
  accessContext?: ResolvedChannelAccess | null;
  confirmedAction?: 'openclaw_action' | 'template_output';
};

export type ChatBackgroundJob = {
  id: string;
  reportOutputId: string;
  status: ChatBackgroundJobStatus;
  attemptCount: number;
  prompt: string;
  promptPreview: string;
  request: ChatBackgroundJobRequest;
  libraries: Array<{ key?: string; label?: string }>;
  latestDocumentPath: string;
  createdAt: string;
  startedAt: string;
  finishedAt: string;
  error: string;
};

export type ChatBackgroundJobExecutionResult = {
  content: string;
  title?: string;
  summary?: string;
  kind?: ReportOutputRecord['kind'];
  format?: string;
  libraries?: Array<{ key?: string; label?: string }>;
  downloadUrl?: string;
};

type ChatBackgroundJobState = {
  items: ChatBackgroundJob[];
};

type LoggerLike = {
  info?: (payload: unknown, message?: string) => void;
  warn?: (payload: unknown, message?: string) => void;
  error?: (payload: unknown, message?: string) => void;
};

let workerTimer: NodeJS.Timeout | null = null;
let workerRunning = false;

function buildId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function normalizeLibraries(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      key: normalizeText((item as { key?: unknown } | null)?.key),
      label: normalizeText((item as { label?: unknown } | null)?.label),
    }))
    .filter((item) => item.key || item.label);
}

function normalizeChatHistory(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      role: (item as { role?: unknown } | null)?.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: normalizeText((item as { content?: unknown } | null)?.content),
    }))
    .filter((item) => item.content)
    .slice(-12);
}

function normalizeJobRequest(value: unknown): ChatBackgroundJobRequest {
  const record = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  return {
    prompt: normalizeText(record.prompt),
    sessionUser: normalizeText(record.sessionUser) || undefined,
    chatHistory: normalizeChatHistory(record.chatHistory),
    mode: record.mode === 'knowledge_output' ? 'knowledge_output' : 'general',
    systemConstraints: normalizeText(record.systemConstraints) || undefined,
    botId: normalizeText(record.botId) || undefined,
    effectiveVisibleLibraryKeys: Array.isArray(record.effectiveVisibleLibraryKeys)
      ? record.effectiveVisibleLibraryKeys.map((item) => normalizeText(item)).filter(Boolean)
      : [],
    accessContext: (record.accessContext && typeof record.accessContext === 'object') ? record.accessContext as ResolvedChannelAccess : null,
    confirmedAction: normalizeText(record.confirmedAction) === 'template_output' ? 'template_output' : 'openclaw_action',
  };
}

function normalizeJob(value: unknown): ChatBackgroundJob | null {
  const record = typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
  if (!record) return null;
  const id = normalizeText(record.id);
  const reportOutputId = normalizeText(record.reportOutputId);
  const request = normalizeJobRequest(record.request);
  if (!id || !reportOutputId || !request.prompt) return null;
  const status = normalizeText(record.status);
  return {
    id,
    reportOutputId,
    status: status === 'running' || status === 'succeeded' || status === 'failed' ? status : 'queued',
    attemptCount: Math.max(0, Math.floor(Number(record.attemptCount || 0))),
    prompt: request.prompt,
    promptPreview: normalizeText(record.promptPreview) || request.prompt.slice(0, 120),
    request,
    libraries: normalizeLibraries(record.libraries),
    latestDocumentPath: normalizeText(record.latestDocumentPath),
    createdAt: normalizeText(record.createdAt) || new Date().toISOString(),
    startedAt: normalizeText(record.startedAt),
    finishedAt: normalizeText(record.finishedAt),
    error: normalizeText(record.error),
  };
}

async function loadJobState() {
  const { data } = await readRuntimeStateJson<ChatBackgroundJobState>({
    filePath: CHAT_BACKGROUND_JOBS_FILE,
    fallback: { items: [] },
    normalize: (parsed) => {
      const items = Array.isArray((parsed as { items?: unknown[] } | null)?.items)
        ? (parsed as { items: unknown[] }).items.map((item) => normalizeJob(item)).filter(Boolean) as ChatBackgroundJob[]
        : [];
      return { items };
    },
  });
  return data;
}

async function saveJobState(state: ChatBackgroundJobState) {
  await writeRuntimeStateJson({
    filePath: CHAT_BACKGROUND_JOBS_FILE,
    payload: {
      items: state.items,
    },
  });
}

function summarizePrompt(prompt: string) {
  const normalized = normalizeText(prompt).replace(/\s+/g, ' ');
  if (!normalized) return '后台生成内容';
  return normalized.length > 48 ? `${normalized.slice(0, 48)}...` : normalized;
}

function joinConstraintBlocks(blocks: Array<string | undefined>) {
  return blocks
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .join('\n');
}

function buildBackgroundReportTitle(prompt: string, latestDocumentTitle?: string) {
  const docTitle = normalizeText(latestDocumentTitle);
  if (docTitle) return `${docTitle} 后台生成`;
  return `${summarizePrompt(prompt)} 后台生成`;
}

function buildProcessingContent(prompt: string) {
  return [
    '该内容超过同步窗口，已转入报表中心后台继续生成。',
    '',
    `原始请求：${summarizePrompt(prompt)}`,
    '状态：处理中',
  ].join('\n');
}

export function buildBackgroundContinuationSystemConstraints(systemConstraints?: string) {
  return joinConstraintBlocks([
    systemConstraints,
    [
      '当前输出将直接存入报表中心的 Markdown 报表。',
      '不要描述你的执行过程、搜索过程、读取过程、思考过程或工具调用过程。',
      '不要说“让我先”“我已经”“下面我来”“接下来我会”。',
      '不要声称已经把结果写入某个本地文件、工作区路径或外部路径。',
      '不要输出文件保存路径、命令行、内部目录、workspace 路径、/home 路径。',
      '直接输出最终可交付内容本身，允许使用 Markdown 标题、列表、表格。',
      '结尾不要反问用户，不要加“是否需要我继续”之类的话。',
    ].join('\n'),
  ]);
}

export function sanitizeBackgroundMarkdownContent(content: string) {
  const normalized = String(content || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';

  const paragraphs = normalized.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const isProcessParagraph = (paragraph: string) => (
    /^(让我先|我先|现在让我|下面我来|接下来我会|我已经|现在我已经|我来先获取)/u.test(paragraph)
    || /(?:工具|搜索|读取|获取).*(?:招标文件|文档|资料)/u.test(paragraph)
    || /已保存至/u.test(paragraph)
    || /(?:\/home\/|\.openclaw\/workspace|workspace\/|[A-Z]:\\)/.test(paragraph)
  );

  let start = 0;
  while (start < paragraphs.length && isProcessParagraph(paragraphs[start])) {
    start += 1;
  }

  let end = paragraphs.length;
  while (end > start && (/^(是否需要我|如需我|如果你需要我继续)/u.test(paragraphs[end - 1]) || isProcessParagraph(paragraphs[end - 1]))) {
    end -= 1;
  }

  const kept = paragraphs
    .slice(start, end)
    .filter((paragraph) => !/已保存至/u.test(paragraph))
    .filter((paragraph) => !/(?:\/home\/|\.openclaw\/workspace|workspace\/|[A-Z]:\\)/.test(paragraph));

  return kept.join('\n\n').trim();
}

function summarizeError(error: unknown) {
  if (error instanceof Error) return error.message || error.name || 'unknown-error';
  return String(error || 'unknown-error');
}

export function isChatTimeoutBackgroundCandidate(error: unknown) {
  const message = summarizeError(error).toLowerCase();
  return message.includes('timed out after');
}

function isRetryableBackgroundExecutionError(error: unknown) {
  return isChatTimeoutBackgroundCandidate(error);
}

function getBackgroundJobMaxAttempts() {
  const parsed = Number(process.env.CHAT_BACKGROUND_JOB_MAX_ATTEMPTS || '2');
  if (!Number.isFinite(parsed) || parsed < 1) return 2;
  return Math.floor(parsed);
}

export async function loadChatBackgroundJobState() {
  return loadJobState();
}

export async function handoffTimedOutChatToBackground(input: {
  prompt: string;
  sessionUser?: string;
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  systemConstraints?: string;
  botId?: string;
  botDefinition?: BotDefinition | null;
  effectiveVisibleLibraryKeys?: string[];
  accessContext?: ResolvedChannelAccess | null;
  preferredDocumentPath?: string;
}) {
  const latestContext = await loadLatestVisibleDetailedDocumentContext({
    botDefinition: input.botDefinition,
    effectiveVisibleLibraryKeys: input.effectiveVisibleLibraryKeys,
    preferredDocumentPath: input.preferredDocumentPath,
  });
  const candidateLibraries = latestContext.libraries;
  const reportState = await loadReportCenterState();
  const group =
    resolveChatOutputReportGroup(reportState.groups, candidateLibraries, input.prompt)
    || (candidateLibraries[0]?.key ? resolveReportGroup(reportState.groups, candidateLibraries[0].key || '') : null)
    || resolveReportGroup(reportState.groups, UNGROUPED_LIBRARY_KEY)
    || reportState.groups[0]
    || null;

  if (!group) {
    throw new Error('report group not found for background continuation');
  }

  const savedReport = await createReportOutput({
    groupKey: group.key,
    title: buildBackgroundReportTitle(input.prompt, latestContext.document?.title || latestContext.document?.name),
    triggerSource: 'chat',
    kind: 'md',
    format: 'md',
    status: 'processing',
    summary: '该内容超过同步时限，已转入报表中心后台继续生成。',
    content: buildProcessingContent(input.prompt),
    libraries: candidateLibraries.length ? candidateLibraries : [{ key: group.key, label: group.label }],
  });

  const job: ChatBackgroundJob = {
    id: buildId('chatbg'),
    reportOutputId: savedReport.id,
    status: 'queued',
    attemptCount: 0,
    prompt: input.prompt,
    promptPreview: summarizePrompt(input.prompt),
    request: {
      prompt: input.prompt,
      sessionUser: input.sessionUser,
      chatHistory: normalizeChatHistory(input.chatHistory),
      mode: 'general',
      systemConstraints: normalizeText(input.systemConstraints) || undefined,
      botId: normalizeText(input.botId) || undefined,
      effectiveVisibleLibraryKeys: Array.isArray(input.effectiveVisibleLibraryKeys)
        ? input.effectiveVisibleLibraryKeys.map((item) => normalizeText(item)).filter(Boolean)
        : [],
      accessContext: input.accessContext || null,
      confirmedAction: 'openclaw_action',
    },
    libraries: candidateLibraries.length ? candidateLibraries : [{ key: group.key, label: group.label }],
    latestDocumentPath: normalizeText(latestContext.document?.path),
    createdAt: new Date().toISOString(),
    startedAt: '',
    finishedAt: '',
    error: '',
  };

  const state = await loadJobState();
  state.items = [job, ...state.items].slice(0, 200);
  await saveJobState(state);

  return { job, savedReport };
}

async function patchJob(jobId: string, patch: Partial<ChatBackgroundJob>): Promise<ChatBackgroundJob | null> {
  const state = await loadJobState();
  const index = state.items.findIndex((item) => item.id === jobId);
  if (index < 0) return null;
  const nextJob: ChatBackgroundJob = {
    ...state.items[index],
    ...patch,
  };
  state.items[index] = nextJob;
  await saveJobState(state);
  return nextJob;
}

async function runNextQueuedJob(input: {
  logger?: LoggerLike;
  execute: (job: ChatBackgroundJob) => Promise<ChatBackgroundJobExecutionResult>;
}) {
  if (workerRunning) return;
  workerRunning = true;

  try {
    const state = await loadJobState();
    const nextJob = state.items.find((item) => item.status === 'queued');
    if (!nextJob) return;

    const runningJob = await patchJob(nextJob.id, {
      status: 'running',
      attemptCount: nextJob.attemptCount + 1,
      startedAt: new Date().toISOString(),
      error: '',
    });
    if (!runningJob) return;

    input.logger?.info?.({ jobId: runningJob.id, reportOutputId: runningJob.reportOutputId }, 'chat background job started');

    try {
      const result = await input.execute(runningJob);
      await updateReportOutput(runningJob.reportOutputId, {
        status: 'ready',
        kind: result.kind || 'md',
        format: result.format || 'md',
        title: result.title,
        summary: String(result.summary || '').trim() || '该内容已在报表中心完成后台生成。',
        content: result.content,
        libraries: Array.isArray(result.libraries) && result.libraries.length ? result.libraries : runningJob.libraries,
        downloadUrl: result.downloadUrl,
      });
      await patchJob(runningJob.id, {
        status: 'succeeded',
        finishedAt: new Date().toISOString(),
        error: '',
      });
      input.logger?.info?.({ jobId: runningJob.id, reportOutputId: runningJob.reportOutputId }, 'chat background job finished');
    } catch (error) {
      const reason = summarizeError(error);
      const shouldRetry = isRetryableBackgroundExecutionError(error) && runningJob.attemptCount < getBackgroundJobMaxAttempts();
      if (shouldRetry) {
        await updateReportOutput(runningJob.reportOutputId, {
          status: 'processing',
          summary: `后台生成耗时较长，正在继续重试（第 ${runningJob.attemptCount + 1} 次）。`,
        }).catch(() => undefined);
        await patchJob(runningJob.id, {
          status: 'queued',
          startedAt: '',
          finishedAt: '',
          error: reason,
        });
        input.logger?.warn?.({ error, jobId: runningJob.id, reportOutputId: runningJob.reportOutputId }, 'chat background job timed out and will retry');
      } else {
        await updateReportOutput(runningJob.reportOutputId, {
          status: 'failed',
          summary: `后台生成失败：${reason}`,
        }).catch(() => undefined);
        await patchJob(runningJob.id, {
          status: 'failed',
          finishedAt: new Date().toISOString(),
          error: reason,
        });
        input.logger?.warn?.({ error, jobId: runningJob.id, reportOutputId: runningJob.reportOutputId }, 'chat background job failed');
      }
    }
  } finally {
    workerRunning = false;
  }
}

export async function runChatBackgroundJobsOnce(input: {
  logger?: LoggerLike;
  execute: (job: ChatBackgroundJob) => Promise<ChatBackgroundJobExecutionResult>;
}) {
  await runNextQueuedJob(input);
}

function getWorkerPollMs() {
  const parsed = Number(process.env.CHAT_BACKGROUND_JOB_POLL_MS || '4000');
  if (!Number.isFinite(parsed) || parsed < 1000) return 4000;
  return Math.floor(parsed);
}

export function startChatBackgroundJobWorker(input: {
  logger?: LoggerLike;
  execute: (job: ChatBackgroundJob) => Promise<ChatBackgroundJobExecutionResult>;
}) {
  if (workerTimer) {
    return {
      stop: async () => {
        if (workerTimer) {
          clearInterval(workerTimer);
          workerTimer = null;
        }
      },
    };
  }

  const tick = () => {
    void runNextQueuedJob(input);
  };

  workerTimer = setInterval(tick, getWorkerPollMs());
  tick();

  return {
    stop: async () => {
      if (workerTimer) {
        clearInterval(workerTimer);
        workerTimer = null;
      }
    },
  };
}
