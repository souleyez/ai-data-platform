import type { ParsedDocument } from './document-parser.js';
import {
  refreshDerivedSchemaProfile,
  renderPdfDocumentToImages,
  renderPresentationDocumentToImages,
} from './document-parser.js';
import { runDocumentAdvancedParse } from './document-advanced-parse-provider.js';
import { runDocumentImageVlm } from './document-image-vlm-provider.js';
import { type CloudEntity, PDF_VLM_MAX_PAGES, PRESENTATION_VLM_MAX_SLIDES, mergeClaims, mergeEntities, mergeEvidenceChunks, sanitizeText, uniqStrings } from './document-cloud-enrichment-common.js';
import { enrichTextOne } from './document-cloud-enrichment-text.js';
import { applyRenderedPageCollection, type RenderedPageResult } from './document-cloud-enrichment-visual-collection.js';
import {
  assignCandidateFields,
  buildImageFullText,
  buildImageStructuredFieldDetails,
  buildImageStructuredTopLevelFields,
  buildImageUnderstandingPayload,
  normalizeImageFieldCandidates,
} from './document-cloud-enrichment-visual-support.js';

export async function enrichImageOne(
  item: ParsedDocument,
  runImageParse = runDocumentImageVlm,
): Promise<ParsedDocument> {
  const result = await runImageParse({ item, imagePath: item.path });
  if (!result?.parsed) return item;

  const structured = result.parsed;
  const evidenceChunks = mergeEvidenceChunks(item.evidenceChunks, structured.evidenceBlocks);
  const entities = mergeEntities(item.entities, structured.entities as CloudEntity[] | undefined, evidenceChunks);
  const claims = mergeClaims(item.claims, structured.claims, evidenceChunks);
  const topicTags = uniqStrings([...(item.topicTags || []), ...(structured.topicTags || [])]).slice(0, 16);
  const summary = sanitizeText(structured.summary || structured.visualSummary, 500) || item.summary;
  const fieldCandidates = normalizeImageFieldCandidates(item, structured.fieldCandidates);
  const withCandidateFields = assignCandidateFields({
    ...item,
    parseStatus: 'parsed',
    canonicalParseStatus: 'ready',
    parseMethod: item.parseMethod?.includes('image-ocr')
      ? 'image-ocr+vlm'
      : 'image-vlm',
    parseStage: 'detailed',
    detailParseStatus: 'succeeded',
    detailParsedAt: new Date().toISOString(),
    detailParseAttempts: Math.max(1, Number(item.detailParseAttempts || 0)),
    detailParseError: undefined,
    summary,
    excerpt: summary || item.excerpt,
    fullText: buildImageFullText(item, structured),
    extractedChars: sanitizeText(structured.transcribedText || structured.visualSummary, 8000).length,
    topicTags,
    evidenceChunks,
    entities,
    claims,
    riskLevel: structured.riskLevel || item.riskLevel,
    cloudStructuredAt: new Date().toISOString(),
    cloudStructuredModel: result.model,
  }, fieldCandidates);

  const refreshed = refreshDerivedSchemaProfile(withCandidateFields);
  const currentProfile = refreshed.structuredProfile && typeof refreshed.structuredProfile === 'object' && !Array.isArray(refreshed.structuredProfile)
    ? refreshed.structuredProfile as Record<string, unknown>
    : {};

  return {
    ...refreshed,
    structuredProfile: {
      ...currentProfile,
      ...buildImageStructuredTopLevelFields(currentProfile, fieldCandidates),
      fieldDetails: buildImageStructuredFieldDetails(refreshed, fieldCandidates, evidenceChunks),
      imageUnderstanding: buildImageUnderstandingPayload(structured, fieldCandidates),
    },
  };
}

export async function enrichPresentationOne(
  item: ParsedDocument,
  runImageParse = runDocumentImageVlm,
  runTextParse = runDocumentAdvancedParse,
  renderPresentation = renderPresentationDocumentToImages,
): Promise<ParsedDocument> {
  const rendered = await renderPresentation(item.path, { maxSlides: PRESENTATION_VLM_MAX_SLIDES });
  if (!rendered?.images?.length) {
    return enrichTextOne(item, runTextParse);
  }

  try {
    const slideResults: RenderedPageResult[] = [];

    for (const image of rendered.images) {
      const slideItem: ParsedDocument = {
        ...item,
        title: `${item.title || item.name} - Slide ${image.pageNumber}`,
      };
      const result = await runImageParse({ item: slideItem, imagePath: image.imagePath });
      if (result?.parsed) {
        slideResults.push({
          pageNumber: image.pageNumber,
          model: result.model,
          payload: result.parsed,
        });
      }
    }

    if (!slideResults.length) {
      return enrichTextOne(item, runTextParse);
    }
    return applyRenderedPageCollection(item, slideResults, {
      pageLabel: 'Slide',
      markerLabel: 'Presentation VLM understanding',
      parseMethodSuffix: 'presentation-vlm',
      understandingKey: 'presentationUnderstanding',
      countKey: 'slideCount',
      itemsKey: 'slides',
    });
  } finally {
    await rendered.cleanup().catch(() => undefined);
  }
}

export async function enrichPdfOne(
  item: ParsedDocument,
  runImageParse = runDocumentImageVlm,
  runTextParse = runDocumentAdvancedParse,
  renderPdf = renderPdfDocumentToImages,
): Promise<ParsedDocument> {
  const rendered = await renderPdf(item.path, { maxPages: PDF_VLM_MAX_PAGES });
  if (!rendered?.images?.length) {
    return enrichTextOne(item, runTextParse);
  }

  try {
    const pageResults: RenderedPageResult[] = [];

    for (const image of rendered.images) {
      const pageItem: ParsedDocument = {
        ...item,
        title: `${item.title || item.name} - Page ${image.pageNumber}`,
      };
      const result = await runImageParse({ item: pageItem, imagePath: image.imagePath });
      if (result?.parsed) {
        pageResults.push({
          pageNumber: image.pageNumber,
          model: result.model,
          payload: result.parsed,
        });
      }
    }

    if (!pageResults.length) {
      return enrichTextOne(item, runTextParse);
    }

    return applyRenderedPageCollection(item, pageResults, {
      pageLabel: 'Page',
      markerLabel: 'PDF VLM understanding',
      parseMethodSuffix: 'pdf-vlm',
      understandingKey: 'pdfUnderstanding',
      countKey: 'pageCount',
      itemsKey: 'pages',
    });
  } finally {
    await rendered.cleanup().catch(() => undefined);
  }
}
