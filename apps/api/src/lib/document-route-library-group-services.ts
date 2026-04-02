import { loadDocumentLibraries, UNGROUPED_LIBRARY_KEY } from './document-libraries.js';
import { saveDocumentOverride } from './document-overrides.js';
import { buildPreviewItemFromDocument, resolveSuggestedLibraryKeys } from './ingest-feedback.js';
import { loadIndexedDocumentMap } from './document-route-loaders.js';

type IndexedDocumentState = Awaited<ReturnType<typeof loadIndexedDocumentMap>>;
type ParsedDocumentItem = IndexedDocumentState['items'][number];
type LoadedLibraries = Awaited<ReturnType<typeof loadDocumentLibraries>>;

export function resolveAutomaticLibraryGroups(
  item: Pick<ParsedDocumentItem,
    'bizCategory'
    | 'confirmedBizCategory'
    | 'category'
    | 'schemaType'
    | 'parseStatus'
    | 'title'
    | 'summary'
    | 'excerpt'
    | 'topicTags'
    | 'groups'
  >,
  libraries: LoadedLibraries,
) {
  const suggestedGroups = resolveSuggestedLibraryKeys(item as ParsedDocumentItem, libraries).filter((key) => {
    const matched = libraries.find((library) => library.key === key);
    return matched && !matched.isDefault;
  });

  if (suggestedGroups.length) return suggestedGroups;

  const effectiveCategory = item.confirmedBizCategory || item.bizCategory || 'general';
  const shouldFallbackToUngrouped =
    item.parseStatus !== 'parsed'
    || effectiveCategory === 'general'
    || item.category === 'resume'
    || item.schemaType === 'resume';

  return shouldFallbackToUngrouped ? [UNGROUPED_LIBRARY_KEY] : [];
}

export async function autoAssignSuggestedLibraries(items: ParsedDocumentItem[], libraries: LoadedLibraries) {
  let updatedCount = 0;
  let ungroupedCount = 0;

  for (const item of items) {
    if (item.confirmedGroups?.length) continue;

    const nextGroups = resolveAutomaticLibraryGroups(item, libraries);
    if (!nextGroups?.length) continue;

    await saveDocumentOverride(item.path, { groups: nextGroups });
    updatedCount += 1;
    if (nextGroups.length === 1 && nextGroups[0] === UNGROUPED_LIBRARY_KEY) {
      ungroupedCount += 1;
    }
  }

  return {
    updatedCount,
    ungroupedCount,
  };
}

export async function acceptDocumentSuggestions(updates: Array<{ id?: string }>) {
  const { byId } = await loadIndexedDocumentMap();
  const results = [] as Array<{ id: string; groups: string[]; confirmedAt: string }>;

  for (const update of updates) {
    const found = update.id ? byId.get(update.id) : null;
    if (!found?.suggestedGroups?.length) continue;
    const saved = await saveDocumentOverride(found.path, { groups: found.suggestedGroups });
    results.push({ id: update.id as string, groups: saved.groups || [], confirmedAt: saved.confirmedAt });
  }

  return results;
}

export async function saveConfirmedDocumentGroups(updates: Array<{ id?: string; groups?: string[] }>) {
  const libraries = await loadDocumentLibraries();
  const validGroups = new Set(libraries.map((item) => item.key));
  const { byId } = await loadIndexedDocumentMap();
  const results = [] as Array<{ id: string; groups: string[]; confirmedAt: string }>;

  for (const update of updates) {
    const found = update.id ? byId.get(update.id) : null;
    if (!found) continue;
    const nextGroups = (update.groups || []).filter((group) => validGroups.has(group));
    const saved = await saveDocumentOverride(found.path, { groups: nextGroups });
    results.push({ id: update.id as string, groups: saved.groups || [], confirmedAt: saved.confirmedAt });
  }

  const ingestItems = results.reduce<ReturnType<typeof buildPreviewItemFromDocument>[]>((acc, result) => {
    const found = byId.get(result.id);
    if (!found) return acc;
    acc.push(buildPreviewItemFromDocument({
      ...found,
      confirmedGroups: result.groups,
      categoryConfirmedAt: result.confirmedAt,
    }, 'file', undefined, libraries));
    return acc;
  }, []);

  return { ingestItems, results };
}
