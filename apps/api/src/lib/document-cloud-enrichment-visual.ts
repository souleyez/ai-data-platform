import type { EvidenceChunk, ParsedDocument } from './document-parser.js';
import {
  refreshDerivedSchemaProfile,
  renderPdfDocumentToImages,
  renderPresentationDocumentToImages,
} from './document-parser.js';
import { runDocumentAdvancedParse } from './document-advanced-parse-provider.js';
import {
  normalizeDocumentImageFieldCandidateKey,
  runDocumentImageVlm,
  type DocumentImageVlmFieldCandidate,
  type DocumentImageVlmPayload,
} from './document-image-vlm-provider.js';
import { enrichTextOne } from './document-cloud-enrichment-text.js';
import {
  type CloudClaim,
  type CloudEntity,
  type CloudEvidenceBlock,
  PDF_VLM_MAX_PAGES,
  PRESENTATION_VLM_MAX_SLIDES,
  clampConfidence,
  findEvidenceChunkIdByText,
  mergeClaims,
  mergeEntities,
  mergeEvidenceChunks,
  sanitizeText,
  uniqStrings,
  hasStructuredValue,
} from './document-cloud-enrichment-common.js';

function extractImageFieldAliases(item: ParsedDocument) {
  const template = item.structuredProfile && typeof item.structuredProfile === 'object' && !Array.isArray(item.structuredProfile)
    ? item.structuredProfile.fieldTemplate as Record<string, unknown> | undefined
    : undefined;
  if (!template?.fieldAliases || typeof template.fieldAliases !== 'object' || Array.isArray(template.fieldAliases)) {
    return {};
  }
  return template.fieldAliases as Record<string, string>;
}

function normalizeImageFieldCandidateValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  const text = String(value ?? '').trim();
  return text || '';
}

function normalizeImageFieldCandidates(item: ParsedDocument, incoming: DocumentImageVlmFieldCandidate[] | undefined) {
  const aliases = extractImageFieldAliases(item);
  const normalized: Array<{
    key: string;
    value: string | string[];
    confidence: number;
    source: 'vlm';
    evidenceText: string;
  }> = [];

  for (const entry of incoming || []) {
    const key = normalizeDocumentImageFieldCandidateKey(entry?.key, aliases);
    if (!key) continue;
    const value = normalizeImageFieldCandidateValue(entry?.value);
    if (!hasStructuredValue(value)) continue;
    normalized.push({
      key,
      value,
      confidence: clampConfidence(entry?.confidence, 0.72),
      source: 'vlm',
      evidenceText: sanitizeText(entry?.evidenceText, 500),
    });
  }

  return normalized;
}

function mergeStringArray(current: string[] | undefined, incoming: unknown) {
  const next = Array.isArray(incoming)
    ? incoming.map((item) => String(item || '').trim()).filter(Boolean)
    : String(incoming || '').split(/[,\n/|；;、]/).map((item) => item.trim()).filter(Boolean);
  return [...new Set([...(current || []), ...next])];
}

function assignCandidateFields(item: ParsedDocument, candidates: Array<{ key: string; value: unknown }>) {
  const next = {
    ...item,
    contractFields: { ...(item.contractFields || {}) },
    enterpriseGuidanceFields: { ...(item.enterpriseGuidanceFields || {}) },
    orderFields: { ...(item.orderFields || {}) },
    resumeFields: { ...(item.resumeFields || {}) },
  };

  for (const candidate of candidates) {
    const key = candidate.key;
    const value = candidate.value;
    if (!hasStructuredValue(value)) continue;
    if (['contractNo', 'partyA', 'partyB', 'amount', 'signDate', 'effectiveDate', 'paymentTerms', 'duration'].includes(key)) {
      if (!hasStructuredValue((next.contractFields as Record<string, unknown>)[key])) {
        (next.contractFields as Record<string, unknown>)[key] = value;
      }
      continue;
    }
    if (['businessSystem', 'documentKind', 'applicableScope', 'operationEntry'].includes(key)) {
      if (!hasStructuredValue((next.enterpriseGuidanceFields as Record<string, unknown>)[key])) {
        (next.enterpriseGuidanceFields as Record<string, unknown>)[key] = value;
      }
      continue;
    }
    if (['approvalLevels', 'policyFocus', 'contacts'].includes(key)) {
      const current = (next.enterpriseGuidanceFields as Record<string, unknown>)[key];
      (next.enterpriseGuidanceFields as Record<string, unknown>)[key] = mergeStringArray(Array.isArray(current) ? current.map((entry) => String(entry || '')) : [], value);
      continue;
    }
    if (['period', 'platform', 'orderCount', 'netSales', 'grossMargin', 'topCategory', 'inventoryStatus', 'replenishmentAction'].includes(key)) {
      if (!hasStructuredValue((next.orderFields as Record<string, unknown>)[key])) {
        (next.orderFields as Record<string, unknown>)[key] = value;
      }
      continue;
    }
    if (['candidateName', 'targetRole', 'currentRole', 'yearsOfExperience', 'education', 'major', 'expectedCity', 'expectedSalary', 'latestCompany'].includes(key)) {
      if (!hasStructuredValue((next.resumeFields as Record<string, unknown>)[key])) {
        (next.resumeFields as Record<string, unknown>)[key] = value;
      }
      continue;
    }
    if (['companies', 'skills', 'highlights', 'projectHighlights', 'itProjectHighlights'].includes(key)) {
      const current = (next.resumeFields as Record<string, unknown>)[key];
      (next.resumeFields as Record<string, unknown>)[key] = mergeStringArray(Array.isArray(current) ? current.map((entry) => String(entry || '')) : [], value);
    }
  }

  return next;
}

function buildImageStructuredFieldDetails(
  item: ParsedDocument,
  candidates: Array<{
    key: string;
    value: unknown;
    confidence: number;
    source: 'vlm';
    evidenceText: string;
  }>,
  evidenceChunks: EvidenceChunk[] | undefined,
) {
  const existing = item.structuredProfile && typeof item.structuredProfile === 'object' && !Array.isArray(item.structuredProfile)
    ? (item.structuredProfile.fieldDetails as Record<string, unknown> | undefined)
    : undefined;
  const next: Record<string, unknown> = { ...(existing || {}) };

  for (const candidate of candidates) {
    if (!candidate.key || !hasStructuredValue(candidate.value)) continue;
    if (next[candidate.key]) continue;
    next[candidate.key] = {
      value: candidate.value,
      confidence: candidate.confidence,
      source: candidate.source,
      evidenceChunkId: findEvidenceChunkIdByText(evidenceChunks, candidate.evidenceText),
    };
  }

  return next;
}

function buildImageStructuredTopLevelFields(
  currentProfile: Record<string, unknown>,
  candidates: Array<{ key: string; value: unknown }>,
) {
  const next: Record<string, unknown> = {};
  for (const candidate of candidates) {
    if (!candidate.key || !hasStructuredValue(candidate.value)) continue;
    if (hasStructuredValue(currentProfile[candidate.key])) continue;
    next[candidate.key] = candidate.value;
  }
  return next;
}

function buildImageUnderstandingPayload(
  structured: DocumentImageVlmPayload,
  candidates: Array<{
    key: string;
    value: unknown;
    confidence: number;
    source: 'vlm';
    evidenceText: string;
  }>,
) {
  return {
    documentKind: sanitizeText(structured.documentKind, 120),
    layoutType: sanitizeText(structured.layoutType, 120),
    visualSummary: sanitizeText(structured.visualSummary || structured.summary, 600),
    chartOrTableDetected: Boolean(structured.chartOrTableDetected),
    tableLikeSignals: uniqStrings((structured.tableLikeSignals || []).map((entry) => sanitizeText(entry, 120))),
    extractedFields: Object.fromEntries(
      candidates
        .filter((entry) => entry.key && hasStructuredValue(entry.value))
        .map((entry) => [entry.key, entry.value]),
    ),
  };
}

function buildImageFullText(item: ParsedDocument, structured: DocumentImageVlmPayload) {
  const transcribedText = sanitizeText(structured.transcribedText, 6000);
  const visualSummary = sanitizeText(structured.visualSummary, 1000);
  const blocks = [
    `Image file: ${item.name}`,
    visualSummary ? `Visual summary:\n${visualSummary}` : '',
    transcribedText ? `Visual transcription:\n${transcribedText}` : '',
  ].filter(Boolean);
  return blocks.join('\n\n');
}

type RenderedPageResult = {
  pageNumber: number;
  model: string;
  payload: DocumentImageVlmPayload;
};

function buildRenderedPageBlock(input: {
  pageNumber: number;
  pageLabel: string;
  payload: DocumentImageVlmPayload;
}) {
  const visualSummary = sanitizeText(input.payload.visualSummary || input.payload.summary, 1200);
  const transcribedText = sanitizeText(input.payload.transcribedText, 6000);
  return [
    `# ${input.pageLabel} ${input.pageNumber}`,
    visualSummary ? `Visual summary:\n${visualSummary}` : '',
    transcribedText ? `Visual transcription:\n${transcribedText}` : '',
  ].filter(Boolean).join('\n\n');
}

function applyRenderedPageCollection(
  item: ParsedDocument,
  pageResults: RenderedPageResult[],
  options: {
    pageLabel: string;
    markerLabel: string;
    parseMethodSuffix: string;
    understandingKey: 'presentationUnderstanding' | 'pdfUnderstanding';
    countKey: 'slideCount' | 'pageCount';
    itemsKey: 'slides' | 'pages';
  },
) {
  const evidenceBlocks = pageResults.flatMap(({ pageNumber, payload }) => (payload.evidenceBlocks || []).map((block) => ({
    title: sanitizeText(block.title, 120) ? `${options.pageLabel} ${pageNumber} · ${sanitizeText(block.title, 120)}` : `${options.pageLabel} ${pageNumber}`,
    text: sanitizeText(block.text, 1000),
  } as CloudEvidenceBlock)));
  const evidenceChunks = mergeEvidenceChunks(item.evidenceChunks, evidenceBlocks);
  const incomingEntities = pageResults.flatMap(({ payload }) => (payload.entities as CloudEntity[] | undefined) || []);
  const incomingClaims = pageResults.flatMap(({ payload }) => (payload.claims as CloudClaim[] | undefined) || []);
  const entities = mergeEntities(item.entities, incomingEntities, evidenceChunks);
  const claims = mergeClaims(item.claims, incomingClaims, evidenceChunks);
  const topicTags = uniqStrings([
    ...(item.topicTags || []),
    ...pageResults.flatMap(({ payload }) => payload.topicTags || []),
  ]).slice(0, 16);
  const firstSummary = pageResults
    .map(({ payload }) => sanitizeText(payload.summary || payload.visualSummary, 500))
    .find(Boolean);
  const summary = firstSummary || item.summary;
  const fieldCandidates = normalizeImageFieldCandidates(
    item,
    pageResults.flatMap(({ payload }) => payload.fieldCandidates || []),
  );
  const visualFullText = [
    item.fullText || '',
    `[${options.markerLabel}]`,
    ...pageResults.map(({ pageNumber, payload }) => buildRenderedPageBlock({
      pageNumber,
      pageLabel: options.pageLabel,
      payload,
    })),
  ].filter(Boolean).join('\n\n');
  const withCandidateFields = assignCandidateFields({
    ...item,
    parseStatus: 'parsed',
    canonicalParseStatus: 'ready',
    parseMethod: item.parseMethod?.includes(options.parseMethodSuffix)
      ? item.parseMethod
      : `${item.parseMethod || options.pageLabel.toLowerCase()}+${options.parseMethodSuffix}`,
    parseStage: 'detailed',
    detailParseStatus: 'succeeded',
    detailParsedAt: new Date().toISOString(),
    detailParseAttempts: Math.max(1, Number(item.detailParseAttempts || 0)),
    detailParseError: undefined,
    summary,
    excerpt: summary || item.excerpt,
    fullText: visualFullText,
    extractedChars: sanitizeText(visualFullText, 20000).length,
    topicTags,
    evidenceChunks,
    entities,
    claims,
    riskLevel: pageResults.map(({ payload }) => payload.riskLevel).find(Boolean) || item.riskLevel,
    cloudStructuredAt: new Date().toISOString(),
    cloudStructuredModel: uniqStrings(pageResults.map(({ model }) => model)).join(', '),
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
      [options.understandingKey]: {
        [options.countKey]: pageResults.length,
        [options.itemsKey]: pageResults.map(({ pageNumber, payload }) => ({
          pageNumber,
          documentKind: sanitizeText(payload.documentKind, 120),
          layoutType: sanitizeText(payload.layoutType, 120),
          visualSummary: sanitizeText(payload.visualSummary || payload.summary, 600),
          transcribedText: sanitizeText(payload.transcribedText, 2000),
        })),
      },
    },
  };
}

export async function enrichImageOne(
  item: ParsedDocument,
  runImageParse = runDocumentImageVlm,
): Promise<ParsedDocument> {
  const result = await runImageParse({ item, imagePath: item.path });
  if (!result?.parsed) return item;

  const structured = result.parsed;
  const evidenceChunks = mergeEvidenceChunks(item.evidenceChunks, structured.evidenceBlocks);
  const entities = mergeEntities(item.entities, structured.entities as CloudEntity[] | undefined, evidenceChunks);
  const claims = mergeClaims(item.claims, structured.claims as CloudClaim[] | undefined, evidenceChunks);
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
