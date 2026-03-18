import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import type { BizCategory } from './document-config.js';

export type DocumentOverride = {
  bizCategory: BizCategory;
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

export async function saveDocumentOverride(filePath: string, bizCategory: BizCategory) {
  const current = await loadDocumentOverrides();
  current[filePath] = {
    bizCategory,
    confirmedAt: new Date().toISOString(),
  };

  await fs.mkdir(OVERRIDE_DIR, { recursive: true });
  await fs.writeFile(OVERRIDE_FILE, JSON.stringify(current, null, 2), 'utf8');
  return current[filePath];
}

export function applyDocumentOverrides(items: ParsedDocument[], overrides: Record<string, DocumentOverride>) {
  return items.map((item) => {
    const matched = overrides[item.path];
    if (!matched) return item;
    return {
      ...item,
      bizCategory: matched.bizCategory,
      confirmedBizCategory: matched.bizCategory,
      categoryConfirmedAt: matched.confirmedAt,
    };
  });
}
