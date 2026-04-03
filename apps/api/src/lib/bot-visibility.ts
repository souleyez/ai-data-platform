import { documentMatchesLibrary, UNGROUPED_LIBRARY_KEY, type DocumentLibrary } from './document-libraries.js';
import type { BotDefinition } from './bot-definitions.js';
import type { ParsedDocument } from './document-parser.js';
import type { OpenClawMemoryDocumentState } from './openclaw-memory-changes.js';

function buildVisibleLibraryKeySet(bot: BotDefinition) {
  const keys = new Set(bot.visibleLibraryKeys);
  if (bot.includeUngrouped) keys.add(UNGROUPED_LIBRARY_KEY);
  return keys;
}

function isFailedDocument(input: { parseStatus?: string; detailParseStatus?: string; availability?: string }) {
  return input.parseStatus === 'error'
    || input.detailParseStatus === 'failed'
    || input.availability === 'parse-error';
}

export function isLibraryVisibleToBot(bot: BotDefinition, library: DocumentLibrary) {
  const visibleKeys = buildVisibleLibraryKeySet(bot);
  return visibleKeys.has(library.key);
}

export function filterLibrariesForBot(bot: BotDefinition, libraries: DocumentLibrary[]) {
  return libraries.filter((library) => isLibraryVisibleToBot(bot, library));
}

export function isDocumentVisibleToBot(
  bot: BotDefinition,
  document: ParsedDocument,
  libraries: DocumentLibrary[],
) {
  if (!bot.enabled) return false;
  if (!bot.includeFailedParseDocuments && isFailedDocument(document)) return false;
  const visibleLibraries = filterLibrariesForBot(bot, libraries);
  return visibleLibraries.some((library) => documentMatchesLibrary(document, library));
}

export function filterDocumentsForBot(
  bot: BotDefinition,
  documents: ParsedDocument[],
  libraries: DocumentLibrary[],
) {
  return documents.filter((document) => isDocumentVisibleToBot(bot, document, libraries));
}

export function isMemoryDocumentVisibleToBot(bot: BotDefinition, document: OpenClawMemoryDocumentState) {
  if (!bot.enabled) return false;
  if (!bot.includeFailedParseDocuments && isFailedDocument(document)) return false;
  const visibleKeys = buildVisibleLibraryKeySet(bot);
  return document.libraryKeys.some((key) => visibleKeys.has(key));
}

export function filterMemoryDocumentsForBot(bot: BotDefinition, documents: OpenClawMemoryDocumentState[]) {
  return documents.filter((document) => isMemoryDocumentVisibleToBot(bot, document));
}
