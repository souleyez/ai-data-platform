import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadDocumentOverrides, saveDocumentOverrides, type DocumentOverride } from './document-overrides.js';

export type DocumentLibrary = {
  key: string;
  label: string;
  description?: string;
  createdAt: string;
};

const CONFIG_DIR = path.resolve(process.cwd(), '../../storage/config');
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
  await fs.writeFile(LIBRARIES_FILE, JSON.stringify({ items }, null, 2), 'utf8');
}

export async function loadDocumentLibraries() {
  const stored = await readLibrariesFile();
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

  const merged = [...stored];
  for (const item of derived) {
    if (!merged.some((existing) => existing.key === item.key)) merged.push(item);
  }

  return merged.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}

export async function createDocumentLibrary(input: { name: string; description?: string }) {
  const label = String(input.name || '').trim();
  if (!label) throw new Error('library name is required');

  const current = await loadDocumentLibraries();
  const existing = current.find((item) => item.label === label || item.key === slugifyLibraryName(label));
  if (existing) return existing;

  const created: DocumentLibrary = {
    key: slugifyLibraryName(label),
    label,
    description: String(input.description || '').trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  await writeLibrariesFile([...current, created]);
  return created;
}

export async function deleteDocumentLibrary(key: string) {
  const current = await loadDocumentLibraries();
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
