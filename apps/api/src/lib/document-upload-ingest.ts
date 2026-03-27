import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { DocumentCategoryConfig } from './document-config.js';
import type { DocumentLibrary } from './document-libraries.js';
import { saveDocumentOverride } from './document-overrides.js';
import { enqueueDetailedParse } from './document-deep-parse-queue.js';
import type { ParsedDocument } from './document-parser.js';
import { parseDocument } from './document-parser.js';
import { upsertDocumentsInCache } from './document-store.js';
import { buildPreviewItemFromDocument, resolveSuggestedLibraryKeys, type IngestPreviewItem } from './ingest-feedback.js';

export type UploadedFileRecord = {
  name: string;
  path: string;
  bytes: number;
  mimeType?: string;
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
    const targetPath = `${uploadDir}\\${Date.now()}-${fileName}`;
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

function uniq(items: string[]) {
  return [...new Set((items || []).map((item) => String(item || '').trim()).filter(Boolean))];
}

export async function ingestUploadedFiles(input: {
  files: UploadedFileRecord[];
  documentConfig: DocumentCategoryConfig;
  libraries: DocumentLibrary[];
  sourceNameResolver?: (file: UploadedFileRecord) => string;
  preferredLibraryKeys?: string[];
}) {
  const preferredLibraryKeys = uniq(input.preferredLibraryKeys || []);
  const preferredLibraries = preferredLibraryKeys.length
    ? input.libraries.filter((library) => preferredLibraryKeys.includes(library.key))
    : input.libraries;

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
      ingestItems.push({
        id: Buffer.from(file.path).toString('base64url'),
        sourceType: 'file',
        sourceName: input.sourceNameResolver ? input.sourceNameResolver(file) : file.name,
        status: 'failed',
        errorMessage: '文件已保存，但本次快速解析失败。',
      });
      continue;
    }

    const suggestedGroups = resolveSuggestedLibraryKeys(parsed, preferredLibraries);
    const fallbackGroups = suggestedGroups.length ? [] : preferredLibraryKeys.slice(0, 1);
    const confirmedGroups = uniq([
      ...(suggestedGroups.length ? suggestedGroups : []),
      ...fallbackGroups,
      ...(parsed.confirmedGroups || []),
    ]);

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
  await enqueueDetailedParse(parsedItems.filter((item) => item.parseStatus === 'parsed').map((item) => item.path));

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
