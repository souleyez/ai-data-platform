import type {
  EvidenceChunk,
  IntentSlots,
  ParsedDocument,
  ResumeFields,
  StructuredClaim,
  StructuredEntity,
} from './document-parser.js';

type ResultCommonInput = {
  filePath: string;
  name: string;
  ext: string;
  title: string;
  category: string;
  bizCategory: ParsedDocument['bizCategory'];
  parseMethod: string;
  markdownText?: string;
  markdownMethod?: ParsedDocument['markdownMethod'];
  markdownGeneratedAt?: string;
  markdownError?: string;
  canonicalParseStatus: ParsedDocument['canonicalParseStatus'];
  topicTags: string[];
  parseStage: ParsedDocument['parseStage'];
  detailParseStatus: ParsedDocument['detailParseStatus'];
  detailParseQueuedAt?: string;
  detailParsedAt?: string;
  detailParseAttempts?: number;
  schemaType?: ParsedDocument['schemaType'];
  structuredProfile?: ParsedDocument['structuredProfile'];
};

type ParsedResultCommonInput = ResultCommonInput & {
  summary: string;
  excerpt: string;
  fullText: string;
  extractedChars: number;
  evidenceChunks: EvidenceChunk[];
  entities: StructuredEntity[];
  claims: StructuredClaim[];
  intentSlots: IntentSlots;
  resumeFields?: ResumeFields;
  riskLevel?: ParsedDocument['riskLevel'];
  contractFields?: ParsedDocument['contractFields'];
  enterpriseGuidanceFields?: ParsedDocument['enterpriseGuidanceFields'];
  orderFields?: ParsedDocument['orderFields'];
  footfallFields?: ParsedDocument['footfallFields'];
};

function buildCommonResult(input: ResultCommonInput) {
  return {
    path: input.filePath,
    name: input.name,
    ext: input.ext,
    title: input.title,
    category: input.category,
    bizCategory: input.bizCategory,
    parseMethod: input.parseMethod,
    markdownText: input.markdownText || undefined,
    markdownMethod: input.markdownMethod,
    markdownGeneratedAt: input.markdownGeneratedAt,
    markdownError: input.markdownError,
    canonicalParseStatus: input.canonicalParseStatus,
    topicTags: input.topicTags,
    groups: [],
    parseStage: input.parseStage,
    detailParseStatus: input.detailParseStatus,
    detailParseQueuedAt: input.detailParseQueuedAt,
    detailParsedAt: input.detailParsedAt,
    detailParseAttempts: input.detailParseAttempts,
    schemaType: input.schemaType,
    structuredProfile: input.structuredProfile,
  } satisfies Partial<ParsedDocument>;
}

export function buildUnsupportedParsedDocument(
  input: ResultCommonInput & {
    unsupportedSummary: string;
    fullText: string;
  },
): ParsedDocument {
  return {
    ...buildCommonResult(input),
    parseStatus: 'unsupported',
    summary: input.unsupportedSummary,
    excerpt: input.unsupportedSummary,
    fullText: input.fullText,
    canonicalParseStatus: 'unsupported',
    extractedChars: 0,
    evidenceChunks: [],
    entities: [],
    claims: [],
    intentSlots: {},
  };
}

export function buildParseErrorParsedDocument(
  input: ResultCommonInput & {
    fallbackSummary: string;
    fullText: string;
    detailParseError?: string;
  },
): ParsedDocument {
  return {
    ...buildCommonResult(input),
    parseStatus: 'error',
    summary: input.fallbackSummary,
    excerpt: input.fallbackSummary,
    fullText: input.fullText,
    canonicalParseStatus: 'failed',
    extractedChars: 0,
    evidenceChunks: [],
    entities: [],
    claims: [],
    intentSlots: {},
    detailParseError: input.detailParseError,
  };
}

export function buildQuickParsedDocument(input: ParsedResultCommonInput): ParsedDocument {
  return {
    ...buildCommonResult(input),
    parseStatus: 'parsed',
    summary: input.summary,
    excerpt: input.excerpt,
    fullText: input.fullText,
    extractedChars: input.extractedChars,
    evidenceChunks: input.evidenceChunks,
    entities: input.entities,
    claims: input.claims,
    intentSlots: input.intentSlots,
    resumeFields: input.resumeFields,
    contractFields: input.contractFields,
    enterpriseGuidanceFields: input.enterpriseGuidanceFields,
    orderFields: input.orderFields,
    footfallFields: input.footfallFields,
    riskLevel: input.riskLevel,
  };
}

export function buildDetailedParsedDocument(input: ParsedResultCommonInput): ParsedDocument {
  return {
    ...buildCommonResult(input),
    parseStatus: 'parsed',
    summary: input.summary,
    excerpt: input.excerpt,
    fullText: input.fullText,
    extractedChars: input.extractedChars,
    evidenceChunks: input.evidenceChunks,
    entities: input.entities,
    claims: input.claims,
    intentSlots: input.intentSlots,
    resumeFields: input.resumeFields,
    contractFields: input.contractFields,
    enterpriseGuidanceFields: input.enterpriseGuidanceFields,
    orderFields: input.orderFields,
    footfallFields: input.footfallFields,
    riskLevel: input.riskLevel,
  };
}

export function buildCatchErrorParsedDocument(
  input: ResultCommonInput & {
    fallbackSummary: string;
    detailParseError?: string;
  },
): ParsedDocument {
  return {
    ...buildCommonResult(input),
    parseStatus: 'error',
    summary: input.fallbackSummary,
    excerpt: input.fallbackSummary,
    fullText: '',
    canonicalParseStatus: 'failed',
    extractedChars: 0,
    evidenceChunks: [],
    entities: [],
    claims: [],
    intentSlots: {},
    detailParseError: input.detailParseError,
  };
}
