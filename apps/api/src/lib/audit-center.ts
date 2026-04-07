import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadDocumentAnswerUsageState } from './document-answer-usage.js';
import { loadParsedDocuments } from './document-store.js';
import { buildDocumentId } from './document-store.js';
import { loadReportCenterReadState } from './report-center.js';
import {
  deleteWebCaptureTask,
  listWebCaptureTasks,
  updateWebCaptureTask,
  updateWebCaptureTaskStatus,
} from './web-capture.js';
import { loadDocumentOverrides, saveDocumentOverrides } from './document-overrides.js';
import { STORAGE_CONFIG_DIR, STORAGE_ROOT, STORAGE_CACHE_DIR } from './paths.js';
import { loadRetainedDocuments, removeRetainedDocument, retainStructuredDocument } from './retained-documents.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';

const AUDIT_CONFIG_DIR = STORAGE_CONFIG_DIR;
const AUDIT_STATE_FILE = path.join(AUDIT_CONFIG_DIR, 'audit-center.json');
const DOCUMENT_CACHE_FILE = path.join(STORAGE_CACHE_DIR, 'documents-cache.json');
const SOFT_CLEANUP_DAYS = Number(process.env.AUDIT_STALE_DAYS || 90);
const HARD_DELETE_DAYS = Number(process.env.AUDIT_HARD_DELETE_DAYS || 180);
const MIN_FREE_RATIO = Number(process.env.AUDIT_STORAGE_MIN_FREE_RATIO || 0.2);

type AuditLog = {
  id: string;
  time: string;
  actor: 'system' | 'user';
  action: string;
  target: string;
  result: 'success' | 'skipped' | 'failed';
  note: string;
};

type AuditState = {
  logs?: AuditLog[];
};

type AuditDocumentItem = {
  id: string;
  name: string;
  path: string;
  sourceType: 'upload' | 'capture' | 'other';
  createdAt: string;
  ageDays: number;
  parseMethod?: string;
  libraries: string[];
  reportReferenceCount: number;
  answerReferenceCount: number;
  referenceCount: number;
  referencedByReports: boolean;
  referencedByAnswers: boolean;
  relatedCaptureTaskId?: string;
  storageState: 'live' | 'structured-only';
  similarityGroupKey?: string;
  similarDocumentCount: number;
  similarityCleanupRecommended: boolean;
  cleanupRecommended: boolean;
  autoCleanupEligible: boolean;
  hardDeleteRecommended: boolean;
};

type AuditCaptureItem = {
  id: string;
  name: string;
  url: string;
  captureStatus: 'active' | 'paused';
  createdAt: string;
  lastRunAt?: string;
  ageDays: number;
  reportReferenceCount: number;
  answerReferenceCount: number;
  referenceCount: number;
  referencedByReports: boolean;
  referencedByAnswers: boolean;
  documentPath?: string;
  storageState: 'live' | 'structured-only' | 'none';
  cleanupRecommended: boolean;
  autoCleanupEligible: boolean;
  hardDeleteRecommended: boolean;
};

function buildId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toIso(value: Date) {
  return value.toISOString();
}

function diffDays(from: string) {
  const timestamp = Date.parse(from);
  if (Number.isNaN(timestamp)) return 0;
  return Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000));
}

function getDocumentGroups(item: { confirmedGroups?: string[]; groups?: string[] }) {
  return [...new Set((item.confirmedGroups?.length ? item.confirmedGroups : item.groups || []).filter(Boolean))];
}

function normalizeSimilarityText(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/^\d{10,}-/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeSimilarityText(value: string) {
  return normalizeSimilarityText(value)
    .split(' ')
    .filter((token) => token.length >= 2)
    .slice(0, 48);
}

function buildDocumentSimilaritySeed(item: {
  name: string;
  title?: string;
  summary?: string;
  excerpt?: string;
  evidenceChunks?: Array<{ text?: string }>;
  bizCategory?: string;
}) {
  const titleKey = normalizeSimilarityText(item.title || item.name);
  const leadChunk = item.evidenceChunks?.[0]?.text || item.excerpt || item.summary || '';
  const contentKey = normalizeSimilarityText(leadChunk).slice(0, 220);
  const fingerprint = `${item.bizCategory || 'general'}|${titleKey}|${contentKey}`;
  return {
    titleKey,
    fingerprint,
    tokens: tokenizeSimilarityText(`${item.title || item.name} ${item.summary || ''} ${item.excerpt || ''}`),
  };
}

function computeTokenJaccard(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const left = new Set(a);
  const right = new Set(b);
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = new Set([...left, ...right]).size || 1;
  return intersection / union;
}

function chooseClusterPrimary(members: Array<{ path: string; createdAt: string; referenceCount: number; storageState: 'live' | 'structured-only' }>) {
  return [...members]
    .sort((a, b) => {
      if (b.referenceCount !== a.referenceCount) {
        return b.referenceCount - a.referenceCount;
      }
      if (Number(b.storageState === 'live') !== Number(a.storageState === 'live')) {
        return Number(b.storageState === 'live') - Number(a.storageState === 'live');
      }
      return Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '');
    })[0];
}

function buildSimilarityRecommendations(items: Array<{
  path: string;
  name: string;
  title?: string;
  summary?: string;
  excerpt?: string;
  evidenceChunks?: Array<{ text?: string }>;
  bizCategory?: string;
  createdAt: string;
  referenceCount: number;
  storageState: 'live' | 'structured-only';
}>) {
  const recommendations = new Map<string, { groupKey: string; size: number; cleanup: boolean }>();
  const buckets = new Map<string, typeof items>();

  for (const item of items) {
    const seed = buildDocumentSimilaritySeed(item);
    const bucketKey = `${item.bizCategory || 'general'}|${seed.titleKey || normalizeSimilarityText(item.name)}`;
    const existing = buckets.get(bucketKey) || [];
    existing.push(item);
    buckets.set(bucketKey, existing);
  }

  for (const [bucketKey, members] of buckets.entries()) {
    if (members.length < 2) continue;
    const clusterMembers: typeof items = [];
    const baseline = buildDocumentSimilaritySeed(members[0]);
    for (const member of members) {
      const seed = buildDocumentSimilaritySeed(member);
      const contentExact = baseline.fingerprint === seed.fingerprint && seed.fingerprint.length > 24;
      const tokenSimilarity = computeTokenJaccard(baseline.tokens, seed.tokens);
      if (contentExact || tokenSimilarity >= 0.82) {
        clusterMembers.push(member);
      }
    }

    if (clusterMembers.length < 2) continue;
    const primary = chooseClusterPrimary(clusterMembers);
    for (const member of clusterMembers) {
      recommendations.set(member.path, {
        groupKey: bucketKey,
        size: clusterMembers.length,
        cleanup: member.path !== primary.path && member.storageState === 'live' && member.referenceCount === 0,
      });
    }
  }

  return recommendations;
}

function detectDocumentSourceType(filePath: string): 'upload' | 'capture' | 'other' {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/uploads/')) return 'upload';
  if (normalized.includes('/web-captures/')) return 'capture';
  return 'other';
}

async function ensureAuditDir() {
  await fs.mkdir(AUDIT_CONFIG_DIR, { recursive: true });
}

async function readAuditState(): Promise<AuditState> {
  const { data } = await readRuntimeStateJson<AuditState>({
    filePath: AUDIT_STATE_FILE,
    fallback: {},
    normalize: (parsed) => {
      const logs = Array.isArray((parsed as AuditState | null)?.logs)
        ? (parsed as AuditState).logs
        : [];
      return { logs };
    },
  });
  return data;
}

async function writeAuditState(state: AuditState) {
  await ensureAuditDir();
  await writeRuntimeStateJson({
    filePath: AUDIT_STATE_FILE,
    payload: state,
  });
}

async function appendAuditLog(input: Omit<AuditLog, 'id' | 'time'>) {
  const current = await readAuditState();
  const item: AuditLog = {
    id: buildId('audit'),
    time: new Date().toISOString(),
    ...input,
  };
  const logs = [item, ...(current.logs || [])].slice(0, 200);
  await writeAuditState({ logs });
  return item;
}

async function getStorageStats() {
  const stat = await fs.statfs(STORAGE_ROOT);
  const totalBytes = Number(stat.blocks) * Number(stat.bsize);
  const freeBytes = Number(stat.bavail) * Number(stat.bsize);
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const freeRatio = totalBytes > 0 ? freeBytes / totalBytes : 1;

  return {
    totalBytes,
    freeBytes,
    usedBytes,
    freeRatio,
    freeThresholdRatio: MIN_FREE_RATIO,
    belowThreshold: freeRatio < MIN_FREE_RATIO,
  };
}

async function statCreatedAt(filePath: string) {
  try {
    const stat = await fs.stat(filePath);
    const candidate = stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime;
    return toIso(candidate);
  } catch {
    return '';
  }
}

async function syncDocumentCache(removedPaths: string[]) {
  try {
    const raw = await fs.readFile(DOCUMENT_CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as { items?: Array<{ path: string }>; totalFiles?: number };
    const nextItems = (parsed.items || []).filter((item) => !removedPaths.includes(item.path));
    await fs.writeFile(DOCUMENT_CACHE_FILE, JSON.stringify({
      ...parsed,
      items: nextItems,
      totalFiles: nextItems.length,
      generatedAt: new Date().toISOString(),
    }, null, 2), 'utf8');
  } catch {
    // keep audit cleanup best-effort
  }
}

async function removeDocumentFiles(filePaths: string[]) {
  await Promise.all(filePaths.map((filePath) => fs.rm(filePath, { force: true }).catch(() => undefined)));

  const overrides = await loadDocumentOverrides();
  let changed = false;
  for (const filePath of filePaths) {
    if (overrides[filePath]) {
      delete overrides[filePath];
      changed = true;
    }
  }
  if (changed) {
    await saveDocumentOverrides(overrides);
  }
}

async function purgeDocumentRecords(filePaths: string[]) {
  await removeDocumentFiles(filePaths);
  await syncDocumentCache(filePaths);
  await Promise.all(filePaths.map((filePath) => removeRetainedDocument(filePath)));
}

export async function buildAuditSnapshot() {
  const [{ items: documents }, tasks, reportState, auditState, storage, retainedDocuments, answerUsageState] = await Promise.all([
    loadParsedDocuments(5000, false, undefined, {
      skipBackgroundTasks: true,
    }),
    listWebCaptureTasks(),
    loadReportCenterReadState(),
    readAuditState(),
    getStorageStats(),
    loadRetainedDocuments(),
    loadDocumentAnswerUsageState(),
  ]);

  const retainedPathSet = new Set(retainedDocuments.map((item) => item.path));
  const referencedGroups = new Set(reportState.outputs.map((item) => item.groupKey).filter(Boolean));
  const answerUsageByDocumentId = new Map(answerUsageState.items.map((item) => [item.documentId, item]));
  const taskByDocumentPath = new Map(
    tasks.filter((task) => task.documentPath).map((task) => [task.documentPath as string, task]),
  );

  const rawDocumentItems = await Promise.all(documents.map(async (item) => {
    const createdAt = item.originalDeletedAt || await statCreatedAt(item.path);
    const ageDays = diffDays(createdAt || item.categoryConfirmedAt || new Date().toISOString());
    const libraries = getDocumentGroups(item);
    const documentId = buildDocumentId(item.path);
    const reportReferenceCount = reportState.outputs.filter((output) => libraries.includes(String(output.groupKey || ''))).length;
    const answerReferenceCount = Number(answerUsageByDocumentId.get(documentId)?.count || 0);
    const referenceCount = reportReferenceCount + answerReferenceCount;
    const referencedByReports = reportReferenceCount > 0;
    const referencedByAnswers = answerReferenceCount > 0;
    const relatedTask = taskByDocumentPath.get(item.path);
    const sourceType = detectDocumentSourceType(item.path);
    const storageState: 'live' | 'structured-only' = retainedPathSet.has(item.path) || item.retentionStatus === 'structured-only'
      ? 'structured-only'
      : 'live';

    return {
      item,
      documentId,
      createdAt,
      ageDays,
      libraries,
      reportReferenceCount,
      answerReferenceCount,
      referenceCount,
      referencedByReports,
      referencedByAnswers,
      relatedTask,
      sourceType,
      storageState,
    };
  }));

  const similarityRecommendations = buildSimilarityRecommendations(rawDocumentItems.map((entry) => ({
    path: entry.item.path,
    name: entry.item.name,
    title: entry.item.title,
    summary: entry.item.summary,
    excerpt: entry.item.excerpt,
    evidenceChunks: entry.item.evidenceChunks,
    bizCategory: entry.item.bizCategory,
    createdAt: entry.createdAt,
    referenceCount: entry.referenceCount,
    storageState: entry.storageState,
  })));

  const documentItems: AuditDocumentItem[] = rawDocumentItems.map((entry) => {
    const similarity = similarityRecommendations.get(entry.item.path);
    const similarityCleanupRecommended = Boolean(similarity?.cleanup);
    const cleanupRecommended = similarityCleanupRecommended
      || (entry.ageDays >= SOFT_CLEANUP_DAYS && entry.referenceCount === 0 && entry.storageState === 'live');
    const autoCleanupEligible = similarityCleanupRecommended || (
      entry.sourceType === 'capture'
      && Boolean(entry.relatedTask)
      && entry.relatedTask?.captureStatus === 'paused'
      && entry.ageDays >= SOFT_CLEANUP_DAYS
      && entry.referenceCount === 0
      && entry.storageState === 'live'
    );
    const hardDeleteRecommended = entry.ageDays >= HARD_DELETE_DAYS
      && entry.referenceCount === 0
      && entry.storageState === 'structured-only'
      && (!entry.relatedTask || entry.relatedTask.captureStatus === 'paused');

    return {
      id: entry.documentId,
      name: entry.item.name,
      path: entry.item.path,
      sourceType: entry.sourceType,
      createdAt: entry.createdAt,
      ageDays: entry.ageDays,
      parseMethod: entry.item.parseMethod,
      libraries: entry.libraries,
      reportReferenceCount: entry.reportReferenceCount,
      answerReferenceCount: entry.answerReferenceCount,
      referenceCount: entry.referenceCount,
      referencedByReports: entry.referencedByReports,
      referencedByAnswers: entry.referencedByAnswers,
      relatedCaptureTaskId: entry.relatedTask?.id,
      storageState: entry.storageState,
      similarityGroupKey: similarity?.groupKey,
      similarDocumentCount: similarity?.size || 1,
      similarityCleanupRecommended,
      cleanupRecommended,
      autoCleanupEligible,
      hardDeleteRecommended,
    };
  });

  const documentByPath = new Map(documentItems.map((item) => [item.path, item]));
  const captureItems: AuditCaptureItem[] = tasks.map((task) => {
    const relatedDoc = task.documentPath ? documentByPath.get(task.documentPath) : undefined;
    const basis = task.lastRunAt || task.createdAt;
    const ageDays = diffDays(basis);
    const referencedByReports = Boolean(relatedDoc?.referencedByReports);
    const referencedByAnswers = Boolean(relatedDoc?.referencedByAnswers);
    const reportReferenceCount = Number(relatedDoc?.reportReferenceCount || 0);
    const answerReferenceCount = Number(relatedDoc?.answerReferenceCount || 0);
    const referenceCount = reportReferenceCount + answerReferenceCount;
    const storageState = relatedDoc ? relatedDoc.storageState : (task.documentPath ? 'structured-only' : 'none');
    const cleanupRecommended = ageDays >= SOFT_CLEANUP_DAYS && referenceCount === 0;
    const autoCleanupEligible = task.captureStatus === 'paused'
      && ageDays >= SOFT_CLEANUP_DAYS
      && referenceCount === 0
      && storageState === 'live';
    const hardDeleteRecommended = task.captureStatus === 'paused'
      && ageDays >= HARD_DELETE_DAYS
      && referenceCount === 0
      && storageState !== 'live';

    return {
      id: task.id,
      name: task.title || task.url,
      url: task.url,
      captureStatus: task.captureStatus || 'active',
      createdAt: task.createdAt,
      lastRunAt: task.lastRunAt,
      ageDays,
      reportReferenceCount,
      answerReferenceCount,
      referenceCount,
      referencedByReports,
      referencedByAnswers,
      documentPath: task.documentPath,
      storageState,
      cleanupRecommended,
      autoCleanupEligible,
      hardDeleteRecommended,
    };
  });

  return {
    storage,
    staleDays: SOFT_CLEANUP_DAYS,
    hardDeleteDays: HARD_DELETE_DAYS,
    documents: documentItems,
    captureTasks: captureItems,
    logs: auditState.logs || [],
    meta: {
      totalDocuments: documentItems.length,
      cleanupRecommendedDocuments: documentItems.filter((item) => item.cleanupRecommended).length,
      similarityCleanupRecommendedDocuments: documentItems.filter((item) => item.similarityCleanupRecommended).length,
      cleanupRecommendedCaptureTasks: captureItems.filter((item) => item.cleanupRecommended).length,
      hardDeleteRecommendedDocuments: documentItems.filter((item) => item.hardDeleteRecommended).length,
      hardDeleteRecommendedCaptureTasks: captureItems.filter((item) => item.hardDeleteRecommended).length,
      autoCleanupEligibleDocuments: documentItems.filter((item) => item.autoCleanupEligible).length,
      autoCleanupEligibleCaptureTasks: captureItems.filter((item) => item.autoCleanupEligible).length,
      answerReferencedDocuments: documentItems.filter((item) => item.answerReferenceCount > 0).length,
      totalAnswerReferences: documentItems.reduce((sum, item) => sum + item.answerReferenceCount, 0),
      referencedGroups: referencedGroups.size,
      reportOutputs: reportState.outputs.length,
    },
  };
}

export async function pauseAuditCaptureTask(taskId: string) {
  const task = await updateWebCaptureTaskStatus(taskId, 'paused');
  await appendAuditLog({
    actor: 'user',
    action: 'pause_capture',
    target: task.title || task.url,
    result: 'success',
    note: '已在审计中心将该数据源标记为停采。',
  });
  return task;
}

export async function cleanupAuditDocument(documentId: string, options?: { pauseRelatedCapture?: boolean }) {
  const snapshot = await buildAuditSnapshot();
  const target = snapshot.documents.find((item) => item.id === documentId);
  if (!target) throw new Error('document not found');
  if (target.storageState === 'structured-only') return target;

  const document = (await loadParsedDocuments(5000, false)).items.find((item) => item.path === target.path);
  if (!document) throw new Error('document payload not found');

  await retainStructuredDocument(document);
  await removeDocumentFiles([target.path]);

  if (options?.pauseRelatedCapture && target.relatedCaptureTaskId) {
    await updateWebCaptureTask(target.relatedCaptureTaskId, {
      documentPath: target.path,
      captureStatus: 'paused',
      pausedAt: new Date().toISOString(),
      nextRunAt: '',
    });
  }

  await appendAuditLog({
    actor: 'user',
    action: 'cleanup_document_source',
    target: target.name,
    result: 'success',
    note: '已删除原文件，保留结构化解析结果供问答和报表继续使用。',
  });
  return target;
}

export async function hardDeleteAuditDocument(documentId: string) {
  const snapshot = await buildAuditSnapshot();
  const target = snapshot.documents.find((item) => item.id === documentId);
  if (!target) throw new Error('document not found');

  await purgeDocumentRecords([target.path]);
  if (target.relatedCaptureTaskId) {
    await updateWebCaptureTask(target.relatedCaptureTaskId, {
      documentPath: '',
    });
  }
  await appendAuditLog({
    actor: 'user',
    action: 'hard_delete_document',
    target: target.name,
    result: 'success',
    note: '已彻底删除文档原文件和结构化数据。',
  });
  return target;
}

export async function cleanupAuditCaptureTask(taskId: string) {
  const tasks = await listWebCaptureTasks();
  const task = tasks.find((item) => item.id === taskId);
  if (!task) throw new Error('capture task not found');

  if (task.documentPath) {
    const snapshot = await buildAuditSnapshot();
    const document = (await loadParsedDocuments(5000, false)).items.find((item) => item.path === task.documentPath);
    const auditDoc = snapshot.documents.find((item) => item.path === task.documentPath);

    if (document && auditDoc?.storageState !== 'structured-only') {
      await retainStructuredDocument(document);
      await removeDocumentFiles([task.documentPath]);
    }
  }

  const updated = await updateWebCaptureTask(taskId, {
    captureStatus: 'paused',
    pausedAt: new Date().toISOString(),
    nextRunAt: '',
    documentPath: task.documentPath || '',
  });

  await appendAuditLog({
    actor: 'user',
    action: 'cleanup_capture_source',
    target: task.title || task.url,
    result: 'success',
    note: '已停采并删除当前原始采集文件，保留结构化数据。',
  });
  return updated;
}

export async function hardDeleteAuditCaptureTask(taskId: string) {
  const tasks = await listWebCaptureTasks();
  const task = tasks.find((item) => item.id === taskId);
  if (!task) throw new Error('capture task not found');

  const filePaths = [task.documentPath].filter(Boolean) as string[];
  if (filePaths.length) {
    await purgeDocumentRecords(filePaths);
  }
  await deleteWebCaptureTask(taskId);
  await appendAuditLog({
    actor: 'user',
    action: 'hard_delete_capture',
    target: task.title || task.url,
    result: 'success',
    note: '已彻底删除停采数据源以及其结构化入库记录。',
  });
  return task;
}

export async function runAuditPolicy() {
  const snapshot = await buildAuditSnapshot();
  if (!snapshot.storage.belowThreshold) {
    const log = await appendAuditLog({
      actor: 'system',
      action: 'auto_cleanup_check',
      target: 'storage-policy',
      result: 'skipped',
      note: `当前剩余存储比例 ${(snapshot.storage.freeRatio * 100).toFixed(1)}%，未低于阈值 ${(snapshot.storage.freeThresholdRatio * 100).toFixed(1)}%。`,
    });
    return {
      status: 'skipped',
      cleanedDocuments: 0,
      cleanedCaptureTasks: 0,
      log,
    };
  }

  const eligibleTasks = snapshot.captureTasks.filter((item) => item.autoCleanupEligible);
  const eligibleDocuments = snapshot.documents
    .filter((item) => item.autoCleanupEligible && (!item.relatedCaptureTaskId || item.similarityCleanupRecommended))
    .sort((a, b) => {
      if (Number(b.similarityCleanupRecommended) !== Number(a.similarityCleanupRecommended)) {
        return Number(b.similarityCleanupRecommended) - Number(a.similarityCleanupRecommended);
      }
      if (b.similarDocumentCount !== a.similarDocumentCount) {
        return b.similarDocumentCount - a.similarDocumentCount;
      }
      return b.ageDays - a.ageDays;
    });

  for (const task of eligibleTasks) {
    await cleanupAuditCaptureTask(task.id);
  }
  for (const document of eligibleDocuments) {
    await cleanupAuditDocument(document.id);
  }

  const log = await appendAuditLog({
    actor: 'system',
    action: 'auto_cleanup_execute',
    target: 'storage-policy',
    result: 'success',
    note: `剩余存储比例 ${(snapshot.storage.freeRatio * 100).toFixed(1)}%，已自动清理 ${eligibleDocuments.length} 份原文件、${eligibleTasks.length} 个停采数据源原文件。`,
  });

  return {
    status: 'completed',
    cleanedDocuments: eligibleDocuments.length,
    cleanedCaptureTasks: eligibleTasks.length,
    log,
  };
}
