import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { DocumentCategoryConfig } from './document-config.js';
import type { DocumentLibrary } from './document-libraries.js';
import { buildFailedPreviewItem, type IngestPreviewItem } from './ingest-feedback.js';
import {
  ingestDocumentFiles,
  type DocumentIngestResult,
  type IngestFileRecord,
} from './document-ingest-service.js';

export type UploadedFileRecord = IngestFileRecord;
export type UploadIngestResult = Omit<DocumentIngestResult, 'files'> & {
  uploadedFiles: UploadedFileRecord[];
};

export type SaveMultipartResult = {
  files: UploadedFileRecord[];
  fields: Record<string, string>;
};

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || `upload-${Date.now()}`;
}

export async function saveMultipartFiles(
  parts: AsyncIterable<any>,
  uploadDir: string,
) {
  await fs.mkdir(uploadDir, { recursive: true });
  const files: UploadedFileRecord[] = [];
  const fields: Record<string, string> = {};

  for await (const part of parts) {
    if (part.type === 'field') {
      fields[part.fieldname] = String(part.value || '').trim();
      continue;
    }

    const fileName = sanitizeFileName(part.filename || 'upload.bin');
    const targetPath = path.join(uploadDir, `${Date.now()}-${fileName}`);
    await pipeline(part.file, createWriteStream(targetPath));
    const stat = await fs.stat(targetPath);
    files.push({
      name: fileName,
      path: targetPath,
      bytes: stat.size,
      mimeType: part.mimetype,
    });
  }

  return { files, fields } satisfies SaveMultipartResult;
}

async function copyLocalFilesIntoUploadDir(filePaths: string[], uploadDir: string) {
  await fs.mkdir(uploadDir, { recursive: true });

  const copiedFiles: UploadedFileRecord[] = [];
  const failedItems: IngestPreviewItem[] = [];
  const seen = new Set<string>();

  for (const rawPath of filePaths) {
    const sourcePath = path.resolve(String(rawPath || '').trim());
    if (!sourcePath) continue;

    const dedupeKey = sourcePath.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    let stat: Awaited<ReturnType<typeof fs.stat>> | null = null;
    try {
      stat = await fs.stat(sourcePath);
    } catch {
      stat = null;
    }

    if (!stat?.isFile()) {
      failedItems.push(buildFailedPreviewItem({
        id: Buffer.from(sourcePath).toString('base64url'),
        sourceType: 'file',
        sourceName: path.basename(sourcePath) || sourcePath,
        errorMessage: 'Local file was not found or is not a regular file.',
      }));
      continue;
    }

    const fileName = sanitizeFileName(path.basename(sourcePath));
    const targetPath = path.join(uploadDir, `${Date.now()}-${copiedFiles.length + 1}-${fileName}`);
    await fs.copyFile(sourcePath, targetPath);
    const copiedStat = await fs.stat(targetPath);
    copiedFiles.push({
      name: fileName,
      path: targetPath,
      bytes: copiedStat.size,
      originalPath: sourcePath,
    });
  }

  return {
    copiedFiles,
    failedItems,
  };
}

export async function ingestUploadedFiles(input: {
  files: UploadedFileRecord[];
  documentConfig: DocumentCategoryConfig;
  libraries: DocumentLibrary[];
  sourceNameResolver?: (file: UploadedFileRecord) => string;
  preferredLibraryKeys?: string[];
}) {
  const result = await ingestDocumentFiles(input);
  return {
    ...result,
    uploadedFiles: input.files,
  } satisfies UploadIngestResult;
}

export async function ingestExistingLocalFiles(input: {
  filePaths: string[];
  documentConfig: DocumentCategoryConfig;
  libraries: DocumentLibrary[];
  preferredLibraryKeys?: string[];
}) {
  const files: UploadedFileRecord[] = [];
  const failedItems: IngestPreviewItem[] = [];
  const seen = new Set<string>();

  for (const rawPath of input.filePaths) {
    const sourcePath = path.resolve(String(rawPath || '').trim());
    if (!sourcePath) continue;

    const dedupeKey = sourcePath.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    let stat: Awaited<ReturnType<typeof fs.stat>> | null = null;
    try {
      stat = await fs.stat(sourcePath);
    } catch {
      stat = null;
    }

    if (!stat?.isFile()) {
      failedItems.push(buildFailedPreviewItem({
        id: Buffer.from(sourcePath).toString('base64url'),
        sourceType: 'file',
        sourceName: path.basename(sourcePath) || sourcePath,
        errorMessage: 'Local file was not found or is not a regular file.',
      }));
      continue;
    }

    files.push({
      name: path.basename(sourcePath),
      path: sourcePath,
      bytes: stat.size,
      originalPath: sourcePath,
    });
  }

  const ingestResult = files.length
    ? await ingestDocumentFiles({
      files,
      documentConfig: input.documentConfig,
      libraries: input.libraries,
      preferredLibraryKeys: input.preferredLibraryKeys,
      sourceNameResolver: (file) => file.originalPath || file.name,
    })
    : {
      ingestItems: [],
      parsedItems: [],
      files: [],
      confirmedLibraryKeys: [],
      summary: {
        total: 0,
        successCount: 0,
        failedCount: 0,
      },
      metrics: {
        invalidCount: 0,
        parseFailedCount: 0,
        unsupportedCount: 0,
        groupedCount: 0,
        ungroupedCount: 0,
        detailedQueuedCount: 0,
      },
    } satisfies DocumentIngestResult;

  const ingestItems = [...failedItems, ...ingestResult.ingestItems];

  return {
    ...ingestResult,
    uploadedFiles: files,
    ingestItems,
    summary: {
      total: ingestItems.length,
      successCount: ingestItems.filter((item) => item.status === 'success').length,
      failedCount: ingestItems.filter((item) => item.status === 'failed').length,
    },
    metrics: {
      ...ingestResult.metrics,
      invalidCount: ingestResult.metrics.invalidCount + failedItems.length,
    },
  } satisfies UploadIngestResult;
}

export async function ingestLocalFilesIntoLibrary(input: {
  filePaths: string[];
  documentConfig: DocumentCategoryConfig;
  libraries: DocumentLibrary[];
  preferredLibraryKeys?: string[];
}) {
  const uploadDir = path.join(input.documentConfig.scanRoot, 'uploads');
  const { copiedFiles, failedItems } = await copyLocalFilesIntoUploadDir(input.filePaths, uploadDir);

  const ingestResult = copiedFiles.length
    ? await ingestUploadedFiles({
      files: copiedFiles,
      documentConfig: input.documentConfig,
      libraries: input.libraries,
      preferredLibraryKeys: input.preferredLibraryKeys,
      sourceNameResolver: (file) => file.originalPath || file.name,
    })
    : {
      ingestItems: [],
      parsedItems: [],
      uploadedFiles: [],
      confirmedLibraryKeys: [],
      summary: {
        total: 0,
        successCount: 0,
        failedCount: 0,
      },
      metrics: {
        invalidCount: 0,
        parseFailedCount: 0,
        unsupportedCount: 0,
        groupedCount: 0,
        ungroupedCount: 0,
        detailedQueuedCount: 0,
      },
    } satisfies UploadIngestResult;

  const ingestItems = [...failedItems, ...ingestResult.ingestItems];

  return {
    ...ingestResult,
    ingestItems,
    summary: {
      total: ingestItems.length,
      successCount: ingestItems.filter((item) => item.status === 'success').length,
      failedCount: ingestItems.filter((item) => item.status === 'failed').length,
    },
    metrics: {
      ...ingestResult.metrics,
      invalidCount: ingestResult.metrics.invalidCount + failedItems.length,
    },
  } satisfies UploadIngestResult;
}
