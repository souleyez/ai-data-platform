import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { DocumentCategoryConfig } from './document-config.js';
import type { DocumentLibrary } from './document-libraries.js';
import { UNGROUPED_LIBRARY_KEY } from './document-libraries.js';
import { saveDocumentOverride } from './document-overrides.js';
import { enqueueDetailedParse } from './document-deep-parse-queue.js';
import type { ParsedDocument } from './document-parser.js';
import { parseDocument } from './document-parser.js';
import { upsertDocumentsInCache } from './document-store.js';
import {
  buildFailedPreviewItem,
  buildPreviewItemFromDocument,
  resolveSuggestedLibraryKeys,
  type IngestPreviewItem,
} from './ingest-feedback.js';

export type UploadedFileRecord = {
  name: string;
  path: string;
  bytes: number;
  mimeType?: string;
  originalPath?: string;
};

export type UploadIngestResult = {
  ingestItems: IngestPreviewItem[];
  parsedItems: ParsedDocument[];
  uploadedFiles: UploadedFileRecord[];
  confirmedLibraryKeys: string[];
  summary: {
    total: number;
    successCount: number;
    failedCount: number;
  };
};

export type SaveMultipartResult = {
  files: UploadedFileRecord[];
  fields: Record<string, string>;
};

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || `upload-${Date.now()}`;
}

function uniq(items: string[]) {
  return [...new Set((items || []).map((item) => String(item || '').trim()).filter(Boolean))];
}

function resolveConfirmedGroups(
  parsed: ParsedDocument,
  libraries: DocumentLibrary[],
  preferredLibraryKeys: string[],
) {
  const preferredLibraries = preferredLibraryKeys.length
    ? libraries.filter((library) => preferredLibraryKeys.includes(library.key))
    : libraries;
  const suggestedGroups = resolveSuggestedLibraryKeys(parsed, preferredLibraries);
  const fallbackGroups = suggestedGroups.length ? [] : [UNGROUPED_LIBRARY_KEY];
  const confirmedGroups = uniq([
    ...suggestedGroups,
    ...fallbackGroups,
    ...(parsed.confirmedGroups || []),
  ]);

  return {
    suggestedGroups,
    confirmedGroups,
  };
}

function buildFailedFilePreviewItem(
  file: UploadedFileRecord,
  sourceNameResolver: ((file: UploadedFileRecord) => string) | undefined,
  errorMessage: string,
) {
  return buildFailedPreviewItem({
    id: Buffer.from(file.path).toString('base64url'),
    sourceType: 'file',
    sourceName: sourceNameResolver ? sourceNameResolver(file) : file.name,
    errorMessage,
  });
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
  const preferredLibraryKeys = uniq(input.preferredLibraryKeys || []);

  const ingestItems: IngestPreviewItem[] = [];
  const parsedItems: ParsedDocument[] = [];
  const confirmedLibraryKeys = new Set<string>();

  for (const file of input.files) {
    let parsed: ParsedDocument | null = null;
    try {
      parsed = await parseDocument(file.path, input.documentConfig, { stage: 'quick' });
    } catch {
      parsed = null;
    }

    if (!parsed) {
      ingestItems.push(buildFailedFilePreviewItem(
        file,
        input.sourceNameResolver,
        'File was saved but quick parsing failed.',
      ));
      continue;
    }

    if (parsed.parseStatus !== 'parsed') {
      ingestItems.push(buildFailedFilePreviewItem(
        file,
        input.sourceNameResolver,
        'Only file formats that can be parsed are indexed into the document library.',
      ));
      continue;
    }

    const { suggestedGroups, confirmedGroups } = resolveConfirmedGroups(
      parsed,
      input.libraries,
      preferredLibraryKeys,
    );

    parsedItems.push({
      ...parsed,
      suggestedGroups,
      confirmedGroups,
    });

    if (confirmedGroups.length) {
      await saveDocumentOverride(parsed.path, { groups: confirmedGroups });
      confirmedGroups.forEach((key) => confirmedLibraryKeys.add(key));
      ingestItems.push(
        buildPreviewItemFromDocument(
          {
            ...parsed,
            suggestedGroups: [],
            confirmedGroups,
          },
          'file',
          input.sourceNameResolver ? input.sourceNameResolver(file) : file.name,
          input.libraries,
        ),
      );
      continue;
    }

    ingestItems.push(
      buildPreviewItemFromDocument(
        parsed,
        'file',
        input.sourceNameResolver ? input.sourceNameResolver(file) : file.name,
        input.libraries,
      ),
    );
  }

  await upsertDocumentsInCache(parsedItems, input.documentConfig.scanRoots);
  await enqueueDetailedParse(parsedItems.map((item) => item.path));

  return {
    ingestItems,
    parsedItems,
    uploadedFiles: input.files,
    confirmedLibraryKeys: [...confirmedLibraryKeys],
    summary: {
      total: ingestItems.length,
      successCount: ingestItems.filter((item) => item.status === 'success').length,
      failedCount: ingestItems.filter((item) => item.status === 'failed').length,
    },
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
    ? await ingestUploadedFiles({
      files,
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
  } satisfies UploadIngestResult;
}
