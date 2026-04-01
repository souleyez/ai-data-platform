import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import {
  loadDocumentCategoryConfig,
  saveDocumentCategoryConfig,
  type BizCategory,
  type ProjectCustomCategory,
} from '../lib/document-config.js';
import { parseDocument } from '../lib/document-parser.js';
import {
  createDocumentLibrary,
  deleteDocumentLibrary,
  documentMatchesLibrary,
  loadDocumentLibraries,
} from '../lib/document-libraries.js';
import {
  buildDocumentId,
  DEFAULT_SCAN_DIR,
  loadParsedDocuments,
  mergeParsedDocumentsForPaths,
  upsertDocumentsInCache,
} from '../lib/document-store.js';
import { enqueueDetailedParse, runDetailedParseBatch } from '../lib/document-deep-parse-queue.js';
import { loadDocumentVectorIndexMeta, rebuildDocumentVectorIndex } from '../lib/document-vector-index.js';
import {
  buildPreviewItemFromDocument,
  resolveSuggestedLibraryKeys,
} from '../lib/ingest-feedback.js';
import { saveDocumentOverride } from '../lib/document-overrides.js';
import {
  ingestLocalFilesIntoLibrary,
  ingestUploadedFiles,
  saveMultipartFiles,
} from '../lib/document-upload-ingest.js';
import {
  acceptDocumentSuggestions,
  addDocumentScanSource,
  autoAssignSuggestedLibraries,
  buildNextScanRoots,
  discoverCandidateDirectories,
  importCandidateScanSources,
  reclusterUngroupedDocuments,
  removeDocumentScanSource,
  saveConfirmedDocumentGroups,
  saveIgnoredDocuments,
  setPrimaryDocumentScanSource,
} from '../lib/document-route-services.js';

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || `upload-${Date.now()}`;
}

function truncateText(value: unknown, maxLength: number) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function toListItem<T extends Record<string, unknown>>(item: T) {
  const source = item as T & {
    id?: string;
    path?: string;
    name?: string;
    ext?: string;
    title?: string;
    category?: string;
    bizCategory?: string;
    confirmedBizCategory?: string;
    parseStatus?: string;
    parseMethod?: string;
    summary?: string;
    excerpt?: string;
    topicTags?: string[];
    groups?: string[];
    confirmedGroups?: string[];
    suggestedGroups?: string[];
    ignored?: boolean;
    retentionStatus?: string;
    riskLevel?: string;
    parseStage?: string;
    schemaType?: string;
    structuredProfile?: Record<string, unknown>;
    categoryConfirmedAt?: string;
    retainedAt?: string;
    originalDeletedAt?: string;
    detailParseStatus?: string;
    detailParseQueuedAt?: string;
    detailParsedAt?: string;
    detailParseAttempts?: number;
    detailParseError?: string;
  };

  return {
    id: source.id,
    path: source.path,
    name: source.name,
    ext: source.ext,
    title: source.title,
    category: source.category,
    bizCategory: source.bizCategory,
    confirmedBizCategory: source.confirmedBizCategory,
    parseStatus: source.parseStatus,
    parseMethod: source.parseMethod,
    summary: truncateText(source.summary, 220),
    excerpt: truncateText(source.excerpt, 280),
    topicTags: (source.topicTags || []).slice(0, 8),
    groups: source.groups || [],
    confirmedGroups: source.confirmedGroups || [],
    suggestedGroups: source.suggestedGroups || [],
    ignored: Boolean(source.ignored),
    retentionStatus: source.retentionStatus,
    riskLevel: source.riskLevel,
    parseStage: source.parseStage,
    schemaType: source.schemaType,
    structuredProfile: source.structuredProfile,
    categoryConfirmedAt: source.categoryConfirmedAt,
    retainedAt: source.retainedAt,
    originalDeletedAt: source.originalDeletedAt,
    detailParseStatus: source.detailParseStatus,
    detailParseQueuedAt: source.detailParseQueuedAt,
    detailParsedAt: source.detailParsedAt,
    detailParseAttempts: source.detailParseAttempts,
    detailParseError: source.detailParseError,
  };
}

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

const PREVIEW_CONTENT_TYPES: Record<string, string> = {
  ...IMAGE_CONTENT_TYPES,
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.csv': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function extractDocumentTimestamp(item: { name?: string; path?: string }) {
  const text = `${item?.name || ''} ${item?.path || ''}`;
  const match = text.match(/(\d{13})/);
  return match ? Number(match[1]) : 0;
}

function buildAttachmentDisposition(fileName: string) {
  return `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function resolveDocumentReadablePath(rawPath: string) {
  const original = String(rawPath || '').trim();
  if (!original) return original;

  const normalized = original.replace(/\\/g, '/');
  const marker = '/storage/files/';
  const markerIndex = normalized.toLowerCase().lastIndexOf(marker);
  if (markerIndex < 0) return original;

  const relative = normalized.slice(markerIndex + marker.length);
  return path.join(DEFAULT_SCAN_DIR, relative);
}

async function hasReadableDocumentSource(rawPath: string) {
  const readablePath = resolveDocumentReadablePath(rawPath);
  if (!readablePath) return false;

  try {
    await fs.access(readablePath);
    return true;
  } catch {
    return false;
  }
}

function resolveLibraryScenarioKey(
  library: { isDefault?: boolean; sourceCategoryKey?: string; key: string },
  items: Array<{ bizCategory?: string; confirmedBizCategory?: string }>,
) {
  if (library.isDefault && library.sourceCategoryKey) {
    return library.sourceCategoryKey === 'paper' ? 'paper' : library.sourceCategoryKey;
  }

  const counts = items.reduce<Record<string, number>>((acc, item) => {
    const key = item.confirmedBizCategory || item.bizCategory || 'default';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'default';
  return dominant === 'paper' ? 'paper' : dominant;
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
    const body = (request.body || {}) as {
      categories?: Record<string, { label?: string; folders?: string[] | string }>;
    };

    const categories = Object.fromEntries(
      Object.entries(body.categories || {}).map(([key, value]) => [
        key,
        {
          label: value.label || key,
          folders: Array.isArray(value.folders)
            ? value.folders.map((item) => String(item).trim()).filter(Boolean)
            : String(value.folders || '')
              .split(/[,\n]/)
              .map((item) => item.trim())
              .filter(Boolean),
        },
      ]),
    );

    const currentConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const config = await saveDocumentCategoryConfig(currentConfig.scanRoot, { categories: categories as any });
    const { exists, files } = await loadParsedDocuments(200, true, config.scanRoot);

    return {
      status: 'saved',
      mode: 'read-only',
      config,
      rescanned: true,
      totalFiles: files.length,
      message: exists
        ? '分类目录配置已保存，并自动重扫文档。'
        : '分类目录配置已保存，但当前扫描目录不存在。',
    };
  });

  app.get('/documents', async () => {
    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const { exists, files, totalFiles, items, cacheHit } = await loadParsedDocuments(200, false, config.scanRoots);
    const visibleItems = items;
    const libraries = await loadDocumentLibraries();

    const byExtension = visibleItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.ext] = (acc[item.ext] || 0) + 1;
      return acc;
    }, {});

    const byCategory = visibleItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {});

    const byBizCategory = visibleItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.bizCategory] = (acc[item.bizCategory] || 0) + 1;
      return acc;
    }, {});

    const byStatus = visibleItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.parseStatus] = (acc[item.parseStatus] || 0) + 1;
      return acc;
    }, {});

    const libraryCounts = libraries.reduce<Record<string, number>>((acc, library) => {
      acc[library.key] = visibleItems.filter((item) => documentMatchesLibrary(item, library)).length;
      return acc;
    }, {});

    return {
      mode: 'read-only',
      scanRoot: config.scanRoot,
      scanRoots: config.scanRoots,
      exists,
      totalFiles: totalFiles ?? files.length,
      byExtension,
      byCategory,
      byBizCategory,
      byStatus,
      items: visibleItems.map((item) => toListItem({ ...item, id: buildDocumentId(item.path) })),
      capabilities: ['scan', 'summarize', 'classify'],
      cacheHit,
      lastScanAt: new Date().toISOString(),
      config,
      libraries,
      meta: {
        parsed: byStatus.parsed || 0,
        unsupported: byStatus.unsupported || 0,
        error: byStatus.error || 0,
        bizCategories: byBizCategory,
        libraryCounts,
      },
    };
  });

  app.get('/documents/detail', async (request, reply) => {
    const { id } = (request.query || {}) as { id?: string };
    if (!id) {
      return reply.code(400).send({ error: 'id is required' });
    }

    const documentConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const { items } = await loadParsedDocuments(200, false, documentConfig.scanRoots);
    const found = items.find((item) => buildDocumentId(item.path) === id);

    if (!found) {
      return reply.code(404).send({ error: 'document not found' });
    }

    const detailItem = found.fullText && found.parseStage === 'detailed'
      ? found
      : await parseDocument(found.path, documentConfig, { stage: 'detailed' });
    const matchedFolders = Object.entries(documentConfig.categories)
      .filter(([, value]) => value.folders.some((folder) => folder && found.path.toLowerCase().includes(folder.toLowerCase())))
      .map(([key, value]) => ({ key, label: value.label, folders: value.folders }));

    return {
      mode: 'read-only',
      item: {
        ...detailItem,
        id,
        sourceAvailable: await hasReadableDocumentSource(found.path),
      },
      meta: {
        category: detailItem.category,
        bizCategory: detailItem.bizCategory,
        parseStatus: detailItem.parseStatus,
        matchedFolders,
      },
    };
  });

  app.get('/documents/file', async (request, reply) => {
    const { id } = (request.query || {}) as { id?: string };
    if (!id) {
      return reply.code(400).send({ error: 'id is required' });
    }

    const documentConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const { items } = await loadParsedDocuments(200, false, documentConfig.scanRoots);
    const found = items.find((item) => buildDocumentId(item.path) === id);

    if (!found) {
      return reply.code(404).send({ error: 'document not found' });
    }

    const contentType = IMAGE_CONTENT_TYPES[String(found.ext || '').toLowerCase()];
    if (!contentType) {
      return reply.code(400).send({ error: 'inline preview is not supported for this document type' });
    }

    const readablePath = resolveDocumentReadablePath(found.path);
    try {
      await fs.access(readablePath);
    } catch {
      return reply.code(404).send({ error: 'document source file is not available on this server' });
    }
    reply.header('Cache-Control', 'private, max-age=60');
    reply.type(contentType);
    return reply.send(createReadStream(readablePath));
  });

  app.get('/documents/preview', async (request, reply) => {
    const { id } = (request.query || {}) as { id?: string };
    if (!id) {
      return reply.code(400).send({ error: 'id is required' });
    }

    const documentConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const { items } = await loadParsedDocuments(200, false, documentConfig.scanRoots);
    const found = items.find((item) => buildDocumentId(item.path) === id);

    if (!found) {
      return reply.code(404).send({ error: 'document not found' });
    }

    const contentType = PREVIEW_CONTENT_TYPES[String(found.ext || '').toLowerCase()];
    if (!contentType) {
      return reply.code(400).send({ error: 'inline preview is not supported for this document type' });
    }

    const readablePath = resolveDocumentReadablePath(found.path);
    try {
      await fs.access(readablePath);
    } catch {
      return reply.code(404).send({ error: 'document source file is not available on this server' });
    }
    const fileName = sanitizeFileName(found.name || path.basename(found.path));
    reply.header('Cache-Control', 'private, max-age=60');
    reply.header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.type(contentType);
    return reply.send(createReadStream(readablePath));
  });

  app.get('/documents/download', async (request, reply) => {
    const { id } = (request.query || {}) as { id?: string };
    if (!id) {
      return reply.code(400).send({ error: 'id is required' });
    }

    const documentConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const { items } = await loadParsedDocuments(200, false, documentConfig.scanRoots);
    const found = items.find((item) => buildDocumentId(item.path) === id);

    if (!found) {
      return reply.code(404).send({ error: 'document not found' });
    }

    const readablePath = resolveDocumentReadablePath(found.path);
    try {
      await fs.access(readablePath);
    } catch {
      return reply.code(404).send({ error: 'document source file is not available on this server' });
    }
    const fileName = sanitizeFileName(found.name || path.basename(found.path));
    const contentType = IMAGE_CONTENT_TYPES[String(found.ext || '').toLowerCase()] || 'application/octet-stream';

    reply.header('Cache-Control', 'private, max-age=60');
    reply.header('Content-Disposition', buildAttachmentDisposition(fileName));
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.type(contentType);
    return reply.send(createReadStream(readablePath));
  });

  app.get('/documents/candidate-sources', async () => {
    const items = await discoverCandidateDirectories();
    return {
      mode: 'read-only',
      warning: '可能过程漫长，请谨慎选择需要入库的目录。',
      items,
    };
  });

  app.get('/documents-overview', async () => {
    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const { exists, files, totalFiles, items, cacheHit } = await loadParsedDocuments(200, false, config.scanRoots);
    const visibleItems = items;
    const libraries = await loadDocumentLibraries();

    const summarizedLibraries = libraries
      .map((library) => {
        const matchedItems = visibleItems.filter((item) => documentMatchesLibrary(item, library));
        const lastUpdatedAt = matchedItems.reduce((latest, item) => Math.max(latest, extractDocumentTimestamp(item)), 0);

        return {
          ...library,
          documentCount: matchedItems.length,
          lastUpdatedAt,
          scenarioKey: resolveLibraryScenarioKey(library, matchedItems),
        };
      })
      .sort((a, b) => {
        const countDiff = b.documentCount - a.documentCount;
        if (countDiff !== 0) return countDiff;

        const updatedDiff = b.lastUpdatedAt - a.lastUpdatedAt;
        if (updatedDiff !== 0) return updatedDiff;

        if (Boolean(b.isDefault) !== Boolean(a.isDefault)) {
          return a.isDefault ? 1 : -1;
        }

        return String(a.label || '').localeCompare(String(b.label || ''), 'zh-CN');
      });

    return {
      mode: 'read-only',
      scanRoot: config.scanRoot,
      scanRoots: config.scanRoots,
      exists,
      totalFiles: totalFiles ?? files.length,
      parsed: visibleItems.filter((item) => item.parseStatus === 'parsed').length,
      cacheHit,
      lastScanAt: new Date().toISOString(),
      libraries: summarizedLibraries,
    };
  });

  app.get('/documents/libraries', async () => {
    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const [{ items }, libraries] = await Promise.all([
      loadParsedDocuments(200, false, config.scanRoots),
      loadDocumentLibraries(),
    ]);
    const visibleItems = items;

    return {
      mode: 'read-only',
      items: libraries.map((library) => ({
        ...library,
        documentCount: visibleItems.filter((item) => documentMatchesLibrary(item, library)).length,
      })),
    };
  });

  app.post('/documents/libraries', async (request, reply) => {
    const body = (request.body || {}) as { name?: string; description?: string };
    const name = String(body.name || '').trim();

    if (!name) {
      return reply.code(400).send({ error: 'library name is required' });
    }

    let library;
    try {
      library = await createDocumentLibrary({ name, description: body.description });
    } catch (error) {
      if (error instanceof Error && error.message === 'library already exists') {
        return reply.code(409).send({ error: 'library already exists', message: '知识库分组名称已存在' });
      }
      throw error;
    }
    const libraries = await loadDocumentLibraries();

    return {
      status: 'created',
      message: `已新增知识库分组“${library.label}”。`,
      item: library,
      items: libraries,
    };
  });

  app.delete('/documents/libraries/:key', async (request, reply) => {
    const { key } = request.params as { key: string };
    const libraries = await loadDocumentLibraries();
    const found = libraries.find((item) => item.key === key);

    if (!found) {
      return reply.code(404).send({ error: 'library not found' });
    }

    if (found.isDefault) {
      return reply.code(400).send({ error: 'default library cannot be deleted' });
    }

    await deleteDocumentLibrary(key);
    const nextLibraries = await loadDocumentLibraries();

    return {
      status: 'deleted',
      message: `已删除知识库分组“${found.label}”，文档仍保留，仅移除了分组关联。`,
      items: nextLibraries,
    };
  });

  app.post('/documents/scan', async (request, reply) => {
    const body = (request.body || {}) as { scanRoot?: string; autoGroup?: boolean };
    const requestedScanRoot = String(body.scanRoot || '').trim();
    const autoGroup = body.autoGroup !== false;

    let config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    if (requestedScanRoot && requestedScanRoot !== config.scanRoot) {
      config = await saveDocumentCategoryConfig(requestedScanRoot, {
        scanRoots: buildNextScanRoots(config.scanRoots || [config.scanRoot], requestedScanRoot),
        categories: config.categories,
        customCategories: config.customCategories,
      });
    }

    const startedAt = new Date().toISOString();
    const { exists, files, items } = await loadParsedDocuments(200, false, config.scanRoots);

    if (!exists) {
      return reply.send({
        status: 'missing-directory',
        mode: 'read-only',
        scanRoot: config.scanRoot,
        scanRoots: config.scanRoots,
        totalFiles: files.length,
        startedAt,
        finishedAt: new Date().toISOString(),
        autoGroupedCount: 0,
        message: '扫描目录不存在，请先创建目录或填写有效文件夹路径。',
      });
    }

    let autoGroupedCount = 0;
    let ungroupedCount = 0;
    if (autoGroup) {
      const libraries = await loadDocumentLibraries();
      const result = await autoAssignSuggestedLibraries(items, libraries);
      autoGroupedCount = result.updatedCount;
      ungroupedCount = result.ungroupedCount;
    }

    return {
      status: 'completed',
      mode: 'read-only',
      scanRoot: config.scanRoot,
      scanRoots: config.scanRoots,
      totalFiles: files.length,
      startedAt,
      finishedAt: new Date().toISOString(),
      autoGroupedCount,
      ungroupedCount,
      message: autoGroup
        ? `文档扫描已完成，并自动确认了 ${autoGroupedCount} 条智能分组结果。`
        : '文档扫描任务已完成，并已进行第一版文本提取（txt / md / pdf）。',
    };
  });

  app.post('/documents/scan-sources', async (request, reply) => {
    const body = (request.body || {}) as { scanRoot?: string };
    const requestedScanRoot = String(body.scanRoot || '').trim();

    if (!requestedScanRoot) {
      return reply.code(400).send({ error: 'scanRoot is required' });
    }

    const savedConfig = await addDocumentScanSource(requestedScanRoot);
    return {
      status: 'added',
      mode: 'read-only',
      config: savedConfig,
      message: '扫描目录已加入扫描源列表。',
    };
  });

  app.post('/documents/candidate-sources/import', async (request, reply) => {
    const body = (request.body || {}) as { scanRoots?: string[]; scanNow?: boolean; autoGroup?: boolean };
    const requestedScanRoots = Array.isArray(body.scanRoots)
      ? body.scanRoots.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    const scanNow = body.scanNow !== false;
    const autoGroup = body.autoGroup !== false;

    if (!requestedScanRoots.length) {
      return reply.code(400).send({ error: 'scanRoots are required' });
    }

    const { config, savedConfig, exists, totalFiles, importedCount, autoGroupedCount, ungroupedCount } = await importCandidateScanSources(requestedScanRoots, scanNow, autoGroup);

    return {
      status: 'imported',
      mode: 'read-only',
      scanRoot: savedConfig.scanRoot,
      scanRoots: savedConfig.scanRoots,
      addedCount: requestedScanRoots.filter((item) => !(config.scanRoots || [config.scanRoot]).includes(item)).length,
      scanned: scanNow,
      autoGrouped: autoGroup && scanNow,
      exists,
      totalFiles,
      importedCount,
      autoGroupedCount,
      ungroupedCount,
      message: scanNow
        ? `已加入 ${requestedScanRoots.length} 个候选目录并完成索引入库，当前共发现 ${totalFiles} 个文件。`
        : `已加入 ${requestedScanRoots.length} 个候选目录到扫描源列表。`,
    };
  });

  app.post('/documents/scan-sources/primary', async (request, reply) => {
    const body = (request.body || {}) as { scanRoot?: string };
    const requestedScanRoot = String(body.scanRoot || '').trim();

    if (!requestedScanRoot) {
      return reply.code(400).send({ error: 'scanRoot is required' });
    }

    const result = await setPrimaryDocumentScanSource(requestedScanRoot);
    if ('error' in result) {
      return reply.code(404).send({ error: result.error });
    }

    return {
      status: 'updated',
      mode: 'read-only',
      config: result.savedConfig,
      message: '主扫描目录已更新。',
    };
  });

  app.post('/documents/scan-sources/remove', async (request, reply) => {
    const body = (request.body || {}) as { scanRoot?: string };
    const requestedScanRoot = String(body.scanRoot || '').trim();

    if (!requestedScanRoot) {
      return reply.code(400).send({ error: 'scanRoot is required' });
    }

    const result = await removeDocumentScanSource(requestedScanRoot);
    if ('error' in result) {
      return reply.code(result.error === 'at least one scan source is required' ? 400 : 404).send({ error: result.error });
    }

    return {
      status: 'removed',
      mode: 'read-only',
      config: result.savedConfig,
      message: '扫描目录已移除。',
    };
  });

  app.post('/documents/organize', async () => {
    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const { items } = await loadParsedDocuments(200, false, config.scanRoots);
    const libraries = await loadDocumentLibraries();
    const { updatedCount: organizedCount, ungroupedCount } = await autoAssignSuggestedLibraries(items, libraries);

    return {
      status: 'completed',
      mode: 'read-only',
      organizedCount,
      ungroupedCount,
      scanRoot: config.scanRoot,
      scanRoots: config.scanRoots,
      message: `已按知识库分组规则完成自动整理，共更新 ${organizedCount} 条文档归类。`,
    };
  });

  app.post('/documents/recluster-ungrouped', async () => {
    const { processedCount, suggestedCount, createdLibraryCount } = await reclusterUngroupedDocuments();

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

  app.post('/documents/classify', async (request, reply) => {
    const body = (request.body || {}) as { items?: Array<{ id?: string; bizCategory?: BizCategory }> };
    const updates = Array.isArray(body.items) ? body.items : [];

    if (!updates.length) {
      return reply.code(400).send({ error: 'classification items are required' });
    }

    const validCategories: BizCategory[] = ['paper', 'contract', 'daily', 'invoice', 'order', 'service', 'inventory'];
    const libraries = await loadDocumentLibraries();
    const documentConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const { items } = await loadParsedDocuments(200, false, documentConfig.scanRoots);
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
      }, 'file', undefined, libraries));
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
    const body = (request.body || {}) as {
      items?: Array<{ id?: string; suggestedName?: string; parentCategoryKey?: BizCategory }>;
    };
    const updates = Array.isArray(body.items) ? body.items : [];

    if (!updates.length) {
      return reply.code(400).send({ error: 'category suggestion items are required' });
    }

    const documentConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const { items } = await loadParsedDocuments(200, false, documentConfig.scanRoots);
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

    const savedConfig = await saveDocumentCategoryConfig(documentConfig.scanRoot, { customCategories });
    return {
      status: 'accepted',
      message: accepted.length
        ? `已接纳 ${accepted.length} 条新增分类建议。`
        : '没有可接纳的分类建议。',
      accepted,
      config: savedConfig,
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

  app.post('/documents/local-files/import', async (request, reply) => {
    const body = (request.body || {}) as {
      paths?: string[];
      preferredLibraryKeys?: string[];
      note?: string;
    };
    const requestedPaths = Array.isArray(body.paths)
      ? body.paths.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    const preferredLibraryKeys = Array.isArray(body.preferredLibraryKeys)
      ? body.preferredLibraryKeys.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    const note = String(body.note || '').trim();

    if (!requestedPaths.length) {
      return reply.code(400).send({ error: 'paths are required' });
    }

    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const libraries = await loadDocumentLibraries();
    const ingestResult = await ingestLocalFilesIntoLibrary({
      filePaths: requestedPaths,
      documentConfig: config,
      libraries,
      preferredLibraryKeys,
    });

    return {
      status: 'imported',
      mode: 'read-only',
      scanRoot: config.scanRoot,
      scanRoots: config.scanRoots,
      note,
      requestedCount: requestedPaths.length,
      importedCount: ingestResult.summary.successCount,
      uploadedFiles: ingestResult.uploadedFiles,
      confirmedLibraryKeys: ingestResult.confirmedLibraryKeys,
      summary: ingestResult.summary,
      ingestItems: ingestResult.ingestItems,
      message: `Imported ${ingestResult.summary.successCount} local file(s) into the document library.`,
    };
  });

  app.post('/documents/upload', async (request, reply) => {
    const parts = request.parts();
    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const uploadDir = path.join(config.scanRoot, 'uploads');
    const { files: savedFiles, fields } = await saveMultipartFiles(parts, uploadDir);
    const note = String(fields.note || '').trim();

    if (!savedFiles.length) {
      return reply.code(400).send({ error: 'no files uploaded' });
    }

    const libraries = await loadDocumentLibraries();
    const ingestResult = await ingestUploadedFiles({
      files: savedFiles,
      documentConfig: config,
      libraries,
    });
    const ingestItems = ingestResult.ingestItems;
    const quickParsedItems: typeof ingestResult.parsedItems = [];

    for (const file of [] as typeof savedFiles) {
      let parsed = null;
      try {
        parsed = await parseDocument(file.path, config, { stage: 'quick' });
      } catch {
        parsed = null;
      }
      if (!parsed) {
        ingestItems.push({
          id: Buffer.from(file.path).toString('base64url'),
          sourceType: 'file' as const,
          sourceName: file.name,
          status: 'failed' as const,
          errorMessage: '文件已保存，但本次自动重扫后未找到对应解析结果。',
        });
        continue;
      }

      const suggestedGroups = resolveSuggestedLibraryKeys(parsed, libraries);
      const confirmedGroups = suggestedGroups.length ? suggestedGroups : parsed.confirmedGroups;
      quickParsedItems.push({
        ...parsed,
        suggestedGroups,
        confirmedGroups,
      });
      if (suggestedGroups.length) {
        await saveDocumentOverride(parsed.path, { groups: suggestedGroups });
        ingestItems.push(buildPreviewItemFromDocument({
          ...parsed,
          suggestedGroups: [],
          confirmedGroups,
        }, 'file', file.name, libraries));
        continue;
      }

      ingestItems.push(buildPreviewItemFromDocument(parsed, 'file', file.name, libraries));
    }

    await upsertDocumentsInCache(quickParsedItems, config.scanRoots);
    await enqueueDetailedParse(quickParsedItems.filter((item) => item.parseStatus === 'parsed').map((item) => item.path));

    return {
      status: 'uploaded',
      mode: 'read-only',
      scanRoot: config.scanRoot,
      scanRoots: config.scanRoots,
      uploadDir,
      note,
      uploadedCount: savedFiles.length,
      uploadedFiles: savedFiles,
      totalFiles: savedFiles.length,
      confirmedLibraryKeys: ingestResult.confirmedLibraryKeys,
      message: `已成功接收 ${savedFiles.length} 个文件，并完成快速解析与索引更新；未分组文档可在后续详细解析后再次归组。`,
      summary: ingestResult.summary,
      ingestItems,
    };
  });

  app.post('/documents/deep-parse/run', async (request) => {
    const body = (request.body || {}) as { limit?: number };
    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const result = await runDetailedParseBatch(Math.max(1, Math.min(24, Number(body.limit || 8))), config.scanRoots);

    return {
      status: 'completed',
      mode: 'read-only',
      ...result,
      message: `已处理 ${result.processedCount} 条详细解析任务，成功 ${result.succeededCount} 条，失败 ${result.failedCount} 条。`,
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
    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const { items } = await loadParsedDocuments(200, false, config.scanRoots);
    const result = await rebuildDocumentVectorIndex(items);

    return {
      status: 'completed',
      mode: 'read-only',
      ...result,
      message: `已重建向量化候选索引，覆盖 ${result.documentCount} 份详细解析文档，共生成 ${result.recordCount} 条向量记录。`,
    };
  });

  app.get('/documents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const documentConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const { items } = await loadParsedDocuments(200, false, documentConfig.scanRoots);
    const found = items.find((item) => buildDocumentId(item.path) === id);

    if (!found) {
      return reply.code(404).send({ error: 'document not found' });
    }

    const matchedFolders = Object.entries(documentConfig.categories)
      .filter(([, value]) => value.folders.some((folder) => folder && found.path.toLowerCase().includes(folder.toLowerCase())))
      .map(([key, value]) => ({ key, label: value.label, folders: value.folders }));

    return {
      mode: 'read-only',
      item: {
        ...((found.fullText && found.parseStage === 'detailed')
          ? found
          : await parseDocument(found.path, documentConfig, { stage: 'detailed' })),
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
}
