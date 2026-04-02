import path from 'node:path';
import { loadDocumentCategoryConfig } from './document-config.js';
import { loadDocumentLibraries } from './document-libraries.js';
import {
  ingestUploadedFiles,
  saveMultipartFiles,
} from './document-upload-ingest.js';
import { DEFAULT_SCAN_DIR } from './document-store.js';

export async function runDocumentUploadAction(parts: AsyncIterable<any>) {
  const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const uploadDir = path.join(config.scanRoot, 'uploads');
  const { files: savedFiles, fields } = await saveMultipartFiles(parts, uploadDir);
  const note = String(fields.note || '').trim();

  if (!savedFiles.length) {
    return {
      error: 'no files uploaded' as const,
    };
  }

  const libraries = await loadDocumentLibraries();
  const ingestResult = await ingestUploadedFiles({
    files: savedFiles,
    documentConfig: config,
    libraries,
  });

  return {
    config,
    uploadDir,
    savedFiles,
    note,
    ingestResult,
  };
}
