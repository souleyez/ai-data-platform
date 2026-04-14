import { loadParsedDocuments } from './document-store.js';
import {
  deleteWebCaptureTask,
  listWebCaptureTasks,
  updateWebCaptureTask,
  updateWebCaptureTaskStatus,
} from './web-capture.js';
import { retainStructuredDocument } from './retained-documents.js';
import {
  appendAuditLog,
  getCaptureFilePaths,
  purgeDocumentRecords,
  removeDocumentFiles,
} from './audit-center-storage.js';
import { buildAuditSnapshot } from './audit-center-snapshot.js';

export async function appendDatasourceRunDeletionAuditLog(input: {
  actor?: 'system' | 'user';
  datasourceName: string;
  runId: string;
  remainingRuns: number;
  restoredRunId?: string;
  restoredStatus?: string;
}) {
  const restoredLabel = input.restoredRunId
    ? `最近保留记录 ${input.restoredRunId}`
    : '最近保留记录';
  const restoredStatusText = input.restoredStatus
    ? `，状态 ${input.restoredStatus}`
    : '';
  const note = input.remainingRuns > 0
    ? `已删除运行记录 ${input.runId}，数据源状态已回退至${restoredLabel}${restoredStatusText}。`
    : `已删除运行记录 ${input.runId}，当前数据源已无历史运行记录。`;

  return appendAuditLog({
    actor: input.actor || 'user',
    action: 'delete_datasource_run',
    target: input.datasourceName,
    result: 'success',
    note,
  });
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
      await removeDocumentFiles(getCaptureFilePaths(task));
    }
  }

  const updated = await updateWebCaptureTask(taskId, {
    captureStatus: 'paused',
    pausedAt: new Date().toISOString(),
    nextRunAt: '',
    documentPath: task.documentPath || '',
    rawDocumentPath: '',
    rawDeleteAfterAt: '',
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

  const filePaths = getCaptureFilePaths(task);
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
