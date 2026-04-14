import { loadDocumentAnswerUsageState } from './document-answer-usage.js';
import { loadParsedDocuments, buildDocumentId } from './document-store.js';
import { loadReportCenterReadState } from './report-center.js';
import { listWebCaptureTasks } from './web-capture.js';
import { loadRetainedDocuments } from './retained-documents.js';
import {
  detectDocumentSourceType,
  diffDays,
  getDocumentGroups,
  getStorageStats,
  readAuditState,
  statCreatedAt,
} from './audit-center-storage.js';
import { buildSimilarityRecommendations } from './audit-center-similarity.js';
import type { AuditCaptureItem, AuditDocumentItem } from './audit-center-types.js';

export const SOFT_CLEANUP_DAYS = Number(process.env.AUDIT_STALE_DAYS || 90);
export const HARD_DELETE_DAYS = Number(process.env.AUDIT_HARD_DELETE_DAYS || 180);

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
    const ageDays = diffDays(createdAt || item.groupConfirmedAt || new Date().toISOString());
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
    schemaType: entry.item.schemaType,
    category: entry.item.category,
    topicTags: entry.item.topicTags,
    groups: entry.item.groups,
    confirmedGroups: entry.item.confirmedGroups,
    structuredProfile: entry.item.structuredProfile,
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
      rawDocumentPath: task.rawDocumentPath,
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
