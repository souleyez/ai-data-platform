import { type DocumentExtractionProfile } from './document-extraction-governance.js';
import { buildEvidence } from './document-parser-metadata.js';
import {
  applyGovernedSchemaType,
  detectTopicTags,
  mergeGovernedTopicTags,
} from './document-parser-domain-fields.js';
import { inferSchemaType } from './document-schema.js';
import {
  DOCUMENT_AUDIO_EXTENSIONS,
  DOCUMENT_IMAGE_EXTENSIONS,
  DOCUMENT_PRESENTATION_EXTENSIONS,
  type ParsedDocument,
  type TableSummary,
} from './document-parser-types.js';

export type ParseBranchSharedInput = {
  filePath: string;
  name: string;
  ext: string;
  category: string;
  bizCategory: ParsedDocument['bizCategory'];
  parseMethod: string;
  markdownText: string;
  markdownMethod?: ParsedDocument['markdownMethod'];
  markdownGeneratedAt?: string;
  markdownError?: string;
  parseStage: 'quick' | 'detailed';
  defaultDetailParseStatus: ParsedDocument['detailParseStatus'];
  defaultDetailQueuedAt?: string;
  defaultDetailParsedAt?: string;
  defaultDetailAttempts: number;
  extractionProfile: DocumentExtractionProfile | null;
  structuredExtractionProfile?: DocumentExtractionProfile;
  tableSummary?: TableSummary;
};

export const IMAGE_EXTENSIONS = new Set<string>(DOCUMENT_IMAGE_EXTENSIONS);
export const PRESENTATION_EXTENSIONS = new Set<string>(DOCUMENT_PRESENTATION_EXTENSIONS);
export const AUDIO_EXTENSIONS = new Set<string>(DOCUMENT_AUDIO_EXTENSIONS);

export function buildGovernedTopicSchema(
  filePath: string,
  category: string,
  bizCategory: ParsedDocument['bizCategory'],
  extractionProfile: DocumentExtractionProfile | null,
) {
  const topicTags = mergeGovernedTopicTags(
    detectTopicTags(buildEvidence(filePath), category, bizCategory),
    extractionProfile,
  );
  const schemaType = applyGovernedSchemaType(
    inferSchemaType(category, bizCategory, undefined, topicTags),
    extractionProfile,
  );
  return { topicTags, schemaType };
}
