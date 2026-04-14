import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadDocumentLibraries } from './document-libraries.js';
import { MEMORY_ROOT } from './paths.js';
import {
  buildOverviewMarkdown,
  buildUpdatesMarkdown,
  isLibraryKnowledgePagesEnabled,
  isLibraryKnowledgePilotTarget,
} from './library-knowledge-pages-builders.js';
import type { LibraryKnowledgeCompilation } from './library-knowledge-pages-types.js';

const LIBRARY_PAGES_ROOT = path.join(MEMORY_ROOT, 'library-pages');
const SUMMARY_FILE_NAME = 'summary.json';

function resolveLibraryDirectory(libraryKey: string) {
  return path.join(LIBRARY_PAGES_ROOT, String(libraryKey || '').trim());
}

function resolveSummaryFile(libraryKey: string) {
  return path.join(resolveLibraryDirectory(libraryKey), SUMMARY_FILE_NAME);
}

export async function writeLibraryKnowledgeFiles(summary: LibraryKnowledgeCompilation) {
  const libraryDir = resolveLibraryDirectory(summary.libraryKey);
  await fs.mkdir(libraryDir, { recursive: true });
  await fs.writeFile(resolveSummaryFile(summary.libraryKey), JSON.stringify(summary, null, 2), 'utf8');
  await fs.writeFile(path.join(libraryDir, 'overview.md'), buildOverviewMarkdown(summary), 'utf8');
  await fs.writeFile(path.join(libraryDir, 'updates.md'), buildUpdatesMarkdown(summary), 'utf8');
}

export async function removeLibraryKnowledgeFiles(libraryKey: string) {
  await fs.rm(resolveLibraryDirectory(libraryKey), { recursive: true, force: true });
}

export async function readLibraryKnowledgeCompilation(libraryKey: string) {
  try {
    const raw = await fs.readFile(resolveSummaryFile(libraryKey), 'utf8');
    const parsed = JSON.parse(raw) as LibraryKnowledgeCompilation;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function loadLibraryKnowledgeCompilationsForKeys(
  libraryKeys: string[],
  options?: { pilotOnly?: boolean },
) {
  const normalizedKeys = [...new Set((libraryKeys || []).map((item) => String(item || '').trim()).filter(Boolean))];
  if (!normalizedKeys.length) return [];

  const libraries = await loadDocumentLibraries();
  const allowedKeys = new Set(
    libraries
      .filter((library) => normalizedKeys.includes(library.key))
      .filter((library) => isLibraryKnowledgePagesEnabled(library))
      .filter((library) => !options?.pilotOnly || isLibraryKnowledgePilotTarget(library.key))
      .map((library) => library.key),
  );
  if (!allowedKeys.size) return [];

  const summaries = await Promise.all(
    [...allowedKeys].map(async (key) => readLibraryKnowledgeCompilation(key)),
  );
  return summaries.filter((item): item is LibraryKnowledgeCompilation => Boolean(item));
}
