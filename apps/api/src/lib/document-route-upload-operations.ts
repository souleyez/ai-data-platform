import path from 'node:path';
import {
  linkDocumentsToDatasetSecretBinding,
  resolveDatasetSecretGrants,
} from './dataset-secrets.js';
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
  const preferredLibraryKeys = (() => {
    try {
      const parsed = JSON.parse(String(fields.preferredLibraryKeys || '[]'));
      return Array.isArray(parsed)
        ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  })();
  const resolvedSecretAccess = await resolveDatasetSecretGrants({
    grants: (() => {
      try {
        return JSON.parse(String(fields.datasetSecretGrants || '[]'));
      } catch {
        return [];
      }
    })(),
    activeGrant: (() => {
      try {
        return JSON.parse(String(fields.activeDatasetSecretGrant || 'null'));
      } catch {
        return null;
      }
    })(),
  });

  if (!savedFiles.length) {
    return {
      error: 'no files uploaded' as const,
    };
  }

  const libraries = await loadDocumentLibraries();
  const activeSecretLibraryKeys = resolvedSecretAccess.activeLibraryKeys.filter((key) => (
    libraries.some((library) => library.key === key)
  ));
  const ingestResult = await ingestUploadedFiles({
    files: savedFiles,
    documentConfig: config,
    libraries,
    preferredLibraryKeys: [...new Set([
      ...preferredLibraryKeys,
      ...activeSecretLibraryKeys,
    ])],
  });
  if (resolvedSecretAccess.activeGrant?.bindingId) {
    await linkDocumentsToDatasetSecretBinding({
      bindingId: resolvedSecretAccess.activeGrant.bindingId,
      documentPaths: ingestResult.parsedItems
        .map((item) => item.path)
        .filter(Boolean),
    });
  }

  return {
    config,
    uploadDir,
    savedFiles,
    note,
    ingestResult,
    datasetSecretAccess: resolvedSecretAccess,
  };
}
