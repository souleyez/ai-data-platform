import type { ParsedDocument } from './document-parser.js';

export type DocumentCanonicalSource =
  | 'existing-markdown'
  | 'markitdown'
  | 'vlm-image'
  | 'vlm-pdf'
  | 'vlm-presentation'
  | 'legacy-full-text'
  | 'none';

export type DocumentCanonicalParseStatus =
  | 'ready'
  | 'fallback_full_text'
  | 'failed'
  | 'unsupported';

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function normalizeMethod(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function isLegacyCanonicalReadyMethod(value: unknown) {
  const parseMethod = normalizeMethod(value);
  return parseMethod.startsWith('text-')
    || parseMethod.startsWith('markdown-')
    || parseMethod.startsWith('json-')
    || parseMethod.startsWith('html-')
    || parseMethod.startsWith('csv-');
}

function isValidCanonicalParseStatus(value: unknown): value is DocumentCanonicalParseStatus {
  return value === 'ready'
    || value === 'fallback_full_text'
    || value === 'failed'
    || value === 'unsupported';
}

export function getParsedDocumentCanonicalText(item?: Pick<ParsedDocument, 'markdownText' | 'fullText'> | null) {
  const markdownText = normalizeText(item?.markdownText);
  if (markdownText) return markdownText;
  return normalizeText(item?.fullText);
}

export function getParsedDocumentCanonicalSource(
  item?: Pick<ParsedDocument, 'markdownText' | 'markdownMethod' | 'fullText' | 'parseMethod'> | null,
): DocumentCanonicalSource {
  const markdownText = normalizeText(item?.markdownText);
  if (markdownText) {
    return normalizeMethod(item?.markdownMethod) === 'existing-markdown'
      ? 'existing-markdown'
      : 'markitdown';
  }
  if (!normalizeText(item?.fullText)) return 'none';

  const parseMethod = normalizeMethod(item?.parseMethod);
  if (parseMethod.includes('presentation-vlm')) return 'vlm-presentation';
  if (parseMethod.includes('pdf-vlm')) return 'vlm-pdf';
  if (parseMethod.includes('image-vlm') || parseMethod.includes('image-ocr+vlm')) return 'vlm-image';
  return 'legacy-full-text';
}

export function getParsedDocumentCanonicalParseStatus(
  item?: {
    canonicalParseStatus?: string;
    markdownText?: string;
    markdownMethod?: string;
    fullText?: string;
    parseMethod?: string;
    parseStatus?: string;
  } | null,
): DocumentCanonicalParseStatus {
  if (isValidCanonicalParseStatus(item?.canonicalParseStatus)) {
    if (item.canonicalParseStatus === 'fallback_full_text' && isLegacyCanonicalReadyMethod(item?.parseMethod)) {
      return 'ready';
    }
    return item.canonicalParseStatus;
  }

  const canonicalSource = getParsedDocumentCanonicalSource(item);
  if (canonicalSource === 'existing-markdown' || canonicalSource === 'markitdown') return 'ready';
  if (canonicalSource === 'vlm-image' || canonicalSource === 'vlm-pdf' || canonicalSource === 'vlm-presentation') {
    return 'ready';
  }
  if (String(item?.parseStatus || '').trim() === 'unsupported') return 'unsupported';
  if (String(item?.parseStatus || '').trim() === 'error') return 'failed';
  if (String(item?.parseStatus || '').trim() === 'parsed') {
    return isLegacyCanonicalReadyMethod(item?.parseMethod) ? 'ready' : 'fallback_full_text';
  }
  return canonicalSource === 'none' ? 'failed' : 'fallback_full_text';
}
