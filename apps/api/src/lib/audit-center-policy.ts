import { appendAuditLog } from './audit-center-storage.js';
import { buildAuditSnapshot } from './audit-center-snapshot.js';
import { cleanupAuditCaptureTask, cleanupAuditDocument } from './audit-center-actions.js';

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
