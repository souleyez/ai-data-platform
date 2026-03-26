import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createDocumentLibrary, loadDocumentLibraries } from './document-libraries.js';
import { saveDocumentCategoryConfig, loadDocumentCategoryConfig } from './document-config.js';
import { removeDocumentOverrides, saveDocumentOverride, saveDocumentSuggestion } from './document-overrides.js';
import { buildDocumentId, DEFAULT_SCAN_DIR, loadParsedDocuments, mergeParsedDocumentsForPaths, removeDocumentsFromCache } from './document-store.js';
import { enqueueDetailedParse, runDetailedParseBatch } from './document-deep-parse-queue.js';
import { buildPreviewItemFromDocument, resolveSuggestedLibraryKeys } from './ingest-feedback.js';
import { removeRetainedDocument } from './retained-documents.js';
import { STORAGE_FILES_DIR } from './paths.js';

type LoadedDocuments = Awaited<ReturnType<typeof loadParsedDocuments>>;
type LoadedLibraries = Awaited<ReturnType<typeof loadDocumentLibraries>>;
type ParsedDocumentItem = LoadedDocuments['items'][number];
type DocumentConfig = Awaited<ReturnType<typeof loadDocumentCategoryConfig>>;

export function buildNextScanRoots(currentScanRoots: string[], nextPrimary: string) {
  return [nextPrimary, ...currentScanRoots.filter((item) => item !== nextPrimary)];
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

export async function discoverCandidateDirectories() {
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
    { key: 'baidu-downloads', label: '百度下载', reason: '百度网盘或浏览器常见下载目录', path: downloads ? path.join(downloads, 'BaiduNetdiskDownload') : '' },
    { key: 'feishu-appdata', label: '飞书缓存导出', reason: '飞书本地缓存常见目录', path: appData ? path.join(appData, 'LarkShell') : '' },
    { key: 'wechat-appdata', label: '微信缓存导出', reason: '微信本地缓存常见目录', path: localAppData ? path.join(localAppData, 'Tencent', 'WeChat') : '' },
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

function normalizeClusterLabel(value: string) {
  return String(value || '')
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .slice(0, 24);
}

function collectClusterSeeds(item: ParsedDocumentItem) {
  const seeds = new Set<string>();
  if (item.schemaType && item.schemaType !== 'generic') {
    seeds.add(normalizeClusterLabel(item.schemaType));
  }
  for (const tag of item.topicTags || []) {
    const normalized = normalizeClusterLabel(tag);
    if (normalized.length >= 3) seeds.add(normalized);
  }

  const profileTokens = Object.values(item.structuredProfile || {})
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => normalizeClusterLabel(String(value || '')))
    .filter((token) => token.length >= 4)
    .slice(0, 4);

  for (const token of profileTokens) seeds.add(token);

  const titleTokens = String(item.title || item.name || '')
    .split(/[\s/\\|,，。；：（）【】\]-]+/)
    .map((token) => normalizeClusterLabel(token))
    .filter((token) => token.length >= 4);

  for (const token of titleTokens.slice(0, 3)) seeds.add(token);
  return [...seeds];
}

export async function autoAssignSuggestedLibraries(items: ParsedDocumentItem[], libraries: LoadedLibraries) {
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

export async function addDocumentScanSource(scanRoot: string) {
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  return saveDocumentCategoryConfig(config.scanRoot, {
    scanRoots: Array.from(new Set([...(config.scanRoots || [config.scanRoot]), scanRoot])),
    categories: config.categories,
    customCategories: config.customCategories,
  });
}

export async function importCandidateScanSources(scanRoots: string[], scanNow: boolean) {
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const nextScanRoots = Array.from(new Set([...(config.scanRoots || [config.scanRoot]), ...scanRoots]));
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
    config,
    savedConfig,
    exists,
    totalFiles,
    importedCount,
  };
}

export async function setPrimaryDocumentScanSource(scanRoot: string) {
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const currentScanRoots = config.scanRoots || [config.scanRoot];
  if (!currentScanRoots.includes(scanRoot)) {
    return { error: 'scan source not found' as const };
  }

  const savedConfig = await saveDocumentCategoryConfig(scanRoot, {
    scanRoots: buildNextScanRoots(currentScanRoots, scanRoot),
    categories: config.categories,
    customCategories: config.customCategories,
  });

  return { savedConfig };
}

export async function removeDocumentScanSource(scanRoot: string) {
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const currentScanRoots = config.scanRoots || [config.scanRoot];
  const nextScanRoots = currentScanRoots.filter((item) => item !== scanRoot);

  if (nextScanRoots.length === currentScanRoots.length) {
    return { error: 'scan source not found' as const };
  }

  if (!nextScanRoots.length) {
    return { error: 'at least one scan source is required' as const };
  }

  const nextPrimary = config.scanRoot === scanRoot ? nextScanRoots[0] : config.scanRoot;
  const savedConfig = await saveDocumentCategoryConfig(nextPrimary, {
    scanRoots: buildNextScanRoots(nextScanRoots, nextPrimary),
    categories: config.categories,
    customCategories: config.customCategories,
  });

  return { savedConfig };
}

async function loadDocumentsById(config: DocumentConfig) {
  const { items } = await loadParsedDocuments(200, false, config.scanRoots);
  return new Map(items.map((item) => [buildDocumentId(item.path), item]));
}

export async function acceptDocumentSuggestions(updates: Array<{ id?: string }>) {
  const documentConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const byId = await loadDocumentsById(documentConfig);
  const results = [] as Array<{ id: string; groups: string[]; confirmedAt: string }>;

  for (const update of updates) {
    const found = update.id ? byId.get(update.id) : null;
    if (!found?.suggestedGroups?.length) continue;
    const saved = await saveDocumentOverride(found.path, { groups: found.suggestedGroups });
    results.push({ id: update.id as string, groups: saved.groups || [], confirmedAt: saved.confirmedAt });
  }

  return results;
}

export async function saveConfirmedDocumentGroups(updates: Array<{ id?: string; groups?: string[] }>) {
  const libraries = await loadDocumentLibraries();
  const validGroups = new Set(libraries.map((item) => item.key));
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const byId = await loadDocumentsById(config);
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

  return { ingestItems, results };
}

export async function saveIgnoredDocuments(updates: Array<{ id?: string; ignored?: boolean }>) {
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const byId = await loadDocumentsById(config);
  const results = [] as Array<{ id: string; removed: boolean; deletedFile: boolean }>;
  const removedPaths: string[] = [];

  for (const update of updates) {
    const found = update.id ? byId.get(update.id) : null;
    if (!found || update.ignored !== true) continue;

    await removeRetainedDocument(found.path);
    removedPaths.push(found.path);

    const normalizedPath = path.resolve(found.path).toLowerCase();
    const managedRoot = path.resolve(STORAGE_FILES_DIR).toLowerCase();
    let deletedFile = false;

    if (normalizedPath.startsWith(managedRoot)) {
      try {
        await fs.rm(found.path, { force: true });
        deletedFile = true;
      } catch {
        deletedFile = false;
      }
    }

    results.push({ id: update.id as string, removed: true, deletedFile });
  }

  if (removedPaths.length) {
    await removeDocumentOverrides(removedPaths);
    await removeDocumentsFromCache(removedPaths);
  }

  return results;
}

export async function reclusterUngroupedDocuments() {
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const { items } = await loadParsedDocuments(200, false, config.scanRoots);
  const libraries = await loadDocumentLibraries();

  const initialCandidates = items.filter((item) => !item.ignored && item.parseStatus === 'parsed' && !(item.confirmedGroups?.length));
  const detailedCandidatePaths = initialCandidates
    .filter((item) => item.parseStage !== 'detailed')
    .map((item) => item.path)
    .slice(0, 48);

  if (detailedCandidatePaths.length) {
    await enqueueDetailedParse(detailedCandidatePaths);
    await runDetailedParseBatch(detailedCandidatePaths.length, config.scanRoots);
  }

  const refreshedItems = detailedCandidatePaths.length
    ? (await mergeParsedDocumentsForPaths(detailedCandidatePaths, 200, config.scanRoots, {
        parseStage: 'detailed',
        cloudEnhancement: true,
      })).items
    : items;

  const candidates = refreshedItems.filter((item) => !item.ignored && item.parseStatus === 'parsed' && !(item.confirmedGroups?.length));
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
    processedCount: candidates.length,
    suggestedCount,
    createdLibraryCount,
  };
}
