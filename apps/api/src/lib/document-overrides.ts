import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import type { BizCategory } from './document-config.js';
import { STORAGE_CONFIG_DIR } from './paths.js';

export type DocumentOverride = {
  bizCategory?: BizCategory;
  groups?: string[];
  suggestedGroups?: string[];
  ignored?: boolean;
  confirmedAt: string;
};

const OVERRIDE_DIR = STORAGE_CONFIG_DIR;
const OVERRIDE_FILE = path.join(OVERRIDE_DIR, 'document-overrides.json');

export async function loadDocumentOverrides() {
  try {
    const raw = await fs.readFile(OVERRIDE_FILE, 'utf8');
    return JSON.parse(raw) as Record<string, DocumentOverride>;
  } catch {
    return {} as Record<string, DocumentOverride>;
  }
}

export async function saveDocumentOverride(filePath: string, input: { bizCategory?: BizCategory; groups?: string[]; ignored?: boolean }) {
  const current = await loadDocumentOverrides();
  const previous = current[filePath] || { confirmedAt: new Date().toISOString() };
  current[filePath] = {
    ...previous,
    ...(input.bizCategory ? { bizCategory: input.bizCategory } : {}),
    ...(input.groups ? { groups: [...new Set(input.groups.map((item) => String(item).trim()).filter(Boolean))] } : {}),
    ...(typeof input.ignored === 'boolean' ? { ignored: input.ignored } : {}),
    confirmedAt: new Date().toISOString(),
  };

  await fs.mkdir(OVERRIDE_DIR, { recursive: true });
  await fs.writeFile(OVERRIDE_FILE, JSON.stringify(current, null, 2), 'utf8');
  return current[filePath];
}

export async function saveDocumentSuggestion(filePath: string, input: { suggestedGroups?: string[] }) {
  const current = await loadDocumentOverrides();
  const previous = current[filePath] || { confirmedAt: new Date().toISOString() };
  const hasSuggestedGroups = Object.prototype.hasOwnProperty.call(input, 'suggestedGroups');
  current[filePath] = {
    ...previous,
    ...(hasSuggestedGroups
      ? { suggestedGroups: [...new Set((input.suggestedGroups || []).map((item) => String(item).trim()).filter(Boolean))] }
      : {}),
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

export async function removeDocumentOverrides(filePaths: string[]) {
  const current = await loadDocumentOverrides();
  let changed = false;

  for (const filePath of filePaths) {
    if (!filePath || !Object.prototype.hasOwnProperty.call(current, filePath)) continue;
    delete current[filePath];
    changed = true;
  }

  if (changed) {
    await saveDocumentOverrides(current);
  }

  return current;
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
      suggestedGroups: matched.suggestedGroups?.length ? matched.suggestedGroups : item.suggestedGroups,
      ignored: matched.ignored === true,
      categoryConfirmedAt: matched.confirmedAt,
    };
  });
}
