import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { loadDocumentCategoryConfig, saveDocumentCategoryConfig, type BizCategory, type ProjectCustomCategory } from '../lib/document-config.js';
import { parseDocument } from '../lib/document-parser.js';
import { createDocumentLibrary, deleteDocumentLibrary, documentMatchesLibrary, loadDocumentLibraries } from '../lib/document-libraries.js';
import { buildDocumentId, DEFAULT_SCAN_DIR, loadParsedDocuments, mergeParsedDocumentsForPaths } from '../lib/document-store.js';
import { buildPreviewItemFromDocument, resolveSuggestedLibraryKeys } from '../lib/ingest-feedback.js';
import { saveDocumentOverride, saveDocumentSuggestion } from '../lib/document-overrides.js';

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || `upload-${Date.now()}`;
}

function buildNextScanRoots(currentScanRoots: string[], nextPrimary: string) {
  return [nextPrimary, ...currentScanRoots.filter((item) => item !== nextPrimary)];
}

function truncateText(value: unknown, maxLength: number) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

async function safeStat(targetPath: string) {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}

async function summarizeCandidateDirectory(targetPath: string) {
  const stat = await safeStat(targetPath);
  if (!stat?.isDirectory()) return null;

  return {
    path: targetPath,
    exists: true,
    fileCount: 0,
    latestModifiedAt: Math.floor(stat.mtimeMs),
    truncated: false,
    pendingScan: true,
  };
}

async function discoverCandidateDirectories() {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const appData = process.env.APPDATA || '';
  const localAppData = process.env.LOCALAPPDATA || '';
  const documents = home ? path.join(home, 'Documents') : '';
  const desktop = home ? path.join(home, 'Desktop') : '';
  const downloads = home ? path.join(home, 'Downloads') : '';

  const candidates = [
    { key: 'downloads', label: 'Downloads', reason: '常见浏览器与应用默认下载目录', path: downloads },
    { key: 'documents', label: 'Documents', reason: '系统默认文档目录', path: documents },
    { key: 'desktop', label: 'Desktop', reason: '桌面常见临时文档区', path: desktop },
    { key: 'wechat-files', label: '微信文件', reason: '微信接收文件常见目录', path: documents ? path.join(documents, 'WeChat Files') : '' },
    { key: 'wecom-cache', label: '企业微信文件', reason: '企业微信缓存与下载常见目录', path: documents ? path.join(documents, 'WXWork') : '' },
    { key: 'feishu-downloads', label: '飞书下载', reason: '飞书常见下载目录', path: downloads ? path.join(downloads, 'Lark') : '' },
    { key: 'qq-files', label: 'QQ文件', reason: 'QQ接收文件常见目录', path: documents ? path.join(documents, 'Tencent Files') : '' },
    { key: '360-downloads', label: '360下载', reason: '360浏览器常见下载目录', path: downloads ? path.join(downloads, '360Downloads') : '' },
    { key: 'baidu-downloads', label: '百度下载', reason: '百度网盘/浏览器常见下载目录', path: downloads ? path.join(downloads, 'BaiduNetdiskDownload') : '' },
    { key: 'feishu-appdata', label: '飞书缓存导出', reason: '飞书本地缓存常见目录', path: appData ? path.join(appData, 'LarkShell') : '' },
    { key: 'wechat-appdata', label: '微信缓存导出', reason: '微信本地数据常见目录', path: localAppData ? path.join(localAppData, 'Tencent', 'WeChat') : '' },
  ].filter((item) => item.path);

  const summarized = [] as Array<{
    key: string;
    label: string;
    reason: string;
    path: string;
    exists: boolean;
    fileCount: number;
    latestModifiedAt: number;
    truncated: boolean;
    pendingScan?: boolean;
  }>;

  for (const candidate of candidates) {
    const summary = await summarizeCandidateDirectory(candidate.path);
    if (!summary) continue;
    summarized.push({
      key: candidate.key,
      label: candidate.label,
      reason: candidate.reason,
      ...summary,
    });
  }

  return summarized.sort((a, b) => b.fileCount - a.fileCount || b.latestModifiedAt - a.latestModifiedAt);
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
    categoryConfirmedAt?: string;
    retainedAt?: string;
    originalDeletedAt?: string;
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
    categoryConfirmedAt: source.categoryConfirmedAt,
    retainedAt: source.retainedAt,
    originalDeletedAt: source.originalDeletedAt,
  };
}

function extractDocumentTimestamp(item: { name?: string; path?: string }) {
  const text = `${item?.name || ''} ${item?.path || ''}`;
  const match = text.match(/(\d{13})/);
  return match ? Number(match[1]) : 0;
}

function resolveLibraryScenarioKey(library: { isDefault?: boolean; sourceCategoryKey?: string; key: string }, items: Array<{ bizCategory?: string; confirmedBizCategory?: string; path?: string; name?: string }>) {
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

function normalizeClusterLabel(value: string) {
  return String(value || '')
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .slice(0, 24);
}

function collectClusterSeeds(item: Awaited<ReturnType<typeof loadParsedDocuments>>['items'][number]) {
  const seeds = new Set<string>();
  for (const tag of item.topicTags || []) {
    const normalized = normalizeClusterLabel(tag);
    if (normalized.length >= 2) seeds.add(normalized);
  }

  const titleTokens = String(item.title || item.name || '')
    .split(/[\s/\\|,，、:：;；()（）【】[\]-]+/)
    .map((token) => normalizeClusterLabel(token))
    .filter((token) => token.length >= 3);

  for (const token of titleTokens.slice(0, 3)) seeds.add(token);
  return [...seeds];
}

async function autoAssignSuggestedLibraries(
  items: Awaited<ReturnType<typeof loadParsedDocuments>>['items'],
  libraries: Awaited<ReturnType<typeof loadDocumentLibraries>>,
) {
  let updatedCount = 0;

  for (const item of items) {
    if (item.confirmedGroups?.length) continue;

    const suggestedGroups = resolveSuggestedLibraryKeys(item, libraries).filter((key) => {
      const matched = libraries.find((library) => library.key === key);
      return matched && !matched.isDefault;
    });

    if (!suggestedGroups.length) continue;

    await saveDocumentSuggestion(item.path, { suggestedGroups });
    updatedCount += 1;
  }

  return updatedCount;
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
        ? '分类目录配置已保存，并已自动重扫文档。'
        : '分类目录配置已保存，但扫描目录当前不存在。',
    };
  });

  app.get('/documents', async () => {
    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const { exists, files, items, cacheHit } = await loadParsedDocuments(200, false, config.scanRoots);
    const libraries = await loadDocumentLibraries();

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

    const libraryCounts = libraries.reduce<Record<string, number>>((acc, library) => {
      acc[library.key] = items.filter((item) => documentMatchesLibrary(item, library)).length;
      return acc;
    }, {});

    return {
      mode: 'read-only',
      scanRoot: config.scanRoot,
      scanRoots: config.scanRoots,
      exists,
      totalFiles: files.length,
      byExtension,
      byCategory,
      byBizCategory,
      byStatus,
      items: items.map((item) => toListItem({ ...item, id: buildDocumentId(item.path) })),
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

    const detailItem = found.fullText
      ? found
      : await parseDocument(found.path, documentConfig);
    const matchedFolders = Object.entries(documentConfig.categories)
      .filter(([, value]) => value.folders.some((folder) => folder && found.path.toLowerCase().includes(folder.toLowerCase())))
      .map(([key, value]) => ({ key, label: value.label, folders: value.folders }));

    return {
      mode: 'read-only',
      item: {
        ...detailItem,
        id,
      },
      meta: {
        category: detailItem.category,
        bizCategory: detailItem.bizCategory,
        parseStatus: detailItem.parseStatus,
        matchedFolders,
      },
    };
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
    const { exists, files, items, cacheHit } = await loadParsedDocuments(200, false, config.scanRoots);
    const libraries = await loadDocumentLibraries();

    const summarizedLibraries = libraries
      .map((library) => {
        const matchedItems = items.filter((item) => documentMatchesLibrary(item, library));
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
      totalFiles: files.length,
      parsed: items.filter((item) => item.parseStatus === 'parsed').length,
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

    return {
      mode: 'read-only',
      items: libraries.map((library) => ({
        ...library,
        documentCount: items.filter((item) => documentMatchesLibrary(item, library)).length,
      })),
    };
  });

  app.post('/documents/libraries', async (request, reply) => {
    const body = (request.body || {}) as { name?: string; description?: string };
    const name = String(body.name || '').trim();
    if (!name) {
      return reply.code(400).send({ error: 'library name is required' });
    }

    const library = await createDocumentLibrary({ name, description: body.description });
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
    const autoGroup = Boolean(body.autoGroup);

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
    if (autoGroup) {
      const libraries = await loadDocumentLibraries();
      autoGroupedCount = await autoAssignSuggestedLibraries(items, libraries);
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

    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const savedConfig = await saveDocumentCategoryConfig(config.scanRoot, {
      scanRoots: Array.from(new Set([...(config.scanRoots || [config.scanRoot]), requestedScanRoot])),
      categories: config.categories,
      customCategories: config.customCategories,
    });

    return {
      status: 'added',
      mode: 'read-only',
      config: savedConfig,
      message: '扫描目录已加入扫描源列表。',
    };
  });

  app.post('/documents/candidate-sources/import', async (request, reply) => {
    const body = (request.body || {}) as { scanRoots?: string[]; scanNow?: boolean };
    const requestedScanRoots = Array.isArray(body.scanRoots)
      ? body.scanRoots.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    const scanNow = body.scanNow !== false;

    if (!requestedScanRoots.length) {
      return reply.code(400).send({ error: 'scanRoots are required' });
    }

    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const nextScanRoots = Array.from(new Set([...(config.scanRoots || [config.scanRoot]), ...requestedScanRoots]));
    const savedConfig = await saveDocumentCategoryConfig(config.scanRoot, {
      scanRoots: nextScanRoots,
      categories: config.categories,
      customCategories: config.customCategories,
    });

    let totalFiles = 0;
    let importedCount = 0;
    let exists = true;
    if (scanNow) {
      const loaded = await loadParsedDocuments(200, false, savedConfig.scanRoots);
      totalFiles = loaded.files.length;
      importedCount = loaded.items.length;
      exists = loaded.exists;
    }

    return {
      status: 'imported',
      mode: 'read-only',
      scanRoot: savedConfig.scanRoot,
      scanRoots: savedConfig.scanRoots,
      addedCount: requestedScanRoots.filter((item) => !(config.scanRoots || [config.scanRoot]).includes(item)).length,
      scanned: scanNow,
      exists,
      totalFiles,
      importedCount,
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

    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const currentScanRoots = config.scanRoots || [config.scanRoot];
    if (!currentScanRoots.includes(requestedScanRoot)) {
      return reply.code(404).send({ error: 'scan source not found' });
    }

    const savedConfig = await saveDocumentCategoryConfig(requestedScanRoot, {
      scanRoots: buildNextScanRoots(currentScanRoots, requestedScanRoot),
      categories: config.categories,
      customCategories: config.customCategories,
    });

    return {
      status: 'updated',
      mode: 'read-only',
      config: savedConfig,
      message: '主扫描目录已更新。',
    };
  });

  app.post('/documents/scan-sources/remove', async (request, reply) => {
    const body = (request.body || {}) as { scanRoot?: string };
    const requestedScanRoot = String(body.scanRoot || '').trim();

    if (!requestedScanRoot) {
      return reply.code(400).send({ error: 'scanRoot is required' });
    }

    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const currentScanRoots = config.scanRoots || [config.scanRoot];
    const nextScanRoots = currentScanRoots.filter((item) => item !== requestedScanRoot);

    if (nextScanRoots.length === currentScanRoots.length) {
      return reply.code(404).send({ error: 'scan source not found' });
    }

    if (!nextScanRoots.length) {
      return reply.code(400).send({ error: 'at least one scan source is required' });
    }

    const nextPrimary = config.scanRoot === requestedScanRoot ? nextScanRoots[0] : config.scanRoot;
    const savedConfig = await saveDocumentCategoryConfig(nextPrimary, {
      scanRoots: buildNextScanRoots(nextScanRoots, nextPrimary),
      categories: config.categories,
      customCategories: config.customCategories,
    });

    return {
      status: 'removed',
      mode: 'read-only',
      config: savedConfig,
      message: '扫描目录已移除。',
    };
  });

  app.post('/documents/organize', async () => {
    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const { items } = await loadParsedDocuments(200, false, config.scanRoots);
    const libraries = await loadDocumentLibraries();
    const organizedCount = await autoAssignSuggestedLibraries(items, libraries);

    return {
      status: 'completed',
      mode: 'read-only',
      organizedCount,
      scanRoot: config.scanRoot,
      scanRoots: config.scanRoots,
      message: `已按知识库分组规则完成自动整理，共更新 ${organizedCount} 条文档归类。`,
    };
  });

  app.post('/documents/recluster-ungrouped', async () => {
    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const { items } = await loadParsedDocuments(200, false, config.scanRoots);
    const libraries = await loadDocumentLibraries();

    const candidates = items.filter((item) => !item.ignored && item.parseStatus === 'parsed' && !(item.confirmedGroups?.length));
    const clusterBuckets = new Map<string, typeof candidates>();
    let suggestedCount = 0;
    let createdLibraryCount = 0;

    for (const item of candidates) {
      const matched = resolveSuggestedLibraryKeys(item, libraries).filter((key) => {
        const library = libraries.find((entry) => entry.key === key);
        return Boolean(library && !library.isDefault);
      });

      if (matched.length) {
        await saveDocumentSuggestion(item.path, { suggestedGroups: matched });
        suggestedCount += 1;
        continue;
      }

      await saveDocumentSuggestion(item.path, { suggestedGroups: [] });
      for (const seed of collectClusterSeeds(item)) {
        const bucket = clusterBuckets.get(seed) || [];
        bucket.push(item);
        clusterBuckets.set(seed, bucket);
      }
    }

    const assignedClusterDocPaths = new Set<string>();
    for (const [seed, bucket] of [...clusterBuckets.entries()].sort((a, b) => b[1].length - a[1].length)) {
      if (bucket.length < 10) continue;
      const created = await createDocumentLibrary({ name: seed, description: '按未分组文档内容自动聚合生成' });
      if (!libraries.some((library) => library.key === created.key)) {
        createdLibraryCount += 1;
        libraries.push(created);
      }
      for (const item of bucket) {
        if (item.confirmedGroups?.length || assignedClusterDocPaths.has(item.path)) continue;
        await saveDocumentSuggestion(item.path, { suggestedGroups: [created.key] });
        assignedClusterDocPaths.add(item.path);
      }
    }

    return {
      status: 'completed',
      mode: 'read-only',
      processedCount: candidates.length,
      suggestedCount,
      createdLibraryCount,
      message: `已扫描 ${candidates.length} 条未分组文档，更新建议 ${suggestedCount} 条，自动新建分组 ${createdLibraryCount} 个。`,
    };
  });

  app.post('/documents/groups/accept-suggestions', async (request, reply) => {
    const body = (request.body || {}) as { items?: Array<{ id?: string }> };
    const updates = Array.isArray(body.items) ? body.items : [];

    if (!updates.length) {
      return reply.code(400).send({ error: 'suggestion items are required' });
    }

    const documentConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const { items } = await loadParsedDocuments(200, false, documentConfig.scanRoots);
    const byId = new Map(items.map((item) => [buildDocumentId(item.path), item]));
    const results = [] as Array<{ id: string; groups: string[]; confirmedAt: string }>;

    for (const update of updates) {
      const found = update.id ? byId.get(update.id) : null;
      if (!found?.suggestedGroups?.length) continue;
      const saved = await saveDocumentOverride(found.path, { groups: found.suggestedGroups });
      results.push({ id: update.id as string, groups: saved.groups || [], confirmedAt: saved.confirmedAt });
    }

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
    const body = (request.body || {}) as { items?: Array<{ id?: string; suggestedName?: string; parentCategoryKey?: BizCategory }> };
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
      message: accepted.length ? `已接纳 ${accepted.length} 条新增分类建议。` : '没有可接纳的分类建议。',
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

    const libraries = await loadDocumentLibraries();
    const validGroups = new Set(libraries.map((item) => item.key));
    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const { items } = await loadParsedDocuments(200, false, config.scanRoots);
    const byId = new Map(items.map((item) => [buildDocumentId(item.path), item]));
    const results = [] as Array<{ id: string; groups: string[]; confirmedAt: string }>;

    for (const update of updates) {
      const found = update.id ? byId.get(update.id) : null;
      if (!found) continue;
      const nextGroups = (update.groups || []).filter((group) => validGroups.has(group));
      const saved = await saveDocumentOverride(found.path, { groups: nextGroups });
      results.push({ id: update.id as string, groups: saved.groups || [], confirmedAt: saved.confirmedAt });
    }

    const ingestItems = results.reduce<ReturnType<typeof buildPreviewItemFromDocument>[]>((acc, result) => {
      const found = byId.get(result.id);
      if (!found) return acc;
      acc.push(buildPreviewItemFromDocument({
        ...found,
        confirmedGroups: result.groups,
        categoryConfirmedAt: result.confirmedAt,
      }, 'file', undefined, libraries));
      return acc;
    }, []);

    return {
      status: 'confirmed',
      updatedCount: ingestItems.length,
      message: ingestItems.length ? `已确认 ${ingestItems.length} 项分组。` : '没有可更新的分组项。',
      ingestItems,
    };
  });

  app.post('/documents/ignore', async (request, reply) => {
    const body = (request.body || {}) as { items?: Array<{ id?: string; ignored?: boolean }> };
    const updates = Array.isArray(body.items) ? body.items : [];

    if (!updates.length) {
      return reply.code(400).send({ error: 'ignore items are required' });
    }

    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const { items } = await loadParsedDocuments(200, false, config.scanRoots);
    const byId = new Map(items.map((item) => [buildDocumentId(item.path), item]));
    const results = [] as Array<{ id: string; ignored: boolean; confirmedAt: string }>;

    for (const update of updates) {
      const found = update.id ? byId.get(update.id) : null;
      if (!found || typeof update.ignored !== 'boolean') continue;
      const saved = await saveDocumentOverride(found.path, { ignored: update.ignored });
      results.push({ id: update.id as string, ignored: Boolean(saved.ignored), confirmedAt: saved.confirmedAt });
    }

    return {
      status: 'saved',
      updatedCount: results.length,
      items: results,
      message: `已更新 ${results.length} 条文档的忽略状态。`,
    };
  });

  app.post('/documents/upload', async (request, reply) => {
    const parts = request.parts();
    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const uploadDir = path.join(config.scanRoot, 'uploads');
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

    const libraries = await loadDocumentLibraries();
    const { files, items } = await mergeParsedDocumentsForPaths(savedFiles.map((file) => file.path), 200, config.scanRoots);
    const itemMap = new Map(items.map((item) => [item.path, item]));
    const ingestItems = [];
    for (const file of savedFiles) {
      const parsed = itemMap.get(file.path);
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
      if (suggestedGroups.length) {
        await saveDocumentSuggestion(parsed.path, { suggestedGroups });
        ingestItems.push(buildPreviewItemFromDocument({
          ...parsed,
          suggestedGroups,
        }, 'file', file.name, libraries));
        continue;
      }

      ingestItems.push(buildPreviewItemFromDocument(parsed, 'file', file.name, libraries));
    }

    return {
      status: 'uploaded',
      mode: 'read-only',
      scanRoot: config.scanRoot,
      scanRoots: config.scanRoots,
      uploadDir,
      note,
      uploadedCount: savedFiles.length,
      uploadedFiles: savedFiles,
      totalFiles: files.length,
      message: `已成功接收 ${savedFiles.length} 个文件，并完成自动解析、索引更新与推荐知识库归组。`,
      summary: {
        total: ingestItems.length,
        successCount: ingestItems.filter((item) => item.status === 'success').length,
        failedCount: ingestItems.filter((item) => item.status === 'failed').length,
      },
      ingestItems,
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
        ...(found.fullText ? found : await parseDocument(found.path, documentConfig)),
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
