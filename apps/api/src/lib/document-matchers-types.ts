import type { ParsedDocument } from './document-parser.js';

export type DocumentEvidenceMatch = {
  item: ParsedDocument;
  chunkId: string;
  chunkText: string;
  score: number;
};
