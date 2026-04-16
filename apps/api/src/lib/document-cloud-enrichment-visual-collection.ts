import type { ParsedDocument } from './document-parser.js';
import { refreshDerivedSchemaProfile } from './document-parser.js';
import type { DocumentImageVlmPayload } from './document-image-vlm-provider.js';
import {
  type CloudClaim,
  type CloudEntity,
  type CloudEvidenceBlock,
  mergeClaims,
  mergeEntities,
  mergeEvidenceChunks,
  sanitizeText,
  uniqStrings,
} from './document-cloud-enrichment-common.js';
import {
  assignCandidateFields,
  buildImageStructuredFieldDetails,
  buildImageStructuredTopLevelFields,
  normalizeImageFieldCandidates,
} from './document-cloud-enrichment-visual-support.js';

export type RenderedPageResult = {
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

export function applyRenderedPageCollection(
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
