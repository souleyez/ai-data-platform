import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { loadDocumentCategoryConfig, saveDocumentCategoryConfig, type BizCategory, type ProjectCustomCategory } from '../lib/document-config.js';
import { buildDocumentId, DEFAULT_SCAN_DIR, loadParsedDocuments, mergeParsedDocumentsForPaths } from '../lib/document-store.js';
import { buildPreviewItemFromDocument } from '../lib/ingest-feedback.js';
import { saveDocumentOverride } from '../lib/document-overrides.js';

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || `upload-${Date.now()}`;
}

export async function registerDocumentRoutes(app: FastifyInstance) {
  app.get('/documents/config', async () => {
    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    return {
      mode: 'read-only',
      config,
    };
  });

  app.post('/documents/config', async (request) => {
    const body = (request.body || {}) as { categories?: Record<string, { label?: string; folders?: string[] | string }> };
    const categories = Object.fromEntries(
      Object.entries(body.categories || {}).map(([key, value]) => [
        key,
        {
          label: value.label || key,
          folders: Array.isArray(value.folders)
            ? value.folders.map((item) => String(item).trim()).filter(Boolean)
            : String(value.folders || '').split(/[,\n]/).map((item) => item.trim()).filter(Boolean),
        },
      ]),
    );

    const config = await saveDocumentCategoryConfig(DEFAULT_SCAN_DIR, { categories: categories as any });
    const { exists, files } = await loadParsedDocuments(200, true);
    return {
      status: 'saved',
      mode: 'read-only',
      config,
      rescanned: true,
      totalFiles: files.length,
      message: exists
        ? '分类目录配置已保存，并已自动重扫文档。'
        : '分类目录配置已保存，但扫描目录当前不存在。',
    };
  });

  app.get('/documents', async () => {
    const { exists, files, items, cacheHit } = await loadParsedDocuments();

    const byExtension = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.ext] = (acc[item.ext] || 0) + 1;
      return acc;
    }, {});

    const byCategory = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {});

    const byBizCategory = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.bizCategory] = (acc[item.bizCategory] || 0) + 1;
      return acc;
    }, {});

    const byStatus = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.parseStatus] = (acc[item.parseStatus] || 0) + 1;
      return acc;
    }, {});

    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);

    return {
      mode: 'read-only',
      scanRoot: DEFAULT_SCAN_DIR,
      exists,
      totalFiles: files.length,
      byExtension,
      byCategory,
      byBizCategory,
      byStatus,
      items: items.map((item) => ({ ...item, id: buildDocumentId(item.path) })),
      capabilities: ['scan', 'summarize', 'classify'],
      cacheHit,
      lastScanAt: new Date().toISOString(),
      config,
      meta: {
        parsed: byStatus.parsed || 0,
        unsupported: byStatus.unsupported || 0,
        error: byStatus.error || 0,
        bizCategories: byBizCategory,
      },
    };
  });

  app.get('/documents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { items } = await loadParsedDocuments();
    const found = items.find((item) => buildDocumentId(item.path) === id);

    if (!found) {
      return reply.code(404).send({ error: 'document not found' });
    }

    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const matchedFolders = Object.entries(config.categories)
      .filter(([, value]) => value.folders.some((folder) => folder && found.path.toLowerCase().includes(folder.toLowerCase())))
      .map(([key, value]) => ({ key, label: value.label, folders: value.folders }));

    return {
      mode: 'read-only',
      item: {
        ...found,
        id,
      },
      meta: {
        category: found.category,
        bizCategory: found.bizCategory,
        parseStatus: found.parseStatus,
        matchedFolders,
      },
    };
  });

  app.post('/documents/scan', async () => {
    const { exists, files } = await loadParsedDocuments(200, true);

    return {
      status: exists ? 'completed' : 'missing-directory',
      mode: 'read-only',
      scanRoot: DEFAULT_SCAN_DIR,
      totalFiles: files.length,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      message: exists
        ? '文档扫描任务已完成，并已进行第一版文本提取（txt / md / pdf）。'
        : '扫描目录不存在，请先创建目录或配置 DOCUMENT_SCAN_DIR。',
    };
  });

  app.post('/documents/classify', async (request, reply) => {
    const body = (request.body || {}) as { items?: Array<{ id?: string; bizCategory?: BizCategory }> };
    const updates = Array.isArray(body.items) ? body.items : [];

    if (!updates.length) {
      return reply.code(400).send({ error: 'classification items are required' });
    }

    const validCategories: BizCategory[] = ['paper', 'contract', 'daily', 'invoice', 'order', 'service', 'inventory'];
    const { items } = await loadParsedDocuments(200, false);
    const byId = new Map(items.map((item) => [buildDocumentId(item.path), item]));

    const results = [] as Array<{ id: string; bizCategory: BizCategory; sourceName: string; confirmedAt: string }>;

    for (const update of updates) {
      const found = update.id ? byId.get(update.id) : null;
      if (!found || !update.bizCategory || !validCategories.includes(update.bizCategory)) continue;
      const saved = await saveDocumentOverride(found.path, { bizCategory: update.bizCategory });
      results.push({
        id: update.id as string,
        bizCategory: update.bizCategory,
        sourceName: found.name,
        confirmedAt: saved.confirmedAt,
      });
    }

    const ingestItems = results.reduce<ReturnType<typeof buildPreviewItemFromDocument>[]>((acc, result) => {
      const found = byId.get(result.id);
      if (!found) return acc;
      acc.push(buildPreviewItemFromDocument({
        ...found,
        confirmedBizCategory: result.bizCategory,
        categoryConfirmedAt: result.confirmedAt,
      }, 'file'));
      return acc;
    }, []);

    return {
      status: 'confirmed',
      updatedCount: ingestItems.length,
      message: ingestItems.length
        ? `已确认 ${ingestItems.length} 项分类。`
        : '没有可更新的分类项。',
      ingestItems,
    };
  });

  app.post('/documents/category-suggestions', async (request, reply) => {
    const body = (request.body || {}) as { items?: Array<{ id?: string; suggestedName?: string; parentCategoryKey?: BizCategory }> };
    const updates = Array.isArray(body.items) ? body.items : [];

    if (!updates.length) {
      return reply.code(400).send({ error: 'category suggestion items are required' });
    }

    const { items } = await loadParsedDocuments(200, false);
    const byId = new Map(items.map((item) => [buildDocumentId(item.path), item]));
    const currentConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const customCategories = [...(currentConfig.customCategories || [])];
    const accepted = [] as ProjectCustomCategory[];

    for (const update of updates) {
      const found = update.id ? byId.get(update.id) : null;
      const suggestedName = String(update.suggestedName || '').trim();
      const parentCategoryKey = update.parentCategoryKey || found?.bizCategory || 'other';
      if (!found || !suggestedName) continue;

      const key = suggestedName.toLowerCase().replace(/\s+/g, '-');
      const exists = customCategories.find((item) => item.key === key || item.label === suggestedName);
      if (exists) {
        accepted.push(exists);
        continue;
      }

      const created = {
        key,
        label: suggestedName,
        parent: parentCategoryKey,
        keywords: [suggestedName, ...(found.topicTags || []).slice(0, 3)],
        createdAt: new Date().toISOString(),
      } as ProjectCustomCategory;
      customCategories.push(created);
      accepted.push(created);
    }

    const config = await saveDocumentCategoryConfig(DEFAULT_SCAN_DIR, { customCategories });
    return {
      status: 'accepted',
      message: accepted.length ? `已接纳 ${accepted.length} 条新增分类建议。` : '没有可接纳的分类建议。',
      accepted,
      config,
    };
  });

  app.post('/documents/groups', async (request, reply) => {
    const body = (request.body || {}) as { items?: Array<{ id?: string; groups?: string[] }> };
    const updates = Array.isArray(body.items) ? body.items : [];

    if (!updates.length) {
      return reply.code(400).send({ error: 'group items are required' });
    }

    const { items } = await loadParsedDocuments(200, false);
    const byId = new Map(items.map((item) => [buildDocumentId(item.path), item]));
    const results = [] as Array<{ id: string; groups: string[]; confirmedAt: string }>;

    for (const update of updates) {
      const found = update.id ? byId.get(update.id) : null;
      if (!found) continue;
      const saved = await saveDocumentOverride(found.path, { groups: update.groups || [] });
      results.push({ id: update.id as string, groups: saved.groups || [], confirmedAt: saved.confirmedAt });
    }

    const ingestItems = results.reduce<ReturnType<typeof buildPreviewItemFromDocument>[]>((acc, result) => {
      const found = byId.get(result.id);
      if (!found) return acc;
      acc.push(buildPreviewItemFromDocument({
        ...found,
        confirmedGroups: result.groups,
        categoryConfirmedAt: result.confirmedAt,
      }, 'file'));
      return acc;
    }, []);

    return {
      status: 'confirmed',
      updatedCount: ingestItems.length,
      message: ingestItems.length ? `已确认 ${ingestItems.length} 项分组。` : '没有可更新的分组项。',
      ingestItems,
    };
  });

  app.post('/documents/upload', async (request, reply) => {
    const parts = request.parts();
    const uploadDir = path.join(DEFAULT_SCAN_DIR, 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });

    const savedFiles: Array<{ name: string; path: string; bytes: number; mimeType?: string }> = [];
    let note = '';

    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'note') note = String(part.value || '').trim();
        continue;
      }

      const fileName = sanitizeFileName(part.filename || 'upload.bin');
      const targetPath = path.join(uploadDir, `${Date.now()}-${fileName}`);
      await pipeline(part.file, createWriteStream(targetPath));
      const stat = await fs.stat(targetPath);
      savedFiles.push({
        name: fileName,
        path: targetPath,
        bytes: stat.size,
        mimeType: part.mimetype,
      });
    }

    if (!savedFiles.length) {
      return reply.code(400).send({ error: 'no files uploaded' });
    }

    const { files, items } = await mergeParsedDocumentsForPaths(savedFiles.map((file) => file.path), 200);
    const itemMap = new Map(items.map((item) => [item.path, item]));
    const ingestItems = savedFiles.map((file) => {
      const parsed = itemMap.get(file.path);
      if (!parsed) {
        return {
          id: Buffer.from(file.path).toString('base64url'),
          sourceType: 'file' as const,
          sourceName: file.name,
          status: 'failed' as const,
          errorMessage: '文件已保存，但本次自动重扫后未找到对应解析结果。',
        };
      }
      return buildPreviewItemFromDocument(parsed, 'file', file.name);
    });

    return {
      status: 'uploaded',
      mode: 'read-only',
      scanRoot: DEFAULT_SCAN_DIR,
      uploadDir,
      note,
      uploadedCount: savedFiles.length,
      uploadedFiles: savedFiles,
      totalFiles: files.length,
      message: `已成功接收 ${savedFiles.length} 个文件，并完成自动解析与索引更新。`,
      summary: {
        total: ingestItems.length,
        successCount: ingestItems.filter((item) => item.status === 'success').length,
        failedCount: ingestItems.filter((item) => item.status === 'failed').length,
      },
      ingestItems,
    };
  });
}
