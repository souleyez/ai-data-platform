import path from 'node:path';
import { promises as fs } from 'node:fs';
import { loadDocumentLibraries } from './document-libraries.js';
import { type BizCategory } from './document-config.js';
import { removeDocumentOverrides, saveDocumentOverride } from './document-overrides.js';
import { removeDocumentsFromCache } from './document-store.js';
import { buildPreviewItemFromDocument } from './ingest-feedback.js';
import { removeRetainedDocument } from './retained-documents.js';
import { STORAGE_FILES_DIR } from './paths.js';
import { loadIndexedDocumentMap } from './document-route-loaders.js';

const VALID_BIZ_CATEGORIES: BizCategory[] = ['paper', 'contract', 'daily', 'invoice', 'order', 'service', 'inventory'];

export async function saveConfirmedDocumentClassifications(
  updates: Array<{ id?: string; bizCategory?: BizCategory }>,
) {
  const libraries = await loadDocumentLibraries();
  const { byId } = await loadIndexedDocumentMap();
  const results = [] as Array<{ id: string; bizCategory: BizCategory; sourceName: string; confirmedAt: string }>;

  for (const update of updates) {
    const found = update.id ? byId.get(update.id) : null;
    if (!found || !update.bizCategory || !VALID_BIZ_CATEGORIES.includes(update.bizCategory)) continue;
    const saved = await saveDocumentOverride(found.path, { bizCategory: update.bizCategory });
    results.push({
      id: update.id as string,
      bizCategory: update.bizCategory,
      sourceName: found.name,
      confirmedAt: saved.confirmedAt,
    });
  }

  const ingestItems = results.reduce<ReturnType<typeof buildPreviewItemFromDocument>[]>((acc, result) => {
    const found = byId.get(result.id);
    if (!found) return acc;
    acc.push(buildPreviewItemFromDocument({
      ...found,
      confirmedBizCategory: result.bizCategory,
      categoryConfirmedAt: result.confirmedAt,
    }, 'file', undefined, libraries));
    return acc;
  }, []);

  return { ingestItems, results };
}

export async function saveIgnoredDocuments(updates: Array<{ id?: string; ignored?: boolean }>) {
  const { byId } = await loadIndexedDocumentMap();
  const results = [] as Array<{ id: string; removed: boolean; deletedFile: boolean }>;
  const removedPaths: string[] = [];

  for (const update of updates) {
    const found = update.id ? byId.get(update.id) : null;
    if (!found || update.ignored !== true) continue;

    await removeRetainedDocument(found.path);
    removedPaths.push(found.path);

    const normalizedPath = path.resolve(found.path).toLowerCase();
    const managedRoot = path.resolve(STORAGE_FILES_DIR).toLowerCase();
    let deletedFile = false;

    if (normalizedPath.startsWith(managedRoot)) {
      try {
        await fs.rm(found.path, { force: true });
        deletedFile = true;
      } catch {
        deletedFile = false;
      }
    }

    results.push({ id: update.id as string, removed: true, deletedFile });
  }

  if (removedPaths.length) {
    await removeDocumentOverrides(removedPaths);
    await removeDocumentsFromCache(removedPaths);
  }

  return results;
}
