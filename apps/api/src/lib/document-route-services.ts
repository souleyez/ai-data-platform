import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createDocumentLibrary, loadDocumentLibraries } from './document-libraries.js';
import { saveDocumentCategoryConfig, loadDocumentCategoryConfig } from './document-config.js';
import { removeDocumentOverrides, saveDocumentOverride, saveDocumentSuggestion } from './document-overrides.js';
import { buildDocumentId, DEFAULT_SCAN_DIR, loadParsedDocuments, mergeParsedDocumentsForPaths, removeDocumentsFromCache } from './document-store.js';
import { enqueueDetailedParse, runDetailedParseBatch } from './document-deep-parse-queue.js';
import { buildPreviewItemFromDocument, resolveSuggestedLibraryKeys } from './ingest-feedback.js';
import {
  discoverCandidateDirectoriesWithOpenClaw,
  mergeDiscoveryCandidates,
  type OpenClawDiscoverySeed,
} from './openclaw-file-discovery.js';
import { removeRetainedDocument } from './retained-documents.js';
import { STORAGE_FILES_DIR } from './paths.js';

type LoadedDocuments = Awaited<ReturnType<typeof loadParsedDocuments>>;
type LoadedLibraries = Awaited<ReturnType<typeof loadDocumentLibraries>>;
type ParsedDocumentItem = LoadedDocuments['items'][number];
type DocumentConfig = Awaited<ReturnType<typeof loadDocumentCategoryConfig>>;

const DISCOVERY_SCANNABLE_EXTENSIONS = new Set([
  '.pdf',
  '.txt',
  '.md',
  '.docx',
  '.csv',
  '.json',
  '.html',
  '.htm',
  '.xml',
  '.xlsx',
  '.xls',
]);

const DISCOVERY_SKIPPED_DIRECTORY_NAMES = new Set([
  '.git',
  '.next',
  'node_modules',
  'dist',
  'build',
  'bin',
  'obj',
  '__pycache__',
  '.venv',
  'venv',
]);

const DISCOVERY_MAX_SCANNED_FILES = 1500;
const DISCOVERY_MAX_DEPTH = 5;
const DISCOVERY_MAX_HOTSPOTS = 6;
const DISCOVERY_MAX_SAMPLE_EXTENSIONS = 4;

type CandidateHotspot = {
  key: string;
  path: string;
  label: string;
  reason: string;
  discoveryExplanation?: string;
  exists: boolean;
  fileCount: number;
  latestModifiedAt: number;
  truncated: boolean;
  pendingScan: boolean;
  sampleExtensions: string[];
  sourceKey: string;
  sourceLabel: string;
};

type CandidateSummary = {
  path: string;
  exists: boolean;
  fileCount: number;
  latestModifiedAt: number;
  truncated: boolean;
  pendingScan: boolean;
  sampleExtensions: string[];
  hotspots: CandidateHotspot[];
};

function buildDiscoveryExplanation(input: {
  label: string;
  reason: string;
  discoverySource?: string;
  fileCount: number;
  truncated: boolean;
  sampleExtensions: string[];
  hotspots?: Array<{ label: string }>;
}) {
  const sourceLabel = input.discoverySource === 'openclaw'
    ? 'OpenClaw 推荐'
    : input.discoverySource === 'hotspot'
      ? '热点子目录'
    : input.discoverySource === 'manual'
      ? '手动指定'
      : input.discoverySource === 'existing'
        ? '已加入扫描源'
        : '系统兜底目录';
  const fileCountText = input.fileCount > 0
    ? `${input.fileCount}${input.truncated ? '+' : ''} 个可扫描文件`
    : '暂未检测到可扫描文件';
  const extensionText = input.sampleExtensions.length
    ? `主要类型 ${input.sampleExtensions.join(' / ')}`
    : '当前还没有明显的文档类型特征';
  const hotspotNames = (input.hotspots || []).map((item) => item.label).filter(Boolean).slice(0, 3);
  const hotspotText = hotspotNames.length
    ? `热点子目录 ${hotspotNames.join(' / ')}${(input.hotspots || []).length > hotspotNames.length ? ' +' : ''}`
    : '暂未识别出更集中的热点子目录';

  return `${sourceLabel}：${input.reason} 已检测到 ${fileCountText}，${extensionText}；${hotspotText}。`;
}

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

function isDiscoveryDirectoryVisible(entryName: string) {
  if (!entryName) return false;
  if (entryName.startsWith('.')) return false;
  return !DISCOVERY_SKIPPED_DIRECTORY_NAMES.has(entryName);
}

function isDiscoveryScannableFile(entryName: string) {
  return DISCOVERY_SCANNABLE_EXTENSIONS.has(path.extname(entryName).toLowerCase());
}

function normalizeCandidatePath(targetPath: string) {
  return path.resolve(targetPath);
}

function buildCandidatePathKey(targetPath: string) {
  return normalizeCandidatePath(targetPath).toLowerCase();
}

function sortExtensions(extensionCounts: Map<string, number>) {
  return [...extensionCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, DISCOVERY_MAX_SAMPLE_EXTENSIONS)
    .map(([extension]) => extension);
}

async function summarizeCandidateDirectory(
  targetPath: string,
  source: { key: string; label: string },
): Promise<CandidateSummary | null> {
  const stat = await safeStat(targetPath);
  if (!stat?.isDirectory()) return null;

  const extensionCounts = new Map<string, number>();
  const hotspotMap = new Map<string, CandidateHotspot>();
  const stack = [{ dir: targetPath, depth: 0 }];
  let fileCount = 0;
  let latestModifiedAt = Math.floor(stat.mtimeMs);
  let truncated = false;

  while (stack.length && fileCount < DISCOVERY_MAX_SCANNED_FILES) {
    const current = stack.pop() as { dir: string; depth: number };
    let entries: Awaited<ReturnType<typeof fs.readdir>> = [];

    try {
      entries = await fs.readdir(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current.dir, entry.name);

      if (entry.isDirectory()) {
        if (current.depth < DISCOVERY_MAX_DEPTH && isDiscoveryDirectoryVisible(entry.name)) {
          stack.push({ dir: fullPath, depth: current.depth + 1 });
        }
        continue;
      }

      if (!entry.isFile() || !isDiscoveryScannableFile(entry.name)) continue;

      fileCount += 1;
      const fullStat = await safeStat(fullPath);
      if (fullStat) {
        latestModifiedAt = Math.max(latestModifiedAt, Math.floor(fullStat.mtimeMs));
      }

      const extension = path.extname(entry.name).toLowerCase();
      extensionCounts.set(extension, (extensionCounts.get(extension) || 0) + 1);

      const relativePath = path.relative(targetPath, fullPath);
      const pathSegments = relativePath.split(path.sep).filter(Boolean);
      if (pathSegments.length >= 2) {
        const firstSegment = pathSegments[0];
        const hotspotPath = path.join(targetPath, firstSegment);
        const hotspotKey = buildCandidatePathKey(hotspotPath);
        const hotspot = hotspotMap.get(hotspotKey) || {
          key: `${source.key}-hotspot-${firstSegment.toLowerCase()}`,
          path: hotspotPath,
          label: firstSegment,
          reason: `${source.label} hotspot child directory`,
          exists: true,
          fileCount: 0,
          latestModifiedAt: 0,
          truncated: false,
          pendingScan: false,
          sampleExtensions: [],
          sourceKey: source.key,
          sourceLabel: source.label,
        };

        hotspot.fileCount += 1;
        hotspot.latestModifiedAt = Math.max(
          hotspot.latestModifiedAt,
          fullStat ? Math.floor(fullStat.mtimeMs) : 0,
        );
        if (!hotspot.sampleExtensions.includes(extension) && hotspot.sampleExtensions.length < DISCOVERY_MAX_SAMPLE_EXTENSIONS) {
          hotspot.sampleExtensions.push(extension);
        }
        hotspotMap.set(hotspotKey, hotspot);
      }

      if (fileCount >= DISCOVERY_MAX_SCANNED_FILES) {
        truncated = true;
        break;
      }
    }
  }

  return {
    path: targetPath,
    exists: true,
    fileCount,
    latestModifiedAt,
    truncated,
    pendingScan: false,
    sampleExtensions: sortExtensions(extensionCounts),
    hotspots: [...hotspotMap.values()]
      .sort((a, b) => b.fileCount - a.fileCount || b.latestModifiedAt - a.latestModifiedAt || a.path.localeCompare(b.path))
      .slice(0, DISCOVERY_MAX_HOTSPOTS)
      .map((item) => ({
        ...item,
        truncated: item.truncated || truncated,
        sampleExtensions: [...item.sampleExtensions].sort((a, b) => a.localeCompare(b)),
        discoveryExplanation: buildDiscoveryExplanation({
          label: item.label,
          reason: item.reason,
          discoverySource: 'hotspot',
          fileCount: item.fileCount,
          truncated: item.truncated || truncated,
          sampleExtensions: [...item.sampleExtensions].sort((a, b) => a.localeCompare(b)),
        }),
      })),
  };
}

function buildSeedCandidateDirectories(input: {
  home: string;
  documents: string;
  desktop: string;
  downloads: string;
  oneDriveDocuments: string;
  oneDriveDesktop: string;
  appData: string;
  localAppData: string;
}) {
  const items = [
    { key: 'documents', label: 'Documents', reason: 'Default user documents folder.', path: input.documents },
    { key: 'desktop', label: 'Desktop', reason: 'Desktop often contains active working files.', path: input.desktop },
    { key: 'downloads', label: 'Downloads', reason: 'Downloads often contains newly received source files.', path: input.downloads },
    { key: 'onedrive-documents', label: 'OneDrive Documents', reason: 'OneDrive-synced documents folder.', path: input.oneDriveDocuments },
    { key: 'onedrive-desktop', label: 'OneDrive Desktop', reason: 'OneDrive-synced desktop folder.', path: input.oneDriveDesktop },
    { key: 'wechat-files', label: 'WeChat Files', reason: 'Common location for files received through WeChat.', path: input.documents ? path.join(input.documents, 'WeChat Files') : '' },
    { key: 'wechat-files-alt', label: 'WeChat Files (Alt)', reason: 'Alternative local WeChat file root used by some desktop installs.', path: input.home ? path.join(input.home, 'xwechat_files') : '' },
    { key: 'wecom-cache', label: 'WXWork', reason: 'Common location for enterprise WeChat exports.', path: input.documents ? path.join(input.documents, 'WXWork') : '' },
    { key: 'qq-files', label: 'Tencent Files', reason: 'Common location for QQ received files.', path: input.documents ? path.join(input.documents, 'Tencent Files') : '' },
    { key: 'tencent-appdata', label: 'Tencent AppData', reason: 'Roaming storage for WeChat, QQ, WeCom and related Tencent desktop apps.', path: input.appData ? path.join(input.appData, 'Tencent') : '' },
    { key: 'wechat-appdata', label: 'WeChat Cache', reason: 'Local cache and export storage for desktop WeChat.', path: input.localAppData ? path.join(input.localAppData, 'Tencent', 'WeChat') : '' },
    { key: 'wecom-appdata', label: 'WXWork Cache', reason: 'Local cache and export storage for enterprise WeChat / WeCom.', path: input.appData ? path.join(input.appData, 'Tencent', 'WXWork') : '' },
    { key: 'tim-appdata', label: 'TIM Cache', reason: 'Roaming storage for TIM desktop files and cache.', path: input.appData ? path.join(input.appData, 'Tencent', 'TIM') : '' },
    { key: 'feishu-downloads', label: 'Lark Downloads', reason: 'Common location for Lark downloads.', path: input.downloads ? path.join(input.downloads, 'Lark') : '' },
    { key: '360-downloads', label: '360 Downloads', reason: 'Common location for 360 browser downloads.', path: input.downloads ? path.join(input.downloads, '360Downloads') : '' },
    { key: 'baidu-downloads', label: 'BaiduNetdisk Download', reason: 'Common location for Baidu Netdisk downloads.', path: input.downloads ? path.join(input.downloads, 'BaiduNetdiskDownload') : '' },
    { key: 'feishu-appdata', label: 'Lark Cache', reason: 'Possible local cache/export location for Lark.', path: input.appData ? path.join(input.appData, 'LarkShell') : '' },
    { key: 'dingtalk-appdata', label: 'DingTalk Cache', reason: 'Common roaming storage for DingTalk desktop files and cache.', path: input.appData ? path.join(input.appData, 'DingTalk') : '' },
  ].filter((item) => item.path) satisfies OpenClawDiscoverySeed[];

  const deduped = new Map<string, OpenClawDiscoverySeed>();
  for (const item of items) {
    const normalizedPath = path.resolve(item.path).toLowerCase();
    if (!normalizedPath || deduped.has(normalizedPath)) continue;
    deduped.set(normalizedPath, item);
  }

  return [...deduped.values()];
}

export async function discoverCandidateDirectories() {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const appData = process.env.APPDATA || '';
  const localAppData = process.env.LOCALAPPDATA || '';
  const oneDrive = process.env.OneDrive || '';
  const documents = home ? path.join(home, 'Documents') : '';
  const desktop = home ? path.join(home, 'Desktop') : '';
  const downloads = home ? path.join(home, 'Downloads') : '';
  const oneDriveDocuments = oneDrive ? path.join(oneDrive, 'Documents') : '';
  const oneDriveDesktop = oneDrive ? path.join(oneDrive, 'Desktop') : '';

  const seedCandidates = buildSeedCandidateDirectories({
    home,
    documents,
    desktop,
    downloads,
    oneDriveDocuments,
    oneDriveDesktop,
    appData,
    localAppData,
  });

  const openClawSuggestions = await discoverCandidateDirectoriesWithOpenClaw({
    home,
    documents,
    desktop,
    downloads,
    oneDrive,
    appData,
    localAppData,
    seeds: seedCandidates,
  });

  const candidates = mergeDiscoveryCandidates(seedCandidates, openClawSuggestions);
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
    sampleExtensions: string[];
    hotspots: CandidateHotspot[];
    discoverySource?: string;
    discoveryExplanation: string;
  }>;
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const candidateKey = buildCandidatePathKey(candidate.path);
    if (seen.has(candidateKey)) continue;
    seen.add(candidateKey);

    const summary = await summarizeCandidateDirectory(candidate.path, candidate);
    if (!summary) continue;
    summarized.push({
      key: candidate.key,
      label: candidate.label,
      reason: candidate.reason,
      discoverySource: 'discoverySource' in candidate ? candidate.discoverySource : 'seed',
      discoveryExplanation: buildDiscoveryExplanation({
        label: candidate.label,
        reason: candidate.reason,
        discoverySource: 'discoverySource' in candidate ? candidate.discoverySource : 'seed',
        fileCount: summary.fileCount,
        truncated: summary.truncated,
        sampleExtensions: summary.sampleExtensions,
        hotspots: summary.hotspots,
      }),
      ...summary,
    });
  }

  return summarized.sort((a, b) => b.fileCount - a.fileCount || b.latestModifiedAt - a.latestModifiedAt || a.label.localeCompare(b.label));
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
    .split(/[\s/\\|,，。；：（）【】_-]+/)
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

    await saveDocumentOverride(item.path, { groups: suggestedGroups });
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
      await saveDocumentOverride(item.path, { groups: matched });
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
    const created = await createDocumentLibrary({ name: seed, description: 'Auto-created from clustered ungrouped documents.' });
    if (!libraries.some((library) => library.key === created.key)) {
      createdLibraryCount += 1;
      libraries.push(created);
    }
    for (const item of bucket) {
      if (item.confirmedGroups?.length || assignedClusterDocPaths.has(item.path)) continue;
      await saveDocumentOverride(item.path, { groups: [created.key] });
      assignedClusterDocPaths.add(item.path);
    }
  }

  return {
    processedCount: candidates.length,
    suggestedCount,
    createdLibraryCount,
  };
}
