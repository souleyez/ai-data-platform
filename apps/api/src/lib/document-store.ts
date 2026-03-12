import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseDocument, type ParsedDocument } from './document-parser.js';

export const DEFAULT_SCAN_DIR = process.env.DOCUMENT_SCAN_DIR || path.resolve(process.cwd(), '../../storage/files');

export async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return listFilesRecursive(fullPath);
      return [fullPath];
    }),
  );
  return nested.flat();
}

export async function loadParsedDocuments(limit = 200): Promise<{ exists: boolean; files: string[]; items: ParsedDocument[] }> {
  let files: string[] = [];
  let exists = true;

  try {
    files = await listFilesRecursive(DEFAULT_SCAN_DIR);
  } catch {
    exists = false;
  }

  const items = await Promise.all(files.slice(0, limit).map((filePath) => parseDocument(filePath)));
  return { exists, files, items };
}

export function buildDocumentId(filePath: string) {
  return Buffer.from(filePath).toString('base64url');
}

export function matchDocumentsByPrompt(items: ParsedDocument[], prompt: string) {
  const text = prompt.toLowerCase();
  const keywords = text.split(/\s+/).filter(Boolean);
  return items
    .map((item) => {
      const haystack = `${item.name} ${item.category} ${item.summary}`.toLowerCase();
      const score = keywords.reduce((acc, keyword) => (haystack.includes(keyword) ? acc + 1 : acc), 0);
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.item);
}
