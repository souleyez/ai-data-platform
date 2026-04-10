import { loadDocumentCategoryConfig } from '../lib/document-config.js';
import {
  resolveExplicitLibraryGroups,
  resolveLegacyCategoryLibraryGroup,
  resolveMigratedLibraryGroups,
} from '../lib/document-library-group-migration.js';
import { loadDocumentLibraries, UNGROUPED_LIBRARY_KEY } from '../lib/document-libraries.js';
import { loadDocumentOverrides, saveDocumentOverrides } from '../lib/document-overrides.js';
import { DEFAULT_SCAN_DIR, loadParsedDocuments } from '../lib/document-store.js';

async function main() {
  const documentConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const libraries = await loadDocumentLibraries();
  const overrides = await loadDocumentOverrides();
  const { items, totalFiles } = await loadParsedDocuments(200000, false, documentConfig.scanRoots, {
    skipBackgroundTasks: true,
  });

  const nextOverrides = { ...overrides };
  let updatedCount = 0;
  let explicitGroupCount = 0;
  let legacyCategoryGroupCount = 0;
  let ungroupedFallbackCount = 0;

  for (const item of items) {
    if (overrides[item.path]?.groups?.length) continue;

    const explicitGroups = resolveExplicitLibraryGroups(item, libraries);
    const legacyCategoryGroup = resolveLegacyCategoryLibraryGroup(item, libraries);
    const nextGroups = resolveMigratedLibraryGroups(item, libraries, UNGROUPED_LIBRARY_KEY);

    nextOverrides[item.path] = {
      ...(nextOverrides[item.path] || { confirmedAt: new Date().toISOString() }),
      groups: nextGroups,
      confirmedAt: new Date().toISOString(),
    };

    updatedCount += 1;
    if (explicitGroups.length) {
      explicitGroupCount += 1;
    } else if (legacyCategoryGroup) {
      legacyCategoryGroupCount += 1;
    } else {
      ungroupedFallbackCount += 1;
    }
  }

  if (updatedCount > 0) {
    await saveDocumentOverrides(nextOverrides);
  }

  console.log(JSON.stringify({
    status: updatedCount > 0 ? 'updated' : 'unchanged',
    totalFiles: totalFiles || items.length,
    updatedCount,
    explicitGroupCount,
    legacyCategoryGroupCount,
    ungroupedFallbackCount,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
