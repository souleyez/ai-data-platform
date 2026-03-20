import type { FastifyInstance } from 'fastify';
import {
  createReportOutput,
  loadReportCenterState,
  updateReportGroupTemplate,
  uploadReportReferenceImage,
} from '../lib/report-center.js';

export async function registerReportRoutes(app: FastifyInstance) {
  app.get('/reports', async () => {
    const state = await loadReportCenterState();

    return {
      mode: 'read-only',
      total: state.groups.length + state.outputs.length,
      groups: state.groups,
      outputRecords: state.outputs,
      meta: {
        groups: state.groups.length,
        templates: state.groups.reduce((acc, group) => acc + group.templates.length, 0),
        outputs: state.outputs.length,
        referenceImages: state.groups.reduce((acc, group) => acc + group.referenceImages.length, 0),
      },
    };
  });

  app.post('/reports/generate', async (request, reply) => {
    const body = (request.body || {}) as {
      groupKey?: string;
      templateKey?: string;
      title?: string;
    };

    const groupKey = String(body.groupKey || '').trim();
    if (!groupKey) {
      return reply.code(400).send({ error: 'groupKey is required' });
    }

    const record = await createReportOutput({
      groupKey,
      templateKey: body.templateKey,
      title: body.title,
      triggerSource: 'report-center',
    });

    return {
      status: 'generated',
      item: record,
      message: `已生成 ${record.groupLabel} 分组的 ${record.templateLabel} 报表。`,
    };
  });

  app.post('/reports/group-template', async (request, reply) => {
    const body = (request.body || {}) as {
      groupKey?: string;
      templateKey?: string;
    };

    const groupKey = String(body.groupKey || '').trim();
    const templateKey = String(body.templateKey || '').trim();
    if (!groupKey || !templateKey) {
      return reply.code(400).send({ error: 'groupKey and templateKey are required' });
    }

    const result = await updateReportGroupTemplate(groupKey, templateKey);
    return {
      status: 'updated',
      item: result.group,
      message: `已将 ${result.group.label} 分组的输出方式切换为 ${result.template.label}。`,
    };
  });

  app.post('/reports/reference-image', async (request, reply) => {
    const file = await request.file();
    const groupKey = String((request.query as { groupKey?: string })?.groupKey || '').trim();

    if (!groupKey) {
      return reply.code(400).send({ error: 'groupKey is required' });
    }

    if (!file) {
      return reply.code(400).send({ error: 'sample file is required' });
    }

    const uploaded = await uploadReportReferenceImage(groupKey, file);
    return {
      status: 'uploaded',
      item: uploaded,
      message: `已上传参考样例 ${uploaded.originalName}。`,
    };
  });
}
