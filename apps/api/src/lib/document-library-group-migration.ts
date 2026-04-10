import type { DocumentLibrary } from './document-libraries.js';

export type LegacyGroupedDocument = {
  bizCategory?: string;
  confirmedBizCategory?: string;
  groups?: string[];
  confirmedGroups?: string[];
};

function uniqStrings(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

export function resolveExplicitLibraryGroups(
  item: Pick<LegacyGroupedDocument, 'groups' | 'confirmedGroups'>,
  libraries: Array<Pick<DocumentLibrary, 'key'>>,
) {
  const validKeys = new Set(libraries.map((library) => library.key));
  const explicitGroups = uniqStrings([
    ...(item.confirmedGroups || []),
    ...(item.groups || []),
  ]);
  return explicitGroups.filter((group) => validKeys.has(group));
}

export function resolveLegacyCategoryLibraryGroup(
  item: Pick<LegacyGroupedDocument, 'bizCategory' | 'confirmedBizCategory'>,
  libraries: Array<Pick<DocumentLibrary, 'key'>>,
) {
  const effectiveCategory = String(item.confirmedBizCategory || item.bizCategory || '').trim();
  if (!effectiveCategory || effectiveCategory === 'general') return null;

  const matched = libraries.find((library) => library.key === effectiveCategory);
  return matched?.key || null;
}

export function resolveMigratedLibraryGroups(
  item: LegacyGroupedDocument,
  libraries: Array<Pick<DocumentLibrary, 'key'>>,
  ungroupedLibraryKey: string,
) {
  const explicitGroups = resolveExplicitLibraryGroups(item, libraries);
  if (explicitGroups.length) return explicitGroups;

  const legacyCategoryGroup = resolveLegacyCategoryLibraryGroup(item, libraries);
  if (legacyCategoryGroup) return [legacyCategoryGroup];

  return [ungroupedLibraryKey];
}
