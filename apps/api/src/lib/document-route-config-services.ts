import {
  createDocumentLibrary,
  deleteDocumentLibrary,
  loadDocumentLibraries,
  updateDocumentLibrary,
} from './document-libraries.js';
import {
  deleteLibraryDocumentExtractionSettings,
  updateLibraryDocumentExtractionSettings,
} from './document-extraction-governance.js';
import { syncLibraryKnowledgePagesForLibraryKeys } from './library-knowledge-pages.js';
import {
  loadDocumentCategoryConfig,
  saveDocumentCategoryConfig,
  type BizCategory,
  type ProjectCustomCategory,
} from './document-config.js';
import { DEFAULT_SCAN_DIR, loadParsedDocuments } from './document-store.js';
import { loadIndexedDocumentMap } from './document-route-loaders.js';

export async function saveConfiguredDocumentCategories(
  categoriesInput: Record<string, { label?: string; folders?: string[] | string }> = {},
) {
  const categories = Object.fromEntries(
    Object.entries(categoriesInput).map(([key, value]) => [
      key,
      {
        label: value.label || key,
        folders: Array.isArray(value.folders)
          ? value.folders.map((item) => String(item).trim()).filter(Boolean)
          : String(value.folders || '')
            .split(/[,\n]/)
            .map((item) => item.trim())
            .filter(Boolean),
      },
    ]),
  );

  const currentConfig = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
  const config = await saveDocumentCategoryConfig(currentConfig.scanRoot, { categories: categories as any });
  const { exists, files } = await loadParsedDocuments(200, true, config.scanRoot);
  return { config, exists, files };
}

export async function createManagedDocumentLibrary(input: { name: string; description?: string; permissionLevel?: number }) {
  const library = await createDocumentLibrary(input);
  const libraries = await loadDocumentLibraries();
  return { library, libraries };
}

export async function updateManagedDocumentLibrary(
  key: string,
  input: {
    label?: string;
    description?: string;
    permissionLevel?: number;
    knowledgePagesEnabled?: boolean;
    knowledgePagesMode?: 'none' | 'overview' | 'topics';
    extractionFieldSet?: string;
    extractionFallbackSchemaType?: string;
    extractionPreferredFieldKeys?: string[];
    extractionRequiredFieldKeys?: string[];
    extractionFieldAliases?: Record<string, string>;
    extractionFieldPrompts?: Record<string, string>;
    extractionFieldNormalizationRules?: Record<string, string[] | string>;
    extractionFieldConflictStrategies?: Record<string, string>;
  },
) {
  const library = await updateDocumentLibrary(key, input);
  await updateLibraryDocumentExtractionSettings({
    key: library.key,
    label: library.label,
    fieldSet: input.extractionFieldSet,
    fallbackSchemaType: input.extractionFallbackSchemaType,
    preferredFieldKeys: input.extractionPreferredFieldKeys,
    requiredFieldKeys: input.extractionRequiredFieldKeys,
    fieldAliases: input.extractionFieldAliases,
    fieldPrompts: input.extractionFieldPrompts,
    fieldNormalizationRules: input.extractionFieldNormalizationRules,
    fieldConflictStrategies: input.extractionFieldConflictStrategies,
  });
  await syncLibraryKnowledgePagesForLibraryKeys([library.key], 'library-settings-update').catch(() => undefined);
  const libraries = await loadDocumentLibraries();
  return { library, libraries };
}

export async function deleteManagedDocumentLibrary(key: string) {
  const libraries = await loadDocumentLibraries();
  const found = libraries.find((item) => item.key === key);

  if (!found) {
    throw new Error('library not found');
  }

  if (found.isDefault) {
    throw new Error('default library cannot be deleted');
  }

  await deleteDocumentLibrary(key);
  await deleteLibraryDocumentExtractionSettings(key);
  const nextLibraries = await loadDocumentLibraries();
  return { deleted: found, libraries: nextLibraries };
}

export async function saveAcceptedCategorySuggestions(
  updates: Array<{ id?: string; suggestedName?: string; parentCategoryKey?: BizCategory }>,
) {
  const { documentConfig, byId } = await loadIndexedDocumentMap();
  const customCategories = [...(documentConfig.customCategories || [])];
  const accepted = [] as ProjectCustomCategory[];

  for (const update of updates) {
    const found = update.id ? byId.get(update.id) : null;
    const suggestedName = String(update.suggestedName || '').trim();
    const parentCategoryKey = update.parentCategoryKey || found?.bizCategory || 'other';
    if (!found || !suggestedName) continue;

    const key = suggestedName.toLowerCase().replace(/\s+/g, '-');
    const exists = customCategories.find((item) => item.key === key || item.label === suggestedName);
    if (exists) {
      accepted.push(exists);
      continue;
    }

    const created = {
      key,
      label: suggestedName,
      parent: parentCategoryKey,
      keywords: [suggestedName, ...(found.topicTags || []).slice(0, 3)],
      createdAt: new Date().toISOString(),
    } as ProjectCustomCategory;
    customCategories.push(created);
    accepted.push(created);
  }

  const config = await saveDocumentCategoryConfig(documentConfig.scanRoot, { customCategories });
  return { accepted, config };
}
