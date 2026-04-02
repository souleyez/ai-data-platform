export {
  DEFAULT_SCAN_DIR,
  listCachedDocumentPaths,
  listFilesRecursive,
  removeDocumentsFromCache,
  upsertDocumentsInCache,
} from './document-scan-runtime.js';

export {
  buildDocumentId,
  matchDocumentEvidenceByPrompt,
  matchDocumentsByPrompt,
  matchResumeDocuments,
} from './document-matchers.js';
export type { DocumentEvidenceMatch } from './document-matchers.js';

export {
  loadParsedDocuments,
  mergeParsedDocumentsForPaths,
} from './document-store-loaders.js';
export type { LoadParsedDocumentsResult } from './document-store-loaders.js';
