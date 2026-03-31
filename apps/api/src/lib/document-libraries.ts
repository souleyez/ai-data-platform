import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadDocumentCategoryConfig, type BizCategory } from './document-config.js';
import { loadDocumentOverrides, saveDocumentOverrides, type DocumentOverride } from './document-overrides.js';
import { scheduleOpenClawMemoryCatalogSync } from './openclaw-memory-sync.js';
import { STORAGE_CONFIG_DIR, STORAGE_FILES_DIR } from './paths.js';
import type { ParsedDocument } from './document-parser.js';

export type DocumentLibrary = {
  key: string;
  label: string;
  description?: string;
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
  try {
    const raw = await fs.readFile(LIBRARIES_FILE, 'utf8');
    const parsed = JSON.parse(raw) as { items?: DocumentLibrary[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [] as DocumentLibrary[];
  }
}

async function writeLibrariesFile(items: DocumentLibrary[]) {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(
    LIBRARIES_FILE,
    JSON.stringify({
      items: items
        .filter((item) => !item.isDefault)
        .map(({ isDefault: _isDefault, sourceCategoryKey: _sourceCategoryKey, ...rest }) => rest),
    }, null, 2),
    'utf8',
  );
  scheduleOpenClawMemoryCatalogSync('document-libraries-write');
}

function buildDefaultLibraries(categories: Awaited<ReturnType<typeof loadDocumentCategoryConfig>>['categories'], createdAt: string) {
  return [
    {
      key: UNGROUPED_LIBRARY_KEY,
      label: UNGROUPED_LIBRARY_LABEL,
      createdAt,
      isDefault: true,
    } satisfies DocumentLibrary,
    ...(Object.entries(categories) as Array<[BizCategory, { label: string }]>).map(([key, value]) => ({
      key,
      label: value.label || key,
      createdAt,
      isDefault: true,
      sourceCategoryKey: key,
    } satisfies DocumentLibrary)),
  ];
}

function mergeLibraries(...groups: DocumentLibrary[][]) {
  const merged: DocumentLibrary[] = [];
  for (const group of groups) {
    for (const item of group) {
      if (merged.some((existing) => existing.key === item.key)) continue;
      merged.push(item);
    }
  }
  return merged;
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
        createdAt: new Date().toISOString(),
      });
      return acc;
    }, []);

  const defaultLibraries = buildDefaultLibraries(categoryConfig.categories, categoryConfig.updatedAt);
  const merged = mergeLibraries(defaultLibraries, stored, derived);
  return merged.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}

export async function createDocumentLibrary(input: { name: string; description?: string }) {
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
    createdAt: new Date().toISOString(),
  };

  await writeLibrariesFile([...current, created]);
  const nextLibraries = await loadDocumentLibraries();
  return nextLibraries.find((item) => item.key === created.key) || created;
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
