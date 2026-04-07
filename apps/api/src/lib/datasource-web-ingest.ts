import path from 'node:path';
import type { DatasourceTargetLibrary } from './datasource-definitions.js';
import { loadDocumentCategoryConfig } from './document-config.js';
import { loadDocumentLibraries } from './document-libraries.js';
import { DEFAULT_SCAN_DIR } from './document-store.js';
import { ingestExistingLocalFiles } from './document-upload-ingest.js';
import type { WebCaptureTask } from './web-capture.js';

const MARKDOWN_PREFERRED_DOWNLOAD_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.html',
  '.htm',
  '.xml',
  '.json',
]);

export function resolveWebCapturePrimaryIngestPath(task: Pick<WebCaptureTask, 'documentPath' | 'markdownPath'>) {
  const documentPath = String(task.documentPath || '').trim();
  const markdownPath = String(task.markdownPath || '').trim();
  if (!documentPath) return '';

  const ext = path.extname(documentPath).toLowerCase();
  if (markdownPath && MARKDOWN_PREFERRED_DOWNLOAD_EXTENSIONS.has(ext)) {
    return markdownPath;
  }

  return documentPath;
}

export async function ingestWebCaptureTaskDocument(input: {
  task: WebCaptureTask;
  targetLibraries: DatasourceTargetLibrary[];
}) {
  const ingestPath = resolveWebCapturePrimaryIngestPath(input.task);
  if (!ingestPath) return null;

  const [documentConfig, libraries] = await Promise.all([
    loadDocumentCategoryConfig(DEFAULT_SCAN_DIR),
    loadDocumentLibraries(),
  ]);

  const ingestResult = await ingestExistingLocalFiles({
    filePaths: [ingestPath],
    documentConfig,
    libraries,
    preferredLibraryKeys: input.targetLibraries.map((item) => item.key),
    forcedLibraryKeys: input.targetLibraries.map((item) => item.key),
  });

  return {
    ingestPath,
    ingestResult,
  };
}
