import { documentMatchesLibrary, UNGROUPED_LIBRARY_KEY, type DocumentLibrary } from './document-libraries.js';
import type { BotDefinition } from './bot-definitions.js';
import type { ParsedDocument } from './document-parser.js';
import type { OpenClawMemoryDocumentState } from './openclaw-memory-changes.js';

export function buildVisibleLibraryKeySet(bot: BotDefinition, libraries: DocumentLibrary[]) {
  const explicitKeys = new Set(bot.visibleLibraryKeys);
  const hasExplicitFilter = explicitKeys.size > 0;
  const keys = new Set<string>();

  for (const library of libraries) {
    if (!library) continue;
    if (library.key === UNGROUPED_LIBRARY_KEY && !bot.includeUngrouped) continue;
    if ((library.permissionLevel ?? 0) < (bot.libraryAccessLevel ?? 0)) continue;
    if (hasExplicitFilter && !explicitKeys.has(library.key)) continue;
    keys.add(library.key);
  }

  return keys;
}

function isFailedDocument(input: { parseStatus?: string; detailParseStatus?: string; availability?: string }) {
  return input.parseStatus === 'error'
    || input.detailParseStatus === 'failed'
    || input.availability === 'parse-error';
}

export function isLibraryVisibleToBot(bot: BotDefinition, library: DocumentLibrary) {
  return buildVisibleLibraryKeySet(bot, [library]).has(library.key);
}

export function filterLibrariesForBot(bot: BotDefinition, libraries: DocumentLibrary[]) {
  const visibleKeys = buildVisibleLibraryKeySet(bot, libraries);
  return libraries.filter((library) => visibleKeys.has(library.key));
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

export function isMemoryDocumentVisibleToBot(
  bot: BotDefinition,
  document: OpenClawMemoryDocumentState,
  visibleLibraryKeys: Set<string>,
) {
  if (!bot.enabled) return false;
  if (!bot.includeFailedParseDocuments && isFailedDocument(document)) return false;
  return document.libraryKeys.some((key) => visibleLibraryKeys.has(key));
}

export function filterMemoryDocumentsForBot(
  bot: BotDefinition,
  documents: OpenClawMemoryDocumentState[],
  visibleLibraryKeys: Set<string>,
) {
  return documents.filter((document) => isMemoryDocumentVisibleToBot(bot, document, visibleLibraryKeys));
}
