import type { ParsedDocument } from './document-parser.js';
import type { DocumentImageVlmCapability } from './document-image-vlm-capability.js';

export type DocumentImageVlmFieldCandidate = {
  key?: string;
  value?: unknown;
  confidence?: number;
  source?: string;
  evidenceText?: string;
};

export type DocumentImageVlmEvidenceBlock = {
  title?: string;
  text?: string;
};

export type DocumentImageVlmEntity = {
  text?: string;
  type?: string;
  confidence?: number;
  evidenceText?: string;
};

export type DocumentImageVlmClaim = {
  subject?: string;
  predicate?: string;
  object?: string;
  confidence?: number;
  evidenceText?: string;
};

export type DocumentImageVlmPayload = {
  summary?: string;
  documentKind?: string;
  layoutType?: string;
  topicTags?: string[];
  riskLevel?: ParsedDocument['riskLevel'];
  visualSummary?: string;
  evidenceBlocks?: DocumentImageVlmEvidenceBlock[];
  fieldCandidates?: DocumentImageVlmFieldCandidate[];
  entities?: DocumentImageVlmEntity[];
  claims?: DocumentImageVlmClaim[];
  chartOrTableDetected?: boolean;
  tableLikeSignals?: string[];
  transcribedText?: string;
};

export type DocumentImageVlmResult = {
  content: string;
  model: string;
  provider: 'openclaw-skill';
  capability: DocumentImageVlmCapability;
  parsed: DocumentImageVlmPayload | null;
};

export type DocumentImageVlmPromptField = {
  key: string;
  alias?: string;
  required?: boolean;
  prompt?: string;
};
