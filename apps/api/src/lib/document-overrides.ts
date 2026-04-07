import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BizCategory } from './document-config.js';
import type { ParsedDocument } from './document-parser.js';
import { scheduleOpenClawMemoryCatalogSync } from './openclaw-memory-sync.js';
import { STORAGE_CONFIG_DIR } from './paths.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';

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
  const { data } = await readRuntimeStateJson<Record<string, DocumentOverride>>({
    filePath: OVERRIDE_FILE,
    fallback: {} as Record<string, DocumentOverride>,
    normalize: (parsed) => (
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, DocumentOverride>
        : {}
    ),
  });
  return data;
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
  await writeRuntimeStateJson({
    filePath: OVERRIDE_FILE,
    payload: current,
  });
  scheduleOpenClawMemoryCatalogSync('document-override-write');
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
  await writeRuntimeStateJson({
    filePath: OVERRIDE_FILE,
    payload: current,
  });
  scheduleOpenClawMemoryCatalogSync('document-override-suggestion');
  return current[filePath];
}

export async function saveDocumentOverrides(overrides: Record<string, DocumentOverride>) {
  await fs.mkdir(OVERRIDE_DIR, { recursive: true });
  await writeRuntimeStateJson({
    filePath: OVERRIDE_FILE,
    payload: overrides,
  });
  scheduleOpenClawMemoryCatalogSync('document-overrides-bulk-write');
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
