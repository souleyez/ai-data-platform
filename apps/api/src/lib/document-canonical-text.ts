import type { ParsedDocument } from './document-parser.js';

export type DocumentCanonicalSource =
  | 'existing-markdown'
  | 'markitdown'
  | 'full-text'
  | 'none';

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

export function getParsedDocumentCanonicalText(item?: Pick<ParsedDocument, 'markdownText' | 'fullText'> | null) {
  const markdownText = normalizeText(item?.markdownText);
  if (markdownText) return markdownText;
  return normalizeText(item?.fullText);
}

export function getParsedDocumentCanonicalSource(
  item?: Pick<ParsedDocument, 'markdownText' | 'markdownMethod' | 'fullText'> | null,
): DocumentCanonicalSource {
  const markdownText = normalizeText(item?.markdownText);
  if (markdownText) {
    return String(item?.markdownMethod || '').trim() === 'existing-markdown'
      ? 'existing-markdown'
      : 'markitdown';
  }
  return normalizeText(item?.fullText) ? 'full-text' : 'none';
}
