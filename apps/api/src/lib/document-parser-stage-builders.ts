import path from 'node:path';
import { buildStructuredProfile } from './document-schema.js';
import {
  buildCatchErrorParsedDocument,
  buildDetailedParsedDocument,
  buildQuickParsedDocument,
} from './document-parser-result-builders.js';
import type {
  EvidenceChunk,
  ParsedDocument,
  StructuredClaim,
  StructuredEntity,
  TableSummary,
} from './document-parser-types.js';
import type { DocumentExtractionProfile } from './document-extraction-governance.js';

type SharedStageInput = {
  filePath: string;
  name: string;
  ext: string;
  title: string;
  category: string;
  bizCategory: ParsedDocument['bizCategory'];
  parseMethod: string;
  summary: string;
  excerpt: string;
  fullText: string;
  markdownText: string;
  markdownMethod: ParsedDocument['markdownMethod'];
  markdownGeneratedAt?: string;
  markdownError?: string;
  canonicalParseStatus: ParsedDocument['canonicalParseStatus'];
  extractedChars: number;
  topicTags: string[];
  parseStage: 'quick' | 'detailed';
  detailParseStatus: ParsedDocument['detailParseStatus'];
  detailParseQueuedAt?: string;
  detailParsedAt?: string;
  detailParseAttempts: number;
  schemaType: ParsedDocument['schemaType'];
  extractionProfile: DocumentExtractionProfile | undefined;
  tableSummary?: TableSummary;
  contractFields?: ParsedDocument['contractFields'];
  enterpriseGuidanceFields?: ParsedDocument['enterpriseGuidanceFields'];
  orderFields?: ParsedDocument['orderFields'];
  footfallFields?: ParsedDocument['footfallFields'];
  resumeFields?: ParsedDocument['resumeFields'];
  riskLevel?: ParsedDocument['riskLevel'];
};

export function buildQuickStageParsedDocument(
  input: SharedStageInput,
) {
  return buildQuickParsedDocument({
    ...input,
    evidenceChunks: [],
    entities: [],
    claims: [],
    intentSlots: {},
    structuredProfile: buildStructuredProfile({
      schemaType: input.schemaType,
      title: input.title,
      topicTags: input.topicTags,
      summary: input.summary,
      contractFields: input.contractFields,
      enterpriseGuidanceFields: input.enterpriseGuidanceFields,
      orderFields: input.orderFields,
      footfallFields: input.footfallFields,
      resumeFields: input.resumeFields,
      evidenceChunks: [],
      tableSummary: input.tableSummary,
      extractionProfile: input.extractionProfile,
    }),
  });
}

type DetailedStageInput = SharedStageInput & {
  evidenceChunks: EvidenceChunk[];
  entities: StructuredEntity[];
  claims: StructuredClaim[];
  intentSlots: NonNullable<ParsedDocument['intentSlots']>;
};

export function buildDetailedStageParsedDocument(
  input: DetailedStageInput,
) {
  return buildDetailedParsedDocument({
    ...input,
    structuredProfile: buildStructuredProfile({
      schemaType: input.schemaType,
      title: input.title,
      topicTags: input.topicTags,
      summary: input.summary,
      contractFields: input.contractFields,
      enterpriseGuidanceFields: input.enterpriseGuidanceFields,
      orderFields: input.orderFields,
      footfallFields: input.footfallFields,
      resumeFields: input.resumeFields,
      evidenceChunks: input.evidenceChunks,
      tableSummary: input.tableSummary,
      extractionProfile: input.extractionProfile,
    }),
  });
}

type CatchStageInput = {
  filePath: string;
  name: string;
  ext: string;
  category: string;
  bizCategory: ParsedDocument['bizCategory'];
  fallbackSummary: string;
  topicTags: string[];
  parseStage: 'quick' | 'detailed';
  detailParseQueuedAt?: string;
  detailParsedAt?: string;
  detailParseAttempts: number;
  schemaType: ParsedDocument['schemaType'];
  extractionProfile: DocumentExtractionProfile | undefined;
};

export function buildCatchStageParsedDocument(input: CatchStageInput) {
  return buildCatchErrorParsedDocument({
    filePath: input.filePath,
    name: input.name,
    ext: input.ext,
    title: path.parse(input.name).name,
    category: input.category,
    bizCategory: input.bizCategory,
    parseMethod: 'error',
    fallbackSummary: input.fallbackSummary,
    markdownText: undefined,
    markdownMethod: undefined,
    markdownGeneratedAt: undefined,
    markdownError: undefined,
    canonicalParseStatus: 'failed',
    topicTags: input.topicTags,
    parseStage: input.parseStage,
    detailParseStatus: input.parseStage === 'quick' ? 'queued' : 'failed',
    detailParseQueuedAt: input.detailParseQueuedAt,
    detailParsedAt: input.detailParsedAt,
    detailParseAttempts: input.detailParseAttempts,
    detailParseError: input.parseStage === 'detailed' ? 'parse-error' : undefined,
    schemaType: input.schemaType,
    structuredProfile: buildStructuredProfile({
      schemaType: input.schemaType,
      title: path.parse(input.name).name,
      topicTags: input.topicTags,
      summary: input.fallbackSummary,
      evidenceChunks: [],
      tableSummary: undefined,
      extractionProfile: input.extractionProfile,
    }),
  });
}
