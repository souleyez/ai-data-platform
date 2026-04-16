import type { ParsedDocument } from './document-parser.js';
import type { RetrievalResult } from './document-retrieval.js';
import {
  buildLibraryFallbackRetrieval,
  buildKnowledgeRetrievalQuery,
  clampPositiveInt,
  filterDocumentsByContentFocus,
  filterDocumentsByTimeRange,
  formatStructuredProfile,
  sortDocumentsForKnowledgeContext,
  toText,
} from './knowledge-evidence-support.js';
import type { KnowledgeContextOptions, KnowledgeLibrary, KnowledgeScope } from './knowledge-evidence-types.js';

export type { KnowledgeContextOptions, KnowledgeLibrary, KnowledgeScope } from './knowledge-evidence-types.js';
export {
  buildLibraryFallbackRetrieval,
  buildKnowledgeRetrievalQuery,
  filterDocumentsByContentFocus,
  filterDocumentsByTimeRange,
} from './knowledge-evidence-support.js';

export function buildKnowledgeContext(
  requestText: string,
  libraries: KnowledgeLibrary[],
  retrieval: RetrievalResult | { documents: any[]; evidenceMatches: any[] },
  scope?: KnowledgeScope,
  options?: KnowledgeContextOptions,
) {
  const maxDocuments = clampPositiveInt(options?.maxDocuments, 6, 12);
  const maxEvidence = clampPositiveInt(options?.maxEvidence, 8, 16);
  const maxClaimsPerDocument = clampPositiveInt(options?.maxClaimsPerDocument, 2, 4);
  const maxEvidenceChunksPerDocument = clampPositiveInt(options?.maxEvidenceChunksPerDocument, 2, 4);
  const summaryLength = clampPositiveInt(options?.summaryLength, 220, 400);
  const includeExcerpt = options?.includeExcerpt !== false;

  const documents = sortDocumentsForKnowledgeContext(retrieval.documents).slice(0, maxDocuments);
  const evidence = retrieval.evidenceMatches.slice(0, maxEvidence);
  const documentBlocks = documents.map((item: ParsedDocument, index: number) => {
    const evidenceChunks = (item.evidenceChunks || [])
      .slice(0, maxEvidenceChunksPerDocument)
      .map((chunk) => String(chunk?.text || '').trim())
      .filter(Boolean);
    const claims = (item.claims || [])
      .slice(0, maxClaimsPerDocument)
      .map((claim) => [claim.subject, claim.predicate, claim.object].filter(Boolean).join(' '))
      .filter(Boolean);
    const profile = formatStructuredProfile(item.structuredProfile, options);
    const summary = toText(item.summary).slice(0, summaryLength)
      || (includeExcerpt ? toText(item.excerpt).slice(0, summaryLength) : '')
      || 'No summary';

    return [
      `Document ${index + 1}: ${item.title || item.name}`,
      `Type: ${item.schemaType || item.category || 'generic'}`,
      `Summary: ${summary}`,
      profile ? `Structured profile:\n${profile}` : '',
      claims.length ? `Claims:\n${claims.map((text, claimIndex) => `${claimIndex + 1}. ${text}`).join('\n')}` : '',
      evidenceChunks.length
        ? `Evidence:\n${evidenceChunks.map((text, evidenceIndex) => `${evidenceIndex + 1}. ${text}`).join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  });

  return [
    `User request: ${requestText}`,
    `Priority libraries: ${libraries.map((item) => item.label).join(', ') || 'unspecified'}`,
    scope?.timeRange ? `Time range: ${scope.timeRange}` : '',
    scope?.contentFocus ? `Content focus: ${scope.contentFocus}` : '',
    '',
    'Detailed documents:',
    ...documentBlocks,
    '',
    'High-signal evidence:',
    ...evidence.map(
      (item: any, index: number) =>
        `${index + 1}. ${item.item.title || item.item.name}\nEvidence: ${String(item.chunkText || '').trim()}`,
    ),
  ].filter(Boolean).join('\n\n');
}
