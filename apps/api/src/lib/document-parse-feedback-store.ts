import { existsSync, readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { STORAGE_CONFIG_DIR } from './paths.js';
import {
  CONFIG_VERSION,
  type DocumentParseFeedbackStore,
} from './document-parse-feedback-types.js';
import {
  createEmptyStore,
  normalizeStore,
} from './document-parse-feedback-support.js';

const DOCUMENT_PARSE_FEEDBACK_FILE = path.join(STORAGE_CONFIG_DIR, 'document-parse-feedback.json');

function readJsonObject(filePath: string) {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

export function loadDocumentParseFeedback() {
  return existsSync(DOCUMENT_PARSE_FEEDBACK_FILE)
    ? normalizeStore(readJsonObject(DOCUMENT_PARSE_FEEDBACK_FILE))
    : createEmptyStore();
}

export async function saveDocumentParseFeedback(feedback: DocumentParseFeedbackStore) {
  await fs.mkdir(STORAGE_CONFIG_DIR, { recursive: true });
  await fs.writeFile(
    DOCUMENT_PARSE_FEEDBACK_FILE,
    JSON.stringify({
      ...feedback,
      version: CONFIG_VERSION,
      updatedAt: new Date().toISOString(),
    }, null, 2),
    'utf8',
  );
}
