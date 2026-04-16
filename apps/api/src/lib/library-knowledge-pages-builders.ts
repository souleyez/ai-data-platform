import type { DocumentLibrary } from './document-libraries.js';
import type { ParsedDocument } from './document-parser.js';
import type { LibraryKnowledgeCompilation } from './library-knowledge-pages-types.js';
import { buildFocusedFieldCoverage, collectKeyFacts } from './library-knowledge-pages-focused-fields.js';
import { buildOverviewMarkdown, buildUpdatesMarkdown } from './library-knowledge-pages-markdown.js';
import {
  buildOverviewText,
  buildRecentUpdates,
  buildRepresentativeDocuments,
  collectKeyTopics,
  deriveSuggestedQuestions,
  isLibraryKnowledgePagesEnabled,
  isLibraryKnowledgePilotTarget,
  normalizeMode,
  normalizeText,
  sortDocumentsByRecency,
} from './library-knowledge-pages-support.js';

export function buildLibraryKnowledgeCompilation(
  library: DocumentLibrary,
  items: ParsedDocument[],
  changedItems: ParsedDocument[],
  reason: string,
): LibraryKnowledgeCompilation {
  const sortedItems = sortDocumentsByRecency(items);
  const focusedFieldSummary = buildFocusedFieldCoverage(library, sortedItems);
  const keyTopics = collectKeyTopics(sortedItems);
  const keyFacts = collectKeyFacts(sortedItems, focusedFieldSummary.coverage);
  const representativeDocuments = buildRepresentativeDocuments(sortedItems);
  const recentUpdates = buildRecentUpdates(sortedItems, changedItems);
  const sourceDocumentIds = representativeDocuments.map((item) => item.documentId).filter(Boolean);
  const sourceTitles = representativeDocuments.map((item) => item.title).filter(Boolean);
  const overview = buildOverviewText({
    library,
    keyTopics,
    keyFacts,
    focusedFieldCoverage: focusedFieldSummary.coverage,
    representativeDocuments,
  });

  return {
    version: 1,
    libraryKey: library.key,
    libraryLabel: library.label,
    description: normalizeText(library.description, 240),
    mode: normalizeMode(library.knowledgePagesMode),
    updatedAt: new Date().toISOString(),
    trigger: normalizeText(reason, 120) || 'library-sync',
    documentCount: sortedItems.length,
    overview,
    keyTopics,
    keyFacts,
    focusedFieldSet: focusedFieldSummary.fieldSet || undefined,
    focusedFieldCoverage: focusedFieldSummary.coverage,
    fieldConflicts: focusedFieldSummary.conflicts,
    suggestedQuestions: deriveSuggestedQuestions(library, sortedItems),
    representativeDocuments,
    recentUpdates,
    sourceDocumentIds,
    sourceTitles,
    pilotValidated: isLibraryKnowledgePilotTarget(library.key),
  };
}

export {
  buildOverviewMarkdown,
  buildUpdatesMarkdown,
  isLibraryKnowledgePagesEnabled,
  isLibraryKnowledgePilotTarget,
  normalizeMode,
  normalizeText,
  sortDocumentsByRecency,
};
