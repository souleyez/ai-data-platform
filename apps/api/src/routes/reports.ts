import { createReadStream } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import {
  addSharedTemplateReferenceLink,
  createSharedReportTemplate,
  createReportOutput,
  deleteReportOutput,
  deleteSharedReportTemplate,
  deleteSharedTemplateReference,
  loadReportCenterState,
  readSharedTemplateReferenceFile,
  reviseReportOutput,
  updateSharedReportTemplate,
  updateReportGroupTemplate,
  uploadSharedTemplateReference,
  uploadReportReferenceImage,
} from '../lib/report-center.js';

export async function registerReportRoutes(app: FastifyInstance) {
  app.get('/reports', async () => {
    const state = await loadReportCenterState();

    return {
      mode: 'read-only',
      total: state.templates.length + state.outputs.length,
      groups: state.groups,
      templates: state.templates,
      outputRecords: state.outputs,
      meta: {
        groups: state.groups.length,
        templates: state.templates.length,
        outputs: state.outputs.length,
        referenceImages:
          state.groups.reduce((acc, group) => acc + group.referenceImages.length, 0)
          + state.templates.reduce((acc, template) => acc + (template.referenceImages?.length || 0), 0),
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
      message: `已生成 ${record.groupLabel} 的 ${record.templateLabel} 报表。`,
    };
  });

  app.post('/reports/chat-output', async (request, reply) => {
    const body = (request.body || {}) as {
      groupKey?: string;
      templateKey?: string;
      title?: string;
      kind?: 'table' | 'page' | 'ppt' | 'pdf' | 'doc' | 'md';
      format?: string;
      content?: string;
      table?: {
        columns?: string[];
        rows?: Array<Array<string | number | null>>;
        title?: string;
      } | null;
      page?: {
        summary?: string;
        cards?: Array<{ label?: string; value?: string; note?: string }>;
        sections?: Array<{ title?: string; body?: string; bullets?: string[] }>;
        charts?: Array<{
          title?: string;
          items?: Array<{ label?: string; value?: number }>;
          render?: {
            renderer?: string;
            chartType?: string;
            svg?: string;
            alt?: string;
            generatedAt?: string;
          } | null;
        }>;
      } | null;
      libraries?: Array<{ key?: string; label?: string }>;
      downloadUrl?: string;
      dynamicSource?: {
        enabled?: boolean;
        request?: string;
        outputType?: 'table' | 'page' | 'ppt' | 'pdf' | 'doc' | 'md';
        templateKey?: string;
        templateLabel?: string;
        timeRange?: string;
        contentFocus?: string;
        libraries?: Array<{ key?: string; label?: string }>;
      } | null;
    };

    const groupKey = String(body.groupKey || '').trim();
    if (!groupKey) {
      return reply.code(400).send({ error: 'groupKey is required' });
    }

    const record = await createReportOutput({
      groupKey,
      templateKey: body.templateKey,
      title: body.title,
      triggerSource: 'chat',
      kind: body.kind,
      format: body.format,
      content: body.content,
      table: body.table,
      page: body.page,
      libraries: Array.isArray(body.libraries) ? body.libraries : [],
      downloadUrl: body.downloadUrl,
      dynamicSource: body.dynamicSource || null,
    });

    return {
      status: 'saved',
      item: record,
      message: `已保存 ${record.title}`,
    };
  });

  app.delete('/reports/output/:id', async (request, reply) => {
    const id = String((request.params as { id?: string })?.id || '').trim();
    if (!id) {
      return reply.code(400).send({ error: 'id is required' });
    }

    await deleteReportOutput(id);
    return {
      status: 'deleted',
      id,
      message: '已删除报表。',
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
      message: `已将 ${result.group.label} 的默认模板切换为 ${result.template.label}。`,
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
      message: `已上传参考文件 ${uploaded.originalName}。`,
    };
  });

  app.post('/reports/template', async (request, reply) => {
    const body = (request.body || {}) as {
      label?: string;
      type?: 'table' | 'static-page' | 'ppt' | 'document';
      sourceType?: 'word' | 'ppt' | 'spreadsheet' | 'image' | 'web-link' | 'other';
      description?: string;
      isDefault?: boolean;
    };

    const item = await createSharedReportTemplate({
      label: String(body.label || '').trim(),
      type: body.type,
      sourceType: body.sourceType,
      description: body.description,
      isDefault: Boolean(body.isDefault),
    });
    return {
      status: 'created',
      item,
      message: `已新增模板 ${item.label}`,
    };
  });

  app.patch('/reports/template/:key', async (request, reply) => {
    const key = String((request.params as { key?: string })?.key || '').trim();
    if (!key) return reply.code(400).send({ error: 'key is required' });
    const body = (request.body || {}) as {
      label?: string;
      description?: string;
      isDefault?: boolean;
    };
    const item = await updateSharedReportTemplate(key, body);
    return {
      status: 'updated',
      item,
      message: `已更新模板 ${item.label}`,
    };
  });

  app.delete('/reports/template/:key', async (request, reply) => {
    const key = String((request.params as { key?: string })?.key || '').trim();
    if (!key) return reply.code(400).send({ error: 'key is required' });

    const item = await deleteSharedReportTemplate(key);
    return {
      status: 'deleted',
      item,
      message: `宸插垹闄ゆā鏉?${item.label}`,
    };
  });

  app.post('/reports/template-reference', async (request, reply) => {
    const file = await request.file();
    const templateKey = String((request.query as { templateKey?: string })?.templateKey || '').trim();
    if (!templateKey) return reply.code(400).send({ error: 'templateKey is required' });
    if (!file) return reply.code(400).send({ error: 'sample file is required' });

    const item = await uploadSharedTemplateReference(templateKey, file);
    return {
      status: 'uploaded',
      item,
      message: `已上传模板参考文件 ${item.originalName}`,
    };
  });

  app.post('/reports/template-reference-link', async (request, reply) => {
    const body = (request.body || {}) as {
      templateKey?: string;
      url?: string;
      label?: string;
    };
    const templateKey = String(body.templateKey || '').trim();
    const url = String(body.url || '').trim();
    if (!templateKey) return reply.code(400).send({ error: 'templateKey is required' });
    if (!url) return reply.code(400).send({ error: 'url is required' });

    const item = await addSharedTemplateReferenceLink(templateKey, {
      url,
      label: body.label,
    });
    return {
      status: 'uploaded',
      item,
      message: `宸蹭笂浼犳ā鏉跨綉椤甸摼鎺?${item.url || item.originalName}`,
    };
  });

  app.delete('/reports/template-reference/:id', async (request, reply) => {
    const id = String((request.params as { id?: string })?.id || '').trim();
    const templateKey = String((request.query as { templateKey?: string })?.templateKey || '').trim();
    if (!id) return reply.code(400).send({ error: 'id is required' });
    if (!templateKey) return reply.code(400).send({ error: 'templateKey is required' });

    const item = await deleteSharedTemplateReference(templateKey, id);
    return {
      status: 'deleted',
      item,
      message: `宸插垹闄ゅ弬鑰冨唴瀹?${item.originalName || item.url || item.id}`,
    };
  });

  app.get('/reports/template-reference/:id/download', async (request, reply) => {
    const id = String((request.params as { id?: string })?.id || '').trim();
    const templateKey = String((request.query as { templateKey?: string })?.templateKey || '').trim();
    if (!id) return reply.code(400).send({ error: 'id is required' });
    if (!templateKey) return reply.code(400).send({ error: 'templateKey is required' });

    const { reference, absolutePath } = await readSharedTemplateReferenceFile(templateKey, id);
    const downloadName = encodeURIComponent(reference.originalName || reference.fileName || 'template-reference');
    reply.header('Content-Type', reference.mimeType || 'application/octet-stream');
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${downloadName}`);
    reply.header('Cache-Control', 'no-store');
    return reply.send(createReadStream(absolutePath));
  });

  app.post('/reports/output/:id/revise', async (request, reply) => {
    const id = String((request.params as { id?: string })?.id || '').trim();
    const instruction = String(((request.body || {}) as { instruction?: string }).instruction || '').trim();
    if (!id) return reply.code(400).send({ error: 'id is required' });
    if (!instruction) return reply.code(400).send({ error: 'instruction is required' });

    const item = await reviseReportOutput(id, instruction);
    return {
      status: 'revised',
      item,
      message: `已按要求更新 ${item.title}`,
    };
  });
}
