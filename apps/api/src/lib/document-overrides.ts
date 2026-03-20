import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import type { BizCategory } from './document-config.js';

export type DocumentOverride = {
  bizCategory?: BizCategory;
  groups?: string[];
  confirmedAt: string;
};

const OVERRIDE_DIR = path.resolve(process.cwd(), '../../storage/config');
const OVERRIDE_FILE = path.join(OVERRIDE_DIR, 'document-overrides.json');

export async function loadDocumentOverrides() {
  try {
    const raw = await fs.readFile(OVERRIDE_FILE, 'utf8');
    return JSON.parse(raw) as Record<string, DocumentOverride>;
  } catch {
    return {} as Record<string, DocumentOverride>;
  }
}

export async function saveDocumentOverride(filePath: string, input: { bizCategory?: BizCategory; groups?: string[] }) {
  const current = await loadDocumentOverrides();
  const previous = current[filePath] || { confirmedAt: new Date().toISOString() };
  current[filePath] = {
    ...previous,
    ...(input.bizCategory ? { bizCategory: input.bizCategory } : {}),
    ...(input.groups ? { groups: [...new Set(input.groups.map((item) => String(item).trim()).filter(Boolean))] } : {}),
    confirmedAt: new Date().toISOString(),
  };

  await fs.mkdir(OVERRIDE_DIR, { recursive: true });
  await fs.writeFile(OVERRIDE_FILE, JSON.stringify(current, null, 2), 'utf8');
  return current[filePath];
}

export async function saveDocumentOverrides(overrides: Record<string, DocumentOverride>) {
  await fs.mkdir(OVERRIDE_DIR, { recursive: true });
  await fs.writeFile(OVERRIDE_FILE, JSON.stringify(overrides, null, 2), 'utf8');
  return overrides;
}

export function applyDocumentOverrides(items: ParsedDocument[], overrides: Record<string, DocumentOverride>) {
  return items.map((item) => {
    const matched = overrides[item.path];
    if (!matched) return item;
    const hasBizCategory = Object.prototype.hasOwnProperty.call(matched, 'bizCategory');
    const hasGroups = Object.prototype.hasOwnProperty.call(matched, 'groups');
    return {
      ...item,
      confirmedBizCategory: hasBizCategory ? matched.bizCategory : item.confirmedBizCategory,
      confirmedGroups: hasGroups ? (matched.groups || []) : item.confirmedGroups,
      categoryConfirmedAt: matched.confirmedAt,
    };
  });
}
