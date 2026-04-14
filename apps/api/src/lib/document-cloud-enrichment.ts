import type { ParsedDocument } from './document-parser.js';
import {
  CLOUD_ENRICH_CONCURRENCY,
  CLOUD_ENRICH_ENABLED,
  CLOUD_ENRICH_MAX_PER_BATCH,
  enrichImageOne,
  enrichPdfOne,
  enrichPresentationOne,
  enrichTextOne,
  isImageDocument,
  isPresentationDocument,
  shouldAttemptTextStructuring,
  shouldAttemptVisualFallback,
  shouldUsePdfVisualFallback,
  type DocumentCloudEnhancementOptions,
} from './document-cloud-enrichment-helpers.js';
import { getDocumentAdvancedParseProviderMode, runDocumentAdvancedParse } from './document-advanced-parse-provider.js';
import { runDocumentImageVlm } from './document-image-vlm-provider.js';
import { renderPdfDocumentToImages, renderPresentationDocumentToImages } from './document-parser.js';

export type { DocumentCloudEnhancementOptions } from './document-cloud-enrichment-helpers.js';

export async function enhanceParsedDocumentsWithCloud(
  items: ParsedDocument[],
  options?: DocumentCloudEnhancementOptions,
) {
  const withVisualFallbacks = await applyParsedDocumentVisualFallbacks(items, options);
  return applyParsedDocumentTextStructuring(withVisualFallbacks, options);
}

export async function applyParsedDocumentVisualFallbacks(
  items: ParsedDocument[],
  options?: DocumentCloudEnhancementOptions,
) {
  if (
    !CLOUD_ENRICH_ENABLED
    || CLOUD_ENRICH_MAX_PER_BATCH <= 0
  ) {
    return items;
  }

  const candidateIndexes = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => shouldAttemptVisualFallback(item))
    .slice(0, CLOUD_ENRICH_MAX_PER_BATCH);

  if (!candidateIndexes.length) {
    return items;
  }

  const output = [...items];
  let cursor = 0;

  async function worker() {
    while (cursor < candidateIndexes.length) {
      const current = candidateIndexes[cursor];
      cursor += 1;
      try {
        output[current.index] = isImageDocument(current.item)
          ? await enrichImageOne(current.item, options?.runImageParse || runDocumentImageVlm)
          : isPresentationDocument(current.item)
            ? await enrichPresentationOne(
                current.item,
                options?.runImageParse || runDocumentImageVlm,
                options?.runTextParse || runDocumentAdvancedParse,
                options?.renderPresentation || renderPresentationDocumentToImages,
              )
            : shouldUsePdfVisualFallback(current.item)
              ? await enrichPdfOne(
                  current.item,
                  options?.runImageParse || runDocumentImageVlm,
                  options?.runTextParse || runDocumentAdvancedParse,
                  options?.renderPdf || renderPdfDocumentToImages,
                )
              : await enrichTextOne(current.item, options?.runTextParse || runDocumentAdvancedParse);
      } catch {
        output[current.index] = current.item;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CLOUD_ENRICH_CONCURRENCY, candidateIndexes.length) }, () => worker()),
  );

  return output;
}

export async function applyParsedDocumentTextStructuring(
  items: ParsedDocument[],
  options?: DocumentCloudEnhancementOptions,
) {
  const providerMode = getDocumentAdvancedParseProviderMode();
  if (
    !CLOUD_ENRICH_ENABLED
    || CLOUD_ENRICH_MAX_PER_BATCH <= 0
    || providerMode === 'disabled'
  ) {
    return items;
  }

  const candidateIndexes = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => shouldAttemptTextStructuring(item, providerMode))
    .slice(0, CLOUD_ENRICH_MAX_PER_BATCH);

  if (!candidateIndexes.length) {
    return items;
  }

  const output = [...items];
  let cursor = 0;

  async function worker() {
    while (cursor < candidateIndexes.length) {
      const current = candidateIndexes[cursor];
      cursor += 1;
      try {
        output[current.index] = await enrichTextOne(current.item, options?.runTextParse || runDocumentAdvancedParse);
      } catch {
        output[current.index] = current.item;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CLOUD_ENRICH_CONCURRENCY, candidateIndexes.length) }, () => worker()),
  );

  return output;
}
