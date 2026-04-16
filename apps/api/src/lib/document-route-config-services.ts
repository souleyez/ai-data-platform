import {
  bindDatasetLibrarySecret,
  clearDatasetLibrarySecretBinding,
} from './dataset-secrets.js';
import {
  createDocumentLibrary,
  deleteDocumentLibrary,
  loadDocumentLibraries,
  updateDocumentLibrary,
  UNGROUPED_LIBRARY_KEY,
} from './document-libraries.js';
import {
  deleteLibraryDocumentExtractionSettings,
  updateLibraryDocumentExtractionSettings,
} from './document-extraction-governance.js';
import { syncLibraryKnowledgePagesForLibraryKeys } from './library-knowledge-pages.js';

export async function createManagedDocumentLibrary(input: {
  name: string;
  description?: string;
  permissionLevel?: number;
  secret?: string;
  clearSecret?: boolean;
}) {
  const library = await createDocumentLibrary(input);
  const secret = String(input.secret || '').trim();
  if (secret) {
    await bindDatasetLibrarySecret({
      libraryKey: library.key,
      secret,
    });
  } else if (input.clearSecret === true) {
    await clearDatasetLibrarySecretBinding(library.key);
  }
  const libraries = await loadDocumentLibraries();
  return {
    library: libraries.find((item) => item.key === library.key) || library,
    libraries,
  };
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
    secret?: string;
    clearSecret?: boolean;
  },
) {
  const library = await updateDocumentLibrary(key, input);
  const secret = String(input.secret || '').trim();
  if (secret) {
    await bindDatasetLibrarySecret({
      libraryKey: library.key,
      secret,
    });
  } else if (input.clearSecret === true) {
    await clearDatasetLibrarySecretBinding(library.key);
  }
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
  return {
    library: libraries.find((item) => item.key === library.key) || library,
    libraries,
  };
}

export async function deleteManagedDocumentLibrary(key: string) {
  const libraries = await loadDocumentLibraries();
  const found = libraries.find((item) => item.key === key);

  if (!found) {
    throw new Error('library not found');
  }

  if (found.key === UNGROUPED_LIBRARY_KEY) {
    throw new Error('reserved library cannot be deleted');
  }

  await deleteDocumentLibrary(key);
  await deleteLibraryDocumentExtractionSettings(key);
  const nextLibraries = await loadDocumentLibraries();
  return { deleted: found, libraries: nextLibraries };
}
