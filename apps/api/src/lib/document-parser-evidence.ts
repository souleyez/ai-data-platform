import { normalizeText } from './document-parser-text-normalization.js';

export type EvidenceChunk = {
  id: string;
  order: number;
  text: string;
  charLength: number;
  page?: number;
  sectionTitle?: string;
  regionHint?: string;
  title?: string;
};

function inferSectionTitle(block: string) {
  const lines = String(block || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!lines.length) return undefined;

  const [firstLine, secondLine = ''] = lines;
  if (/^#{1,6}\s+/.test(firstLine)) {
    return firstLine.replace(/^#{1,6}\s+/, '').trim() || undefined;
  }

  if (secondLine && /^[=-]{3,}$/.test(secondLine) && firstLine.length <= 80) {
    return firstLine;
  }

  if (
    /^(?:第[\d一二三四五六七八九十百零]+[章节部分条款]|(?:\d+|[一二三四五六七八九十]+)[.、．)）])\s*/.test(firstLine) &&
    firstLine.length <= 80
  ) {
    return firstLine;
  }

  if (firstLine.length <= 40 && /[:：]$/.test(firstLine)) {
    return firstLine.replace(/[:：]+$/, '').trim() || undefined;
  }

  return undefined;
}

function isHeadingOnlyBlock(block: string, sectionTitle: string | undefined) {
  if (!sectionTitle) return false;
  const normalized = String(block || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  if (normalized === sectionTitle) return true;
  if (normalized === `# ${sectionTitle}` || normalized === `## ${sectionTitle}`) return true;
  return normalized.length <= Math.max(sectionTitle.length + 10, 60) && !/[。.!?；;]/.test(normalized);
}

function slugifyRegionHint(value: string | undefined) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return normalized || '';
}

function buildRegionHint(page: number, sectionTitle: string | undefined) {
  const pageHint = `page-${page}`;
  const sectionSlug = slugifyRegionHint(sectionTitle);
  if (!sectionSlug) return `${pageHint}:body`;
  return `${pageHint}:${sectionSlug}`;
}

function createEvidenceChunk(
  chunks: EvidenceChunk[],
  text: string,
  page: number,
  sectionTitle: string | undefined,
) {
  const normalizedText = String(text || '').trim();
  if (normalizedText.length < 40 || chunks.length >= 12) return;

  chunks.push({
    id: `chunk-${chunks.length + 1}`,
    order: chunks.length,
    text: normalizedText,
    charLength: normalizedText.length,
    page,
    ...(sectionTitle ? { sectionTitle, title: sectionTitle } : {}),
    regionHint: buildRegionHint(page, sectionTitle),
  });
}

export function splitEvidenceChunksLegacy(text: string): EvidenceChunk[] {
  const normalized = String(text || '').replace(/\r/g, '').trim();
  if (!normalized) return [];

  const blocks = normalized
    .split(/\n{2,}/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 40);

  const sourceBlocks = blocks.length ? blocks : normalized
    .split(/(?<=[。！？.!?])\s+|\n+/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 40);

  const chunks: EvidenceChunk[] = [];
  const maxChunkLength = 420;

  for (const block of sourceBlocks) {
    if (block.length <= maxChunkLength) {
      chunks.push({
        id: `chunk-${chunks.length + 1}`,
        order: chunks.length,
        text: block,
        charLength: block.length,
      });
      continue;
    }

    let cursor = 0;
    while (cursor < block.length) {
      let next = Math.min(cursor + maxChunkLength, block.length);
      if (next < block.length) {
        const window = block.slice(cursor, next);
        const softCut = Math.max(
          window.lastIndexOf('。'),
          window.lastIndexOf('；'),
          window.lastIndexOf('. '),
          window.lastIndexOf('; '),
        );
        if (softCut >= 120) next = cursor + softCut + 1;
      }

      const piece = block.slice(cursor, next).trim();
      if (piece.length >= 40) {
        chunks.push({
          id: `chunk-${chunks.length + 1}`,
          order: chunks.length,
          text: piece,
          charLength: piece.length,
        });
      }
      cursor = next;
    }
  }

  return chunks.slice(0, 12);
}

export function splitEvidenceChunks(text: string): EvidenceChunk[] {
  const normalized = String(text || '').replace(/\r/g, '').trim();
  if (!normalized) return [];

  const rawPages = normalized.includes('\f')
    ? normalized.split(/\f+/).map((item) => item.trim()).filter(Boolean)
    : [normalized];

  const chunks: EvidenceChunk[] = [];
  const maxChunkLength = 420;

  for (const [pageIndex, rawPage] of rawPages.entries()) {
    let currentSectionTitle: string | undefined;
    const pageNumber = pageIndex + 1;
    const rawBlocks = rawPage
      .split(/\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean);

    const sourceBlocks = rawBlocks.length
      ? rawBlocks
      : rawPage
          .split(/(?<=[銆傦紒锛?!?])\s+|\n+/)
          .map((item) => item.trim())
          .filter(Boolean);

    for (const block of sourceBlocks) {
      const detectedSectionTitle = inferSectionTitle(block);
      if (detectedSectionTitle) {
        currentSectionTitle = detectedSectionTitle;
      }

      if (isHeadingOnlyBlock(block, detectedSectionTitle)) {
        continue;
      }

      const normalizedBlock = block.replace(/\s+/g, ' ').trim();
      if (normalizedBlock.length <= maxChunkLength) {
        createEvidenceChunk(chunks, normalizedBlock, pageNumber, currentSectionTitle);
        continue;
      }

      let cursor = 0;
      while (cursor < normalizedBlock.length && chunks.length < 12) {
        let next = Math.min(cursor + maxChunkLength, normalizedBlock.length);
        if (next < normalizedBlock.length) {
          const window = normalizedBlock.slice(cursor, next);
          const softCut = Math.max(
            window.lastIndexOf('。'),
            window.lastIndexOf('；'),
            window.lastIndexOf('. '),
            window.lastIndexOf('; '),
          );
          if (softCut >= 120) next = cursor + softCut + 1;
        }

        const piece = normalizedBlock.slice(cursor, next).trim();
        createEvidenceChunk(chunks, piece, pageNumber, currentSectionTitle);
        cursor = next;
      }
    }
  }

  return chunks.slice(0, 12);
}

export function summarize(text: string, fallback: string) {
  const normalized = normalizeText(text);
  if (!normalized) return fallback;
  return normalized.slice(0, 140) + (normalized.length > 140 ? '...' : '');
}

export function excerpt(text: string, fallback: string) {
  const normalized = normalizeText(text);
  if (!normalized) return fallback;
  return normalized.slice(0, 360) + (normalized.length > 360 ? '...' : '');
}
