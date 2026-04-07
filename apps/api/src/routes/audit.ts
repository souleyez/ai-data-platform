import type { FastifyInstance } from 'fastify';
import {
  buildAuditSnapshot,
  cleanupAuditCaptureTask,
  cleanupAuditDocument,
  hardDeleteAuditCaptureTask,
  hardDeleteAuditDocument,
  pauseAuditCaptureTask,
  runAuditPolicy,
} from '../lib/audit-center.js';
import { loadOperationsOverviewPayload } from '../lib/operations-overview.js';

export async function registerAuditRoutes(app: FastifyInstance) {
  const disableAuditPolicyInDev =
    process.env.DISABLE_AUDIT_POLICY_IN_DEV === undefined
      ? process.env.NODE_ENV !== 'production'
      : /^(1|true|yes)$/i.test(process.env.DISABLE_AUDIT_POLICY_IN_DEV);

  app.get('/audit', async () => {
    const [snapshot, operationsOverview] = await Promise.all([
      buildAuditSnapshot(),
      loadOperationsOverviewPayload(),
    ]);
    return {
      mode: 'read-only',
      ...snapshot,
      stability: operationsOverview.stability,
    };
  });

  app.post('/audit/run-policy', async () => {
    if (disableAuditPolicyInDev) {
      return {
        status: 'skipped',
        message: 'audit policy disabled in local development',
        cleanedDocuments: 0,
        cleanedCaptureTasks: 0,
      };
    }

    return runAuditPolicy();
  });

  app.post('/audit/capture-tasks/:id/pause', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const item = await pauseAuditCaptureTask(id);
      return {
        status: 'paused',
        item,
        message: '已停采该数据源，后续将不再自动采集。',
      };
    } catch (error) {
      return reply.code(404).send({ error: error instanceof Error ? error.message : 'pause failed' });
    }
  });

  app.post('/audit/documents/:id/cleanup', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const item = await cleanupAuditDocument(id);
      return {
        status: 'cleaned',
        item,
        message: '已删除原文件，保留结构化结果。',
      };
    } catch (error) {
      return reply.code(404).send({ error: error instanceof Error ? error.message : 'document cleanup failed' });
    }
  });

  app.post('/audit/documents/cleanup', async (request, reply) => {
    const { id } = (request.body || {}) as { id?: string };
    if (!id) return reply.code(400).send({ error: 'document id is required' });
    try {
      const item = await cleanupAuditDocument(id);
      return {
        status: 'cleaned',
        item,
        message: '已删除原文件，保留结构化结果。',
      };
    } catch (error) {
      return reply.code(404).send({ error: error instanceof Error ? error.message : 'document cleanup failed' });
    }
  });

  app.post('/audit/documents/:id/hard-delete', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const item = await hardDeleteAuditDocument(id);
      return {
        status: 'hard-deleted',
        item,
        message: '已彻底删除文档及结构化数据。',
      };
    } catch (error) {
      return reply.code(404).send({ error: error instanceof Error ? error.message : 'document hard delete failed' });
    }
  });

  app.post('/audit/documents/hard-delete', async (request, reply) => {
    const { id } = (request.body || {}) as { id?: string };
    if (!id) return reply.code(400).send({ error: 'document id is required' });
    try {
      const item = await hardDeleteAuditDocument(id);
      return {
        status: 'hard-deleted',
        item,
        message: '已彻底删除文档及结构化数据。',
      };
    } catch (error) {
      return reply.code(404).send({ error: error instanceof Error ? error.message : 'document hard delete failed' });
    }
  });

  app.post('/audit/capture-tasks/:id/cleanup', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const item = await cleanupAuditCaptureTask(id);
      return {
        status: 'cleaned',
        item,
        message: '已停采并删除原始采集文件，保留结构化结果。',
      };
    } catch (error) {
      return reply.code(404).send({ error: error instanceof Error ? error.message : 'capture cleanup failed' });
    }
  });

  app.post('/audit/capture-tasks/cleanup', async (request, reply) => {
    const { id } = (request.body || {}) as { id?: string };
    if (!id) return reply.code(400).send({ error: 'capture task id is required' });
    try {
      const item = await cleanupAuditCaptureTask(id);
      return {
        status: 'cleaned',
        item,
        message: '已停采并删除原始采集文件，保留结构化结果。',
      };
    } catch (error) {
      return reply.code(404).send({ error: error instanceof Error ? error.message : 'capture cleanup failed' });
    }
  });

  app.post('/audit/capture-tasks/:id/hard-delete', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const item = await hardDeleteAuditCaptureTask(id);
      return {
        status: 'hard-deleted',
        item,
        message: '已彻底删除数据源及相关结构化数据。',
      };
    } catch (error) {
      return reply.code(404).send({ error: error instanceof Error ? error.message : 'capture hard delete failed' });
    }
  });

  app.post('/audit/capture-tasks/hard-delete', async (request, reply) => {
    const { id } = (request.body || {}) as { id?: string };
    if (!id) return reply.code(400).send({ error: 'capture task id is required' });
    try {
      const item = await hardDeleteAuditCaptureTask(id);
      return {
        status: 'hard-deleted',
        item,
        message: '已彻底删除数据源及相关结构化数据。',
      };
    } catch (error) {
      return reply.code(404).send({ error: error instanceof Error ? error.message : 'capture hard delete failed' });
    }
  });
}
