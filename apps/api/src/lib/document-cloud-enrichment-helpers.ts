import {
  renderPdfDocumentToImages,
  renderPresentationDocumentToImages,
  type ParsedDocument,
} from './document-parser.js';
import { runDocumentAdvancedParse } from './document-advanced-parse-provider.js';
import { runDocumentImageVlm } from './document-image-vlm-provider.js';

export {
  CLOUD_ENRICH_CONCURRENCY,
  CLOUD_ENRICH_ENABLED,
  CLOUD_ENRICH_MAX_PER_BATCH,
  isImageDocument,
  isPresentationDocument,
  shouldAttemptTextStructuring,
  shouldAttemptVisualFallback,
  shouldUsePdfVisualFallback,
} from './document-cloud-enrichment-common.js';
export { enrichTextOne } from './document-cloud-enrichment-text.js';
export {
  enrichImageOne,
  enrichPdfOne,
  enrichPresentationOne,
} from './document-cloud-enrichment-visual.js';

export type DocumentCloudEnhancementOptions = {
  runTextParse?: typeof runDocumentAdvancedParse;
  runImageParse?: typeof runDocumentImageVlm;
  renderPresentation?: typeof renderPresentationDocumentToImages;
  renderPdf?: typeof renderPdfDocumentToImages;
};

export type { ParsedDocument };
