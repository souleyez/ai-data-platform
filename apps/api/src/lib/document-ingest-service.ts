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

export type IngestFileRecord = {
  name: string;
  path: string;
  bytes: number;
  mimeType?: string;
  originalPath?: string;
};

export type DocumentIngestMetrics = {
  invalidCount: number;
  parseFailedCount: number;
  unsupportedCount: number;
  groupedCount: number;
  ungroupedCount: number;
  detailedQueuedCount: number;
};

export type DocumentIngestResult = {
  ingestItems: IngestPreviewItem[];
  parsedItems: ParsedDocument[];
  files: IngestFileRecord[];
  confirmedLibraryKeys: string[];
  summary: {
    total: number;
    successCount: number;
    failedCount: number;
  };
  metrics: DocumentIngestMetrics;
};

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
  file: IngestFileRecord,
  sourceNameResolver: ((file: IngestFileRecord) => string) | undefined,
  errorMessage: string,
) {
  return buildFailedPreviewItem({
    id: Buffer.from(file.path).toString('base64url'),
    sourceType: 'file',
    sourceName: sourceNameResolver ? sourceNameResolver(file) : file.name,
    errorMessage,
  });
}

export function buildDocumentIngestSummaryItems(metrics: DocumentIngestMetrics) {
  return [
    {
      id: 'ingest:grouped',
      label: '已自动分组',
      summary: `${metrics.groupedCount} 个文档命中目标知识库并完成自动分类。`,
      count: metrics.groupedCount,
    },
    {
      id: 'ingest:ungrouped',
      label: '落到未分组',
      summary: `${metrics.ungroupedCount} 个文档未命中目标知识库，已落到未分组。`,
      count: metrics.ungroupedCount,
    },
    {
      id: 'ingest:unsupported',
      label: '不支持或不可解析',
      summary: `${metrics.unsupportedCount} 个文档格式不支持或当前快速解析未产出可入库内容。`,
      count: metrics.unsupportedCount,
    },
    {
      id: 'ingest:failed',
      label: '解析失败',
      summary: `${metrics.parseFailedCount} 个文档在快速解析阶段失败。`,
      count: metrics.parseFailedCount,
    },
    {
      id: 'ingest:queued',
      label: '已排入深度解析',
      summary: `${metrics.detailedQueuedCount} 个文档已进入后续深度解析、向量与记忆同步队列。`,
      count: metrics.detailedQueuedCount,
    },
    {
      id: 'ingest:invalid',
      label: '无效文件',
      summary: `${metrics.invalidCount} 个路径无效、缺失或不是常规文件。`,
      count: metrics.invalidCount,
    },
  ].filter((item) => item.count > 0).map(({ count: _count, ...item }) => item);
}

export async function ingestDocumentFiles(input: {
  files: IngestFileRecord[];
  documentConfig: DocumentCategoryConfig;
  libraries: DocumentLibrary[];
  sourceNameResolver?: (file: IngestFileRecord) => string;
  preferredLibraryKeys?: string[];
  metrics?: Partial<DocumentIngestMetrics>;
}) {
  const preferredLibraryKeys = uniq(input.preferredLibraryKeys || []);
  const ingestItems: IngestPreviewItem[] = [];
  const parsedItems: ParsedDocument[] = [];
  const confirmedLibraryKeys = new Set<string>();
  const metrics: DocumentIngestMetrics = {
    invalidCount: Number(input.metrics?.invalidCount || 0),
    parseFailedCount: Number(input.metrics?.parseFailedCount || 0),
    unsupportedCount: Number(input.metrics?.unsupportedCount || 0),
    groupedCount: Number(input.metrics?.groupedCount || 0),
    ungroupedCount: Number(input.metrics?.ungroupedCount || 0),
    detailedQueuedCount: 0,
  };

  for (const file of input.files) {
    let parsed: ParsedDocument | null = null;
    try {
      parsed = await parseDocument(file.path, input.documentConfig, { stage: 'quick' });
    } catch {
      parsed = null;
    }

    if (!parsed) {
      metrics.parseFailedCount += 1;
      ingestItems.push(buildFailedFilePreviewItem(
        file,
        input.sourceNameResolver,
        'File was saved but quick parsing failed.',
      ));
      continue;
    }

    if (parsed.parseStatus === 'error') {
      metrics.parseFailedCount += 1;
      parsedItems.push(parsed);
      ingestItems.push(buildFailedFilePreviewItem(
        file,
        input.sourceNameResolver,
        'File was saved but parsing failed. You can retry after fixing OCR or parser dependencies.',
      ));
      continue;
    }

    if (parsed.parseStatus !== 'parsed') {
      metrics.unsupportedCount += 1;
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
    const isUngroupedOnly = confirmedGroups.length === 1 && confirmedGroups[0] === UNGROUPED_LIBRARY_KEY;
    if (isUngroupedOnly) {
      metrics.ungroupedCount += 1;
    } else {
      metrics.groupedCount += 1;
    }

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
  await enqueueDetailedParse(
    parsedItems
      .filter((item) => item.parseStatus === 'parsed' || item.parseStatus === 'error')
      .map((item) => item.path),
  );
  metrics.detailedQueuedCount = parsedItems.length;

  return {
    ingestItems,
    parsedItems,
    files: input.files,
    confirmedLibraryKeys: [...confirmedLibraryKeys],
    summary: {
      total: ingestItems.length,
      successCount: ingestItems.filter((item) => item.status === 'success').length,
      failedCount: ingestItems.filter((item) => item.status === 'failed').length,
    },
    metrics,
  } satisfies DocumentIngestResult;
}
