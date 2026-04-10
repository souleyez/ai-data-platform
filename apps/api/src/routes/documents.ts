import { createReadStream } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { loadDocumentVectorIndexMeta } from '../lib/document-vector-index.js';
import {
  acceptDocumentSuggestions,
  createManagedDocumentLibrary,
  deleteManagedDocumentLibrary,
  updateManagedDocumentLibrary,
  saveConfirmedDocumentGroups,
  saveIgnoredDocuments,
  clearDocumentAnalysisFeedback,
  updateDocumentAnalysisResult,
} from '../lib/document-route-services.js';
import {
  buildAttachmentDisposition as buildDocumentAttachmentDisposition,
  IMAGE_CONTENT_TYPES as DOCUMENT_IMAGE_CONTENT_TYPES,
  PREVIEW_CONTENT_TYPES as DOCUMENT_PREVIEW_CONTENT_TYPES,
} from '../lib/document-route-files.js';
import {
  loadDocumentsIndexRoutePayload,
  loadDocumentsOverviewRoutePayload,
  loadDocumentLibrariesPayload,
  runDocumentDeepParseAction,
  runDocumentOrganizeAction,
  runDocumentReparseAction,
  runDocumentUploadAction,
  runDocumentVectorRebuildAction,
  runReclusterUngroupedAction,
} from '../lib/document-route-operations.js';
import {
  loadDocumentDetailPayload,
  loadReadableDocumentAsset,
} from '../lib/document-route-detail-loaders.js';

export async function registerDocumentRoutes(app: FastifyInstance) {
  app.get('/documents', async () => {
    return loadDocumentsIndexRoutePayload();
  });

  app.get('/documents/detail', async (request, reply) => {
    const { id } = (request.query || {}) as { id?: string };
    if (!id) {
      return reply.code(400).send({ error: 'id is required' });
    }

    const payload = await loadDocumentDetailPayload(id, { includeSourceAvailability: true });
    if (!payload) {
      return reply.code(404).send({ error: 'document not found' });
    }
    return payload;
  });

  app.get('/documents/file', async (request, reply) => {
    const { id } = (request.query || {}) as { id?: string };
    if (!id) {
      return reply.code(400).send({ error: 'id is required' });
    }

    const asset = await loadReadableDocumentAsset(id);
    if (!asset) {
      return reply.code(404).send({ error: 'document not found' });
    }

    const contentType = DOCUMENT_IMAGE_CONTENT_TYPES[String(asset.item.ext || '').toLowerCase()];
    if (!contentType) {
      return reply.code(400).send({ error: 'inline preview is not supported for this document type' });
    }

    if (!asset.readablePath) {
      return reply.code(404).send({ error: 'document source file is not available on this server' });
    }
    reply.header('Cache-Control', 'private, max-age=60');
    reply.type(contentType);
    return reply.send(createReadStream(asset.readablePath));
  });

  app.get('/documents/preview', async (request, reply) => {
    const { id } = (request.query || {}) as { id?: string };
    if (!id) {
      return reply.code(400).send({ error: 'id is required' });
    }

    const asset = await loadReadableDocumentAsset(id);
    if (!asset) {
      return reply.code(404).send({ error: 'document not found' });
    }

    const contentType = DOCUMENT_PREVIEW_CONTENT_TYPES[String(asset.item.ext || '').toLowerCase()];
    if (!contentType) {
      return reply.code(400).send({ error: 'inline preview is not supported for this document type' });
    }

    if (!asset.readablePath) {
      return reply.code(404).send({ error: 'document source file is not available on this server' });
    }
    reply.header('Cache-Control', 'private, max-age=60');
    reply.header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(asset.fileName)}`);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.type(contentType);
    return reply.send(createReadStream(asset.readablePath));
  });

  app.get('/documents/download', async (request, reply) => {
    const { id } = (request.query || {}) as { id?: string };
    if (!id) {
      return reply.code(400).send({ error: 'id is required' });
    }

    const asset = await loadReadableDocumentAsset(id);
    if (!asset) {
      return reply.code(404).send({ error: 'document not found' });
    }

    if (!asset.readablePath) {
      return reply.code(404).send({ error: 'document source file is not available on this server' });
    }
    const contentType = DOCUMENT_IMAGE_CONTENT_TYPES[String(asset.item.ext || '').toLowerCase()] || 'application/octet-stream';

    reply.header('Cache-Control', 'private, max-age=60');
    reply.header('Content-Disposition', buildDocumentAttachmentDisposition(asset.fileName));
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.type(contentType);
    return reply.send(createReadStream(asset.readablePath));
  });

  app.get('/documents-overview', async () => {
    return loadDocumentsOverviewRoutePayload();
  });

  app.get('/documents/libraries', async () => {
    return loadDocumentLibrariesPayload();
  });

  app.post('/documents/libraries', async (request, reply) => {
    const body = (request.body || {}) as { name?: string; description?: string; permissionLevel?: number };
    const name = String(body.name || '').trim();

    if (!name) {
      return reply.code(400).send({ error: 'library name is required' });
    }

    let library;
    let libraries;
    try {
      ({ library, libraries } = await createManagedDocumentLibrary({
        name,
        description: body.description,
        permissionLevel: body.permissionLevel,
      }));
    } catch (error) {
      if (error instanceof Error && error.message === 'library already exists') {
        return reply.code(409).send({ error: 'library already exists', message: '知识库分组名称已存在' });
      }
      throw error;
    }

    return {
      status: 'created',
      message: `已新增知识库分组“${library.label}”。`,
      item: library,
      items: libraries,
    };
  });

  app.patch('/documents/libraries/:key', async (request, reply) => {
    const { key } = request.params as { key: string };
    const body = (request.body || {}) as {
      label?: string;
      description?: string;
      permissionLevel?: number;
      knowledgePagesEnabled?: boolean;
      knowledgePagesMode?: 'none' | 'overview' | 'topics';
      extractionFieldSet?: string;
      extractionFallbackSchemaType?: string;
      extractionPreferredFieldKeys?: string[];
      extractionRequiredFieldKeys?: string[];
      extractionFieldAliases?: Record<string, string>;
      extractionFieldPrompts?: Record<string, string>;
      extractionFieldNormalizationRules?: Record<string, string[] | string>;
      extractionFieldConflictStrategies?: Record<string, string>;
    };

    try {
      const { library, libraries } = await updateManagedDocumentLibrary(key, {
        label: body.label,
        description: body.description,
        permissionLevel: body.permissionLevel,
        knowledgePagesEnabled: body.knowledgePagesEnabled,
        knowledgePagesMode: body.knowledgePagesMode,
        extractionFieldSet: body.extractionFieldSet,
        extractionFallbackSchemaType: body.extractionFallbackSchemaType,
        extractionPreferredFieldKeys: body.extractionPreferredFieldKeys,
        extractionRequiredFieldKeys: body.extractionRequiredFieldKeys,
        extractionFieldAliases: body.extractionFieldAliases,
        extractionFieldPrompts: body.extractionFieldPrompts,
        extractionFieldNormalizationRules: body.extractionFieldNormalizationRules,
        extractionFieldConflictStrategies: body.extractionFieldConflictStrategies,
      });
      return {
        status: 'updated',
        message: `已更新知识库“${library.label}”的访问级别。`,
        item: library,
        items: libraries,
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'library not found') {
        return reply.code(404).send({ error: 'library not found' });
      }
      if (error instanceof Error && error.message === 'library already exists') {
        return reply.code(409).send({ error: 'library already exists', message: '知识库名称已存在' });
      }
      if (error instanceof Error && error.message === 'library name is required') {
        return reply.code(400).send({ error: 'library name is required' });
      }
      throw error;
    }
  });

  app.delete('/documents/libraries/:key', async (request, reply) => {
    const { key } = request.params as { key: string };
    let found;
    let nextLibraries;
    try {
      ({ deleted: found, libraries: nextLibraries } = await deleteManagedDocumentLibrary(key));
    } catch (error) {
      if (error instanceof Error && error.message === 'library not found') {
        return reply.code(404).send({ error: 'library not found' });
      }
      if (error instanceof Error && error.message === 'reserved library cannot be deleted') {
        return reply.code(400).send({ error: 'reserved library cannot be deleted', message: '系统保留分组不可删除' });
      }
      throw error;
    }

    return {
      status: 'deleted',
      message: `已删除知识库分组“${found.label}”，文档仍保留，仅移除了分组关联。`,
      items: nextLibraries,
    };
  });

  app.post('/documents/organize', async () => {
    const { organizedCount, ungroupedCount, scanRoot, scanRoots } = await runDocumentOrganizeAction();

    return {
      status: 'completed',
      mode: 'read-only',
      organizedCount,
      ungroupedCount,
      scanRoot,
      scanRoots,
      message: `已按知识库分组规则完成自动整理，共更新 ${organizedCount} 条文档归类。`,
    };
  });

  app.post('/documents/recluster-ungrouped', async () => {
    const { processedCount, suggestedCount, createdLibraryCount } = await runReclusterUngroupedAction();

    return {
      status: 'completed',
      mode: 'read-only',
      processedCount,
      suggestedCount,
      createdLibraryCount,
      message: `已扫描 ${processedCount} 条未分组文档，更新建议 ${suggestedCount} 条，自动新建分组 ${createdLibraryCount} 个。`,
    };
  });

  app.post('/documents/groups/accept-suggestions', async (request, reply) => {
    const body = (request.body || {}) as { items?: Array<{ id?: string }> };
    const updates = Array.isArray(body.items) ? body.items : [];

    if (!updates.length) {
      return reply.code(400).send({ error: 'suggestion items are required' });
    }

    const results = await acceptDocumentSuggestions(updates);
    return {
      status: 'accepted',
      updatedCount: results.length,
      message: `已接受 ${results.length} 条建议分组。`,
    };
  });

  app.post('/documents/groups', async (request, reply) => {
    const body = (request.body || {}) as { items?: Array<{ id?: string; groups?: string[] }> };
    const updates = Array.isArray(body.items) ? body.items : [];

    if (!updates.length) {
      return reply.code(400).send({ error: 'group items are required' });
    }

    const { ingestItems } = await saveConfirmedDocumentGroups(updates);
    return {
      status: 'confirmed',
      updatedCount: ingestItems.length,
      message: ingestItems.length
        ? `已确认 ${ingestItems.length} 项分组。`
        : '没有可更新的分组项。',
      ingestItems,
    };
  });

  app.post('/documents/ignore', async (request, reply) => {
    const body = (request.body || {}) as { items?: Array<{ id?: string; ignored?: boolean }> };
    const updates = Array.isArray(body.items) ? body.items : [];

    if (!updates.length) {
      return reply.code(400).send({ error: 'ignore items are required' });
    }

    const results = await saveIgnoredDocuments(updates);
    return {
      status: 'saved',
      updatedCount: results.length,
      items: results,
      message: `已删除 ${results.length} 条文档索引。`,
    };
  });

  app.post('/documents/upload', async (request, reply) => {
    const result = await runDocumentUploadAction(request.parts());
    if ('error' in result) {
      return reply.code(400).send({ error: result.error });
    }

    return {
      status: 'uploaded',
      mode: 'read-only',
      scanRoot: result.config.scanRoot,
      scanRoots: result.config.scanRoots,
      uploadDir: result.uploadDir,
      note: result.note,
      uploadedCount: result.savedFiles.length,
      uploadedFiles: result.savedFiles,
      totalFiles: result.savedFiles.length,
      confirmedLibraryKeys: result.ingestResult.confirmedLibraryKeys,
      message: `已成功接收 ${result.savedFiles.length} 个文件，并完成快速解析与索引更新；未分组文档可在后续详细解析后再次归组。`,
      summary: result.ingestResult.summary,
      ingestItems: result.ingestResult.ingestItems,
    };
  });

  app.post('/documents/deep-parse/run', async (request) => {
    const body = (request.body || {}) as { limit?: number };
    const result = await runDocumentDeepParseAction(body.limit);

    return {
      status: 'completed',
      mode: 'read-only',
      ...result,
      message: `已处理 ${result.processedCount} 条详细解析任务，成功 ${result.succeededCount} 条，失败 ${result.failedCount} 条。`,
    };
  });

  app.post('/documents/reparse', async (request, reply) => {
    const body = (request.body || {}) as { items?: Array<{ id?: string }> };
    const ids = Array.isArray(body.items) ? body.items.map((item) => String(item?.id || '').trim()).filter(Boolean) : [];

    if (!ids.length) {
      return reply.code(400).send({ error: 'reparse items are required' });
    }

    const result = await runDocumentReparseAction(ids);
    return {
      status: 'completed',
      matchedCount: result.matchedCount,
      succeededCount: result.succeededCount,
      failedCount: result.failedCount,
      missingIds: result.missingIds,
      message: `已重新解析 ${result.matchedCount} 条文档，成功 ${result.succeededCount} 条，失败 ${result.failedCount} 条。`,
    };
  });

  app.get('/documents/vector-index/meta', async () => {
    const meta = await loadDocumentVectorIndexMeta();
    return {
      mode: 'read-only',
      ...meta,
    };
  });

  app.post('/documents/vector-index/rebuild', async () => {
    const result = await runDocumentVectorRebuildAction();

    return {
      status: 'completed',
      mode: 'read-only',
      ...result,
      message: `已重建向量化候选索引，覆盖 ${result.documentCount} 份详细解析文档，共生成 ${result.recordCount} 条向量记录。`,
    };
  });

  app.get('/documents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const payload = await loadDocumentDetailPayload(id);
    if (!payload) {
      return reply.code(404).send({ error: 'document not found' });
    }
    return payload;
  });

  app.patch('/documents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as {
      summary?: unknown;
      structuredProfile?: unknown;
      evidenceChunks?: unknown;
    };

    try {
      const result = await updateDocumentAnalysisResult(id, body);
      return {
        status: 'updated',
        item: result.item,
        feedbackSnapshot: result.feedbackSnapshot,
        libraryKnowledge: result.libraryKnowledge,
        message: '已更新解析结果并同步到知识记忆',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'document update failed';
      const code = message === 'document not found' ? 404 : 400;
      return reply.code(code).send({ error: message });
    }
  });

  app.post('/documents/:id/parse-feedback/clear', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { fieldName?: unknown };

    try {
      const result = await clearDocumentAnalysisFeedback(id, body);
      return {
        status: result.changed ? 'cleared' : 'unchanged',
        feedbackSnapshot: result.snapshot,
        clearedFieldCount: result.clearedFieldCount,
        clearedLibraryCount: result.clearedLibraryCount,
        message: result.changed
          ? '已清理解析反馈并同步更新。'
          : '当前没有可清理的解析反馈。',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'document feedback clear failed';
      const code = message === 'document not found' ? 404 : 400;
      return reply.code(code).send({ error: message });
    }
  });
}
