import 'dotenv/config.js';
import { createApp } from './app.js';
import {
  buildBackgroundContinuationSystemConstraints,
  sanitizeBackgroundMarkdownContent,
  startChatBackgroundJobWorker,
} from './lib/chat-background-jobs.js';
import { ensureDefaultProjectSamples } from './lib/default-project-samples.js';
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
      const response = await runChatOrchestrationV2({
        ...job.request,
        mode: 'general',
        confirmedAction: 'openclaw_action',
        backgroundContinuation: true,
        cloudTimeoutMs: getChatBackgroundGatewayTimeoutMs(job.attemptCount || 1),
        systemConstraints: buildBackgroundContinuationSystemConstraints(job.request.systemConstraints),
        preferredDocumentPath: job.latestDocumentPath || undefined,
      });
      const content = sanitizeBackgroundMarkdownContent(String(response.message?.content || '').trim());
      if (response.mode !== 'openclaw' || !content) {
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
