import { loadDocumentLibraries } from './document-libraries.js';
import {
  isLibraryKnowledgePagesEnabled,
  isLibraryKnowledgePilotTarget,
  normalizeText,
} from './library-knowledge-pages-builders.js';
import { readLibraryKnowledgeCompilation } from './library-knowledge-pages-storage.js';
import type { LibraryKnowledgeCompilation } from './library-knowledge-pages-types.js';

const MAX_CONTEXT_LIBRARIES = 3;
const MAX_CONTEXT_CHARS_PER_LIBRARY = 1800;

function trimSummaryText(value: string, maxChars = MAX_CONTEXT_CHARS_PER_LIBRARY) {
  return normalizeText(value, maxChars);
}

function buildSummarySection(summary: LibraryKnowledgeCompilation) {
  const lines = [
    `## ${summary.libraryLabel}`,
    summary.pilotValidated ? 'Pilot: validated text-governance library summary is enabled for this library.' : '',
    summary.overview ? `Overview: ${trimSummaryText(summary.overview, 420)}` : '',
    summary.keyTopics.length ? `Key topics: ${summary.keyTopics.slice(0, 6).join(' | ')}` : '',
    summary.keyFacts.length ? `Key facts: ${summary.keyFacts.slice(0, 5).join(' | ')}` : '',
    summary.focusedFieldCoverage?.length
      ? `Field coverage: ${summary.focusedFieldCoverage
        .filter((entry) => entry.populatedDocumentCount > 0)
        .slice(0, 4)
        .map((entry) => `${entry.alias} ${Math.round(entry.coverageRatio * 100)}%`)
        .join(' | ')}`
      : '',
    summary.fieldConflicts?.length
      ? `Field conflicts: ${summary.fieldConflicts.slice(0, 3).map((entry) => `${entry.alias}:${entry.values.join('/')}`).join(' | ')}`
      : '',
    summary.recentUpdates.length
      ? `Recent updates: ${summary.recentUpdates.slice(0, 3).map((item) => item.title).join(' | ')}`
      : '',
  ].filter(Boolean);
  return trimSummaryText(lines.join('\n'), MAX_CONTEXT_CHARS_PER_LIBRARY);
}

export async function buildLibraryKnowledgePagesContextBlock(libraries: Array<{ key: string; label: string }>) {
  const libraryMap = new Map(
    (await loadDocumentLibraries()).map((library) => [library.key, library] as const),
  );

  const candidates = libraries
    .map((library) => ({
      key: String(library.key || '').trim(),
      settings: libraryMap.get(String(library.key || '').trim()),
    }))
    .filter((entry) => entry.key && entry.settings && isLibraryKnowledgePagesEnabled(entry.settings))
    .filter((entry) => isLibraryKnowledgePilotTarget(entry.key))
    .slice(0, MAX_CONTEXT_LIBRARIES);

  if (!candidates.length) return '';

  const summaries = await Promise.all(
    candidates.map(async (item) => readLibraryKnowledgeCompilation(item.key)),
  );
  const visibleSections = summaries
    .filter((item): item is LibraryKnowledgeCompilation => Boolean(item))
    .map(buildSummarySection)
    .filter(Boolean);

  if (!visibleSections.length) return '';

  return [
    'Pilot compiled library knowledge summary (derived cross-document layer; verify details against structured fields and raw evidence):',
    ...visibleSections,
  ].join('\n\n');
}
