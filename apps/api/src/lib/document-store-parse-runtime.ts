import { parseDocument, refreshDerivedSchemaProfile, type ParsedDocument } from './document-parser.js';
import type { DocumentLibraryContext } from './document-extraction-governance.js';
import { enhanceParsedDocumentsWithCloud } from './document-cloud-enrichment.js';
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
  const cloudEnhancedItems = options?.cloudEnhancement === false
    ? parsedItems
    : await enhanceParsedDocumentsWithCloud(parsedItems);
  const overriddenItems = applyDocumentOverrides(cloudEnhancedItems, overrides)
    .map((item) => refreshDerivedSchemaProfile(item))
    .map(sanitizeParsedDocument);
  return applyDetailedParseQueueMetadata(overriddenItems);
}
