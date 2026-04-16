import { applyDocumentParseFeedback } from './document-parse-feedback.js';
import { extractStructuredData } from './document-parser-structured-data.js';
import { splitEvidenceChunks } from './document-parser-evidence.js';
import { extractDocumentDomainState } from './document-parser-domain-extraction.js';
import {
  detectRiskLevel,
  extractContractFields,
} from './document-parser-domain-fields.js';
import {
  buildDetailedStageParsedDocument,
  buildQuickStageParsedDocument,
} from './document-parser-stage-builders.js';
import type { ParsedDocument } from './document-parser-types.js';
import type { ParseBranchSharedInput } from './document-parser-parse-branch-support.js';

export function buildQuickParseResult(
  input: ParseBranchSharedInput & {
    activeText: string;
    normalizedText: string;
    summary: string;
    excerptText: string;
    inferredTitle: string;
    canonicalParseStatus: ParsedDocument['canonicalParseStatus'];
    topicTags: string[];
    feedbackLibraryKeys: string[];
  },
): ParsedDocument {
  const quickText = input.activeText.slice(0, 2400);
  const {
    contractFields,
    resumeFields,
    enterpriseGuidanceFields,
    orderFields,
    footfallFields,
    schemaType,
  } = extractDocumentDomainState({
    libraryKeys: input.feedbackLibraryKeys,
    text: quickText,
    normalizedText: quickText,
    inferredTitle: input.inferredTitle,
    category: input.category,
    bizCategory: input.bizCategory,
    topicTags: input.topicTags,
    extractionProfile: input.extractionProfile,
    tableSummary: input.tableSummary,
    summary: input.summary,
  });

  return buildQuickStageParsedDocument({
    filePath: input.filePath,
    name: input.name,
    ext: input.ext,
    title: input.inferredTitle,
    category: input.category,
    bizCategory: input.bizCategory,
    parseMethod: input.parseMethod,
    summary: input.summary,
    excerpt: input.excerptText,
    fullText: input.activeText,
    markdownText: input.markdownText,
    markdownMethod: input.markdownMethod,
    markdownGeneratedAt: input.markdownGeneratedAt,
    markdownError: input.markdownError,
    canonicalParseStatus: input.canonicalParseStatus,
    extractedChars: input.normalizedText.length,
    resumeFields,
    contractFields,
    enterpriseGuidanceFields,
    orderFields,
    footfallFields,
    riskLevel: detectRiskLevel(input.normalizedText, input.category),
    topicTags: input.topicTags,
    parseStage: input.parseStage,
    detailParseStatus: input.defaultDetailParseStatus,
    detailParseQueuedAt: input.defaultDetailQueuedAt,
    detailParsedAt: input.defaultDetailParsedAt,
    detailParseAttempts: input.defaultDetailAttempts,
    schemaType,
    extractionProfile: input.structuredExtractionProfile,
    tableSummary: input.tableSummary,
  });
}

export async function buildDetailedParseResult(
  input: ParseBranchSharedInput & {
    activeText: string;
    normalizedText: string;
    summary: string;
    excerptText: string;
    inferredTitle: string;
    canonicalParseStatus: ParsedDocument['canonicalParseStatus'];
    topicTags: string[];
    feedbackLibraryKeys: string[];
  },
): Promise<ParsedDocument> {
  const evidenceChunks = splitEvidenceChunks(input.activeText);
  const contractFields = applyDocumentParseFeedback({
    libraryKeys: input.feedbackLibraryKeys,
    schemaType: 'contract',
    text: input.activeText,
    fields: extractContractFields(input.normalizedText, input.category, input.extractionProfile),
  });
  const structured = await extractStructuredData(
    input.normalizedText,
    input.category,
    evidenceChunks,
    input.topicTags,
    contractFields,
  );
  const {
    resumeFields,
    enterpriseGuidanceFields,
    orderFields,
    footfallFields,
    schemaType,
  } = extractDocumentDomainState({
    libraryKeys: input.feedbackLibraryKeys,
    text: input.activeText,
    normalizedText: input.normalizedText,
    inferredTitle: input.inferredTitle,
    category: input.category,
    bizCategory: input.bizCategory,
    topicTags: input.topicTags,
    extractionProfile: input.extractionProfile,
    tableSummary: input.tableSummary,
    summary: input.summary,
    precomputedContractFields: contractFields,
    structuredEntities: structured.entities,
    structuredClaims: structured.claims,
  });

  return buildDetailedStageParsedDocument({
    filePath: input.filePath,
    name: input.name,
    ext: input.ext,
    title: input.inferredTitle,
    category: input.category,
    bizCategory: input.bizCategory,
    parseMethod: input.parseMethod,
    summary: input.summary,
    excerpt: input.excerptText,
    fullText: input.activeText,
    markdownText: input.markdownText,
    markdownMethod: input.markdownMethod,
    markdownGeneratedAt: input.markdownGeneratedAt,
    markdownError: input.markdownError,
    canonicalParseStatus: input.canonicalParseStatus,
    extractedChars: input.normalizedText.length,
    evidenceChunks,
    entities: structured.entities,
    claims: structured.claims,
    intentSlots: structured.intentSlots || {},
    resumeFields,
    enterpriseGuidanceFields,
    orderFields,
    footfallFields,
    riskLevel: detectRiskLevel(input.normalizedText, input.category),
    topicTags: input.topicTags,
    contractFields,
    parseStage: input.parseStage,
    detailParseStatus: input.defaultDetailParseStatus,
    detailParseQueuedAt: input.defaultDetailQueuedAt,
    detailParsedAt: input.defaultDetailParsedAt,
    detailParseAttempts: input.defaultDetailAttempts,
    schemaType,
    extractionProfile: input.structuredExtractionProfile,
    tableSummary: input.tableSummary,
  });
}
