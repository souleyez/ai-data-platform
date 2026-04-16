import {
  createReportOutput,
  loadReportCenterState,
  resolveReportGroup,
  updateReportOutput,
} from './report-center.js';
import { resolveChatOutputReportGroup } from './chat-output-persistence.js';
import { UNGROUPED_LIBRARY_KEY } from './document-libraries.js';
import { loadLatestVisibleDetailedDocumentContext } from './knowledge-chat-dispatch.js';
import type {
  ChatBackgroundJob,
  ChatBackgroundJobExecutionResult,
  LoggerLike,
  TimedOutChatHandoffInput,
} from './chat-background-jobs-types.js';
import {
  buildBackgroundReportTitle,
  buildChatBackgroundJobId,
  buildProcessingContent,
  getBackgroundJobMaxAttempts,
  isRetryableBackgroundExecutionError,
  normalizeBackgroundChatHistory,
  normalizeChatBackgroundText,
  patchBackgroundJobInState,
  summarizeBackgroundError,
  summarizeBackgroundPrompt,
} from './chat-background-jobs-support.js';
import { loadBackgroundJobState, saveBackgroundJobState } from './chat-background-jobs-state.js';

let workerTimer: NodeJS.Timeout | null = null;
let workerRunning = false;

async function patchJob(jobId: string, patch: Partial<ChatBackgroundJob>): Promise<ChatBackgroundJob | null> {
  const state = await loadBackgroundJobState();
  const nextJob = patchBackgroundJobInState(state, jobId, patch);
  if (!nextJob) return null;
  await saveBackgroundJobState(state);
  return nextJob;
}

async function runNextQueuedJob(input: {
  logger?: LoggerLike;
  execute: (job: ChatBackgroundJob) => Promise<ChatBackgroundJobExecutionResult>;
}) {
  if (workerRunning) return;
  workerRunning = true;

  try {
    const state = await loadBackgroundJobState();
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
      const reason = summarizeBackgroundError(error);
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

export async function handoffTimedOutChatToBackground(input: TimedOutChatHandoffInput) {
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
    id: buildChatBackgroundJobId('chatbg'),
    reportOutputId: savedReport.id,
    status: 'queued',
    attemptCount: 0,
    prompt: input.prompt,
    promptPreview: summarizeBackgroundPrompt(input.prompt),
    request: {
      prompt: input.prompt,
      sessionUser: input.sessionUser,
      chatHistory: normalizeBackgroundChatHistory(input.chatHistory),
      mode: 'general',
      conversationState: input.conversationState ?? null,
      systemConstraints: normalizeChatBackgroundText(input.systemConstraints) || undefined,
      botId: normalizeChatBackgroundText(input.botId) || undefined,
      effectiveVisibleLibraryKeys: Array.isArray(input.effectiveVisibleLibraryKeys)
        ? input.effectiveVisibleLibraryKeys.map((item) => normalizeChatBackgroundText(item)).filter(Boolean)
        : [],
      accessContext: input.accessContext || null,
      confirmedAction: 'openclaw_action',
    },
    libraries: candidateLibraries.length ? candidateLibraries : [{ key: group.key, label: group.label }],
    latestDocumentPath: normalizeChatBackgroundText(latestContext.document?.path),
    createdAt: new Date().toISOString(),
    startedAt: '',
    finishedAt: '',
    error: '',
  };

  const state = await loadBackgroundJobState();
  state.items = [job, ...state.items].slice(0, 200);
  await saveBackgroundJobState(state);

  return { job, savedReport };
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
