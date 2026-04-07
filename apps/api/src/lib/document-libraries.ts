import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadDocumentCategoryConfig, type BizCategory } from './document-config.js';
import { loadDocumentOverrides, saveDocumentOverrides, type DocumentOverride } from './document-overrides.js';
import { scheduleOpenClawMemoryCatalogSync } from './openclaw-memory-sync.js';
import { STORAGE_CONFIG_DIR, STORAGE_FILES_DIR } from './paths.js';
import type { ParsedDocument } from './document-parser.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';

export type DocumentLibrary = {
  key: string;
  label: string;
  description?: string;
  permissionLevel: number;
  knowledgePagesEnabled?: boolean;
  knowledgePagesMode?: 'none' | 'overview' | 'topics';
  createdAt: string;
  isDefault?: boolean;
  sourceCategoryKey?: BizCategory;
};

export const UNGROUPED_LIBRARY_KEY = 'ungrouped';
export const UNGROUPED_LIBRARY_LABEL = '未分组';

const CONFIG_DIR = STORAGE_CONFIG_DIR;
const LIBRARIES_FILE = path.join(CONFIG_DIR, 'document-libraries.json');

function slugifyLibraryName(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || `library-${Date.now()}`;
}

async function readLibrariesFile() {
  const { data } = await readRuntimeStateJson<DocumentLibrary[]>({
    filePath: LIBRARIES_FILE,
    fallback: [] as DocumentLibrary[],
    normalize: (parsed) => {
      const items = Array.isArray((parsed as { items?: unknown[] } | null)?.items)
        ? (parsed as { items: DocumentLibrary[] }).items
        : [];
      return items.map((item) => normalizeLibrary(item));
    },
  });
  return data;
}

function normalizePermissionLevel(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

function normalizeKnowledgePagesMode(value: unknown, enabled?: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  const enabledFlag = enabled === undefined ? undefined : Boolean(enabled);

  if (enabledFlag === false) return 'none' as const;
  if (normalized === 'overview' || normalized === 'topics') return normalized;
  if (normalized === 'none') return 'none' as const;
  if (enabledFlag === true) return 'overview' as const;
  return 'none' as const;
}

function normalizeLibrary(input: Partial<DocumentLibrary> & Pick<DocumentLibrary, 'key' | 'label' | 'createdAt'>) {
  const knowledgePagesMode = normalizeKnowledgePagesMode(input.knowledgePagesMode, input.knowledgePagesEnabled);
  return {
    key: String(input.key || '').trim(),
    label: String(input.label || '').trim(),
    description: String(input.description || '').trim() || undefined,
    permissionLevel: normalizePermissionLevel(input.permissionLevel),
    knowledgePagesEnabled: knowledgePagesMode !== 'none',
    knowledgePagesMode,
    createdAt: String(input.createdAt || '').trim() || new Date().toISOString(),
    isDefault: input.isDefault === true,
    sourceCategoryKey: input.sourceCategoryKey,
  } satisfies DocumentLibrary;
}

async function writeLibrariesFile(items: DocumentLibrary[]) {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await writeRuntimeStateJson({
    filePath: LIBRARIES_FILE,
    payload: {
      items: items.map(({ isDefault: _isDefault, sourceCategoryKey: _sourceCategoryKey, ...rest }) => ({
        ...rest,
        permissionLevel: normalizePermissionLevel(rest.permissionLevel),
        knowledgePagesEnabled: Boolean(rest.knowledgePagesEnabled),
        knowledgePagesMode: normalizeKnowledgePagesMode(rest.knowledgePagesMode, rest.knowledgePagesEnabled),
      })),
    },
  });
  scheduleOpenClawMemoryCatalogSync('document-libraries-write');
}

function buildDefaultLibraries(categories: Awaited<ReturnType<typeof loadDocumentCategoryConfig>>['categories'], createdAt: string) {
  return [
    {
      key: UNGROUPED_LIBRARY_KEY,
      label: UNGROUPED_LIBRARY_LABEL,
      permissionLevel: 0,
      createdAt,
      isDefault: true,
    } satisfies DocumentLibrary,
    ...(Object.entries(categories) as Array<[BizCategory, { label: string }]>).map(([key, value]) => ({
      key,
      label: value.label || key,
      permissionLevel: 0,
      createdAt,
      isDefault: true,
      sourceCategoryKey: key,
    } satisfies DocumentLibrary)),
  ];
}

function mergeLibraries(...groups: DocumentLibrary[][]) {
  const merged = new Map<string, DocumentLibrary>();
  for (const group of groups) {
    for (const item of group) {
      const normalized = normalizeLibrary(item);
      const existing = merged.get(normalized.key);
      merged.set(normalized.key, existing ? {
        ...existing,
        ...normalized,
        isDefault: normalized.isDefault || existing.isDefault,
        sourceCategoryKey: normalized.sourceCategoryKey || existing.sourceCategoryKey,
      } : normalized);
    }
  }
  return [...merged.values()];
}

export function documentMatchesLibrary(item: ParsedDocument, library: DocumentLibrary) {
  const groups = item.confirmedGroups?.length ? item.confirmedGroups : item.groups || [];
  if (groups.includes(library.key)) return true;

  if (library.key === UNGROUPED_LIBRARY_KEY) {
    return groups.length === 0;
  }

  if (library.isDefault && library.sourceCategoryKey) {
    return (item.confirmedBizCategory || item.bizCategory) === library.sourceCategoryKey;
  }

  return false;
}

export async function loadDocumentLibraries() {
  const stored = await readLibrariesFile();
  const categoryConfig = await loadDocumentCategoryConfig(STORAGE_FILES_DIR);
  const overrides = await loadDocumentOverrides();
  const derived = Object.values(overrides)
    .flatMap((item) => item.groups || [])
    .reduce<DocumentLibrary[]>((acc, key) => {
      if (acc.some((item) => item.key === key)) return acc;
      acc.push({
        key,
        label: key,
        permissionLevel: 0,
        createdAt: new Date().toISOString(),
      });
      return acc;
    }, []);

  const defaultLibraries = buildDefaultLibraries(categoryConfig.categories, categoryConfig.updatedAt);
  const merged = mergeLibraries(defaultLibraries, derived, stored);
  return merged.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}

export async function createDocumentLibrary(input: { name: string; description?: string; permissionLevel?: number }) {
  const label = String(input.name || '').trim();
  if (!label) throw new Error('library name is required');

  const current = await loadDocumentLibraries();
  const existing = current.find((item) => item.label === label || item.key === slugifyLibraryName(label));
  if (existing) {
    throw new Error('library already exists');
  }

  const created: DocumentLibrary = {
    key: slugifyLibraryName(label),
    label,
    description: String(input.description || '').trim() || undefined,
    permissionLevel: normalizePermissionLevel(input.permissionLevel),
    knowledgePagesEnabled: false,
    knowledgePagesMode: 'none',
    createdAt: new Date().toISOString(),
  };

  await writeLibrariesFile([...current, created]);
  const nextLibraries = await loadDocumentLibraries();
  return nextLibraries.find((item) => item.key === created.key) || created;
}

export async function updateDocumentLibrary(
  key: string,
  input: {
    label?: string;
    description?: string;
    permissionLevel?: number;
    knowledgePagesEnabled?: boolean;
    knowledgePagesMode?: 'none' | 'overview' | 'topics';
  },
) {
  const current = await loadDocumentLibraries();
  const target = current.find((item) => item.key === key);
  if (!target) {
    throw new Error('library not found');
  }

  const label = String(input.label ?? target.label).trim();
  if (!label) {
    throw new Error('library name is required');
  }

  const duplicate = current.find((item) => item.key !== key && item.label === label);
  if (duplicate) {
    throw new Error('library already exists');
  }

  const nextItems = current.map((item) => (item.key === key
    ? normalizeLibrary({
        ...item,
        label,
        description: input.description ?? item.description,
        permissionLevel: input.permissionLevel ?? item.permissionLevel,
        knowledgePagesEnabled: input.knowledgePagesEnabled ?? item.knowledgePagesEnabled,
        knowledgePagesMode: input.knowledgePagesMode ?? item.knowledgePagesMode,
      })
    : item));

  await writeLibrariesFile(nextItems);
  const nextLibraries = await loadDocumentLibraries();
  return nextLibraries.find((item) => item.key === key) || target;
}

export async function deleteDocumentLibrary(key: string) {
  const current = await loadDocumentLibraries();
  const target = current.find((item) => item.key === key);
  if (target?.isDefault) {
    throw new Error('default library cannot be deleted');
  }
  const filtered = current.filter((item) => item.key !== key);
  await writeLibrariesFile(filtered);
  const overrides = await loadDocumentOverrides();
  const nextOverrides = Object.fromEntries(
    Object.entries(overrides).map(([filePath, item]) => {
      const nextGroups = (item.groups || []).filter((group) => group !== key);
      const nextItem: DocumentOverride = {
        ...item,
        groups: nextGroups,
        confirmedAt: item.confirmedAt || new Date().toISOString(),
      };
      return [filePath, nextItem];
    }),
  );
  await saveDocumentOverrides(nextOverrides);
}
