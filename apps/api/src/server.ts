import 'dotenv/config.js';
import { createApp } from './app.js';
import {
  buildBackgroundContinuationSystemConstraints,
  sanitizeBackgroundMarkdownContent,
  startChatBackgroundJobWorker,
} from './lib/chat-background-jobs.js';
import { ensureDefaultProjectSamples } from './lib/default-project-samples.js';
import { loadParsedDocuments } from './lib/document-store.js';
import {
  buildLatestParsedDocumentFullTextContextBlock,
} from './lib/knowledge-chat-dispatch.js';
import { runOpenClawChat } from './lib/openclaw-adapter.js';
import { runChatOrchestrationV2 } from './lib/orchestrator.js';
import { startWecomLongConnectionManager } from './lib/wecom-long-connection.js';

const app = createApp();
const port = Number(process.env.PORT || 3100);
const host = process.env.HOST || '0.0.0.0';
let stopWecomLongConnections: null | (() => Promise<void>) = null;
let stopChatBackgroundJobs: null | (() => Promise<void>) = null;

function getChatBackgroundGatewayTimeoutMs(attemptCount = 1) {
  const parsed = Number(process.env.CHAT_BACKGROUND_GATEWAY_TIMEOUT_MS || '600000');
  const base = (!Number.isFinite(parsed) || parsed < 60_000) ? 600_000 : Math.floor(parsed);
  const attempt = Math.max(1, Math.floor(Number(attemptCount) || 1));
  return base + Math.max(0, attempt - 1) * 300_000;
}

async function buildPreferredDocumentFullTextContextBlock(preferredDocumentPath?: string) {
  const normalizedPath = String(preferredDocumentPath || '').trim();
  if (!normalizedPath) return '';
  const state = await loadParsedDocuments(240, false);
  const document = state.items.find((item) => String(item.path || '').trim() === normalizedPath) || null;
  return buildLatestParsedDocumentFullTextContextBlock(document);
}

function buildBackgroundDirectReportSystemPrompt(systemConstraints: string) {
  return [
    '你正在为报表中心生成最终交付的 Markdown 文档。',
    '禁止输出工具调用、命令、搜索过程、读取过程、思考过程或执行计划。',
    '请直接基于已提供的文档正文完成任务，不要改写成其他示例项目，不要虚构不同的项目名称、招标单位、预算或技术范围。',
    '如果任务是招标/投标相关，请先提炼招标要点，再输出一份可直接修改的投标标书草稿，最后列出待补充材料清单。',
    String(systemConstraints || '').trim(),
  ].filter(Boolean).join('\n');
}

app.listen({ port, host }).then(() => {
  app.log.info(`API server running at http://${host}:${port}`);
  void ensureDefaultProjectSamples().catch((error) => {
    app.log.warn({ error }, 'default project sample sync failed');
  });
  void startWecomLongConnectionManager(app.log)
    .then((manager) => {
      stopWecomLongConnections = manager.stop;
    })
    .catch((error) => {
      app.log.warn({ error }, 'wecom long connection startup failed');
    });
  const worker = startChatBackgroundJobWorker({
    logger: app.log,
    execute: async (job) => {
      const systemConstraints = buildBackgroundContinuationSystemConstraints(job.request.systemConstraints);
      const response = await runChatOrchestrationV2({
        ...job.request,
        mode: 'general',
        confirmedAction: 'openclaw_action',
        backgroundContinuation: true,
        cloudTimeoutMs: getChatBackgroundGatewayTimeoutMs(job.attemptCount || 1),
        systemConstraints,
        preferredDocumentPath: job.latestDocumentPath || undefined,
      });
      let content = sanitizeBackgroundMarkdownContent(String(response.message?.content || '').trim());

      if (response.mode !== 'openclaw' || !content) {
        const preferredDocumentContextBlock = await buildPreferredDocumentFullTextContextBlock(job.latestDocumentPath);
        if (preferredDocumentContextBlock) {
          const fallback = await runOpenClawChat({
            prompt: job.prompt,
            sessionUser: job.request.sessionUser,
            timeoutMs: getChatBackgroundGatewayTimeoutMs(job.attemptCount || 1),
            systemPrompt: buildBackgroundDirectReportSystemPrompt(systemConstraints),
            contextBlocks: [preferredDocumentContextBlock],
          });
          content = sanitizeBackgroundMarkdownContent(String(fallback.content || '').trim());
        }
      }

      if (!content) {
        throw new Error(response.orchestration?.fallbackReason || 'background continuation returned no content');
      }
      return {
        content,
        libraries: Array.isArray(response.libraries) ? response.libraries : job.libraries,
        summary: '该内容已在报表中心完成后台生成。',
        kind: 'md',
        format: 'md',
      };
    },
  });
  stopChatBackgroundJobs = worker.stop;
}).catch((error) => {
  app.log.error(error);
  process.exit(1);
});

async function shutdown() {
  try {
    if (stopChatBackgroundJobs) {
      await stopChatBackgroundJobs();
    }
    if (stopWecomLongConnections) {
      await stopWecomLongConnections();
    }
  } finally {
    await app.close();
  }
}

process.on('SIGINT', () => {
  void shutdown().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0));
});
