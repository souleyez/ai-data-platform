import {
  createManagedDocumentLibrary,
  deleteManagedDocumentLibrary,
  updateManagedDocumentLibrary,
} from './document-route-services.js';
import { loadDocumentLibraries } from './document-libraries.js';
import type {
  CommandFlags,
  PlatformControlResult,
} from './platform-control-documents-support.js';
import { resolveBooleanFlag } from './platform-control-documents-support.js';

export async function runDocumentLibraryCommand(subcommand: string, flags: CommandFlags): Promise<PlatformControlResult | null> {
  if (!subcommand || subcommand === 'libraries') {
    const libraries = await loadDocumentLibraries();
    return {
      ok: true,
      action: 'documents.libraries',
      summary: `Loaded ${libraries.length} libraries.`,
      data: {
        items: libraries.map((item) => ({
          key: item.key,
          label: item.label,
          description: item.description || '',
        })),
      },
    };
  }

  if (subcommand === 'create-library') {
    const name = String(flags.name || flags.label || '').trim();
    if (!name) throw new Error('Missing --name for documents create-library.');
    const { library, libraries } = await createManagedDocumentLibrary({
      name,
      description: String(flags.description || '').trim() || undefined,
      permissionLevel: flags.permission !== undefined ? Number(flags.permission) : undefined,
    });
    return {
      ok: true,
      action: 'documents.create-library',
      summary: `Created library "${library.label}".`,
      data: { item: library, items: libraries },
    };
  }

  if (subcommand === 'update-library') {
    const key = String(flags.library || flags.key || '').trim();
    if (!key) throw new Error('Missing --library for documents update-library.');
    const patch: Parameters<typeof updateManagedDocumentLibrary>[1] = {};
    if (flags.label !== undefined) patch.label = String(flags.label || '').trim();
    if (flags.description !== undefined) patch.description = String(flags.description || '').trim();
    if (flags.permission !== undefined) patch.permissionLevel = Number(flags.permission);
    if (flags['knowledge-pages'] !== undefined) patch.knowledgePagesEnabled = resolveBooleanFlag(flags['knowledge-pages']);
    if (flags['knowledge-pages-mode'] !== undefined) patch.knowledgePagesMode = String(flags['knowledge-pages-mode'] || '').trim() as 'none' | 'overview' | 'topics';
    if (!Object.keys(patch).length) {
      throw new Error('Missing library update fields. Provide --label, --description, --permission, or knowledge page flags.');
    }
    const { library, libraries } = await updateManagedDocumentLibrary(key, patch);
    return {
      ok: true,
      action: 'documents.update-library',
      summary: `Updated library "${library.label}".`,
      data: { item: library, items: libraries },
    };
  }

  if (subcommand === 'delete-library') {
    const key = String(flags.library || flags.key || '').trim();
    if (!key) throw new Error('Missing --library for documents delete-library.');
    const { deleted, libraries } = await deleteManagedDocumentLibrary(key);
    return {
      ok: true,
      action: 'documents.delete-library',
      summary: `Deleted library "${deleted.label}".`,
      data: { item: deleted, items: libraries },
    };
  }

  return null;
}
