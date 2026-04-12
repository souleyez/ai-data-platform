import { parseDocument, refreshDerivedSchemaProfile, type ParsedDocument } from './document-parser.js';
import type { DocumentLibraryContext } from './document-extraction-governance.js';
import {
  applyParsedDocumentTextStructuring,
  applyParsedDocumentVisualFallbacks,
  type DocumentCloudEnhancementOptions,
} from './document-cloud-enrichment.js';
import { applyDetailedParseQueueMetadata } from './document-deep-parse-queue.js';
import { loadDocumentCategoryConfig } from './document-config.js';
import { applyDocumentOverrides, loadDocumentOverrides } from './document-overrides.js';
import { DEFAULT_SCAN_DIR } from './document-scan-runtime.js';
import { sanitizeParsedDocument } from './document-store-normalization.js';

export async function parseDocumentFiles(
  filePaths: string[],
  scanRoot?: string | string[],
  options?: {
    cloudEnhancement?: boolean;
    parseStage?: 'quick' | 'detailed';
    libraryContextByPath?: Map<string, DocumentLibraryContext>;
    cloudOptions?: DocumentCloudEnhancementOptions;
  },
): Promise<ParsedDocument[]> {
  const activeScanRoot = Array.isArray(scanRoot) ? scanRoot[0] : scanRoot;
  const categoryConfig = await loadDocumentCategoryConfig(activeScanRoot || DEFAULT_SCAN_DIR);
  const overrides = await loadDocumentOverrides();
  const parsedItems = await Promise.all(
    filePaths.map((filePath) => parseDocument(filePath, categoryConfig, {
      stage: options?.parseStage || 'detailed',
      libraryContext: options?.libraryContextByPath?.get(filePath),
    })),
  );
  const withVisualFallbacks = options?.cloudEnhancement === false
    ? parsedItems
    : await applyParsedDocumentVisualFallbacks(parsedItems, options?.cloudOptions);
  const cloudEnhancedItems = options?.cloudEnhancement === false
    ? withVisualFallbacks
    : await applyParsedDocumentTextStructuring(withVisualFallbacks, options?.cloudOptions);
  const overriddenItems = applyDocumentOverrides(cloudEnhancedItems, overrides)
    .map((item) => refreshDerivedSchemaProfile(item))
    .map(sanitizeParsedDocument);
  return applyDetailedParseQueueMetadata(overriddenItems);
}

export async function parseDetailedDocument(
  filePath: string,
  scanRoot?: string | string[],
  options?: {
    libraryContext?: DocumentLibraryContext;
    cloudEnhancement?: boolean;
    cloudOptions?: DocumentCloudEnhancementOptions;
  },
): Promise<ParsedDocument | null> {
  const items = await parseDocumentFiles([filePath], scanRoot, {
    parseStage: 'detailed',
    cloudEnhancement: options?.cloudEnhancement,
    cloudOptions: options?.cloudOptions,
    libraryContextByPath: new Map(
      options?.libraryContext ? [[filePath, options.libraryContext]] : [],
    ),
  });
  return items[0] || null;
}
