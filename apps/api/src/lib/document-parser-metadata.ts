import path from 'node:path';
import { normalizeText } from './document-parser-text-normalization.js';

function cleanTitleCandidate(line: string) {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+[.)、]\s*/, '')
    .replace(/^[（(][^)）]{1,12}[)）]\s*/, '')
    .trim();
}

export function inferTitle(text: string, fallbackName: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => cleanTitleCandidate(line.trim()))
    .filter(Boolean);

  const picked = lines.find((line) => line.length >= 4 && line.length <= 160 && !/^[\d\W_]+$/.test(line));
  if (picked) return picked;

  return path.parse(fallbackName).name;
}

export function buildEvidence(filePath: string, text = '') {
  const name = path.basename(filePath);
  const normalizedText = normalizeText(text).slice(0, 8000);
  return `${filePath} ${name} ${normalizedText}`.toLowerCase();
}
