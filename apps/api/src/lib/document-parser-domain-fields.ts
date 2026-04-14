import type { DocumentCategoryConfig } from './document-config.js';
import type {
  DocumentExtractionProfile,
} from './document-extraction-governance.js';
import type {
  ParsedDocument,
  ResumeFields,
  StructuredClaim,
  StructuredEntity,
  TableSummary,
} from './document-parser.js';
import { normalizeTableColumnKey } from './document-parser-table-summary.js';
import { extractContractFields as extractContractFieldsInternal, extractEnterpriseGuidanceFields as extractEnterpriseGuidanceFieldsInternal, refineEnterpriseGuidanceFields as refineEnterpriseGuidanceFieldsInternal } from './document-parser-guidance-fields.js';
import { extractResumeFields as extractResumeFieldsInternal } from './document-parser-resume-fields.js';
import {
  applyGovernedSchemaType as applyGovernedSchemaTypeInternal,
  applyGovernedSchemaTypeWithEnterpriseGuidance as applyGovernedSchemaTypeWithEnterpriseGuidanceInternal,
  detectBizCategory as detectBizCategoryInternal,
  detectCategory as detectCategoryInternal,
  detectRiskLevel as detectRiskLevelInternal,
  detectTopicTags as detectTopicTagsInternal,
  mergeGovernedTopicTags as mergeGovernedTopicTagsInternal,
  shouldForceExtraction,
} from './document-parser-classification.js';
import { extractFootfallFields as extractFootfallFieldsInternal, extractOrderFields as extractOrderFieldsInternal } from './document-parser-table-derived-fields.js';

export function detectCategory(filePath: string, text = '') {
  return detectCategoryInternal(filePath, text);
}

export function detectBizCategory(filePath: string, category: string, text = '', config?: DocumentCategoryConfig): ParsedDocument['bizCategory'] {
  return detectBizCategoryInternal(filePath, category, text, config);
}

export function extractResumeFields(
  text: string,
  title: string,
  entities: StructuredEntity[] = [],
  claims: StructuredClaim[] = [],
  options?: { force?: boolean },
): ResumeFields | undefined {
  return extractResumeFieldsInternal(text, title, entities, claims, options);
}

export function detectRiskLevel(text: string, category: string): 'low' | 'medium' | 'high' | undefined {
  return detectRiskLevelInternal(text, category);
}

export function detectTopicTags(text: string, category: string, bizCategory: ParsedDocument['bizCategory']) {
  return detectTopicTagsInternal(text, category, bizCategory);
}

export function applyGovernedSchemaType(
  inferredSchemaType: ParsedDocument['schemaType'],
  profile: DocumentExtractionProfile | null | undefined,
): ParsedDocument['schemaType'] {
  return applyGovernedSchemaTypeInternal(inferredSchemaType, profile);
}

export function applyGovernedSchemaTypeWithEnterpriseGuidance(
  inferredSchemaType: ParsedDocument['schemaType'],
  profile: DocumentExtractionProfile | null | undefined,
  enterpriseGuidanceFields: ParsedDocument['enterpriseGuidanceFields'] | undefined,
): ParsedDocument['schemaType'] {
  return applyGovernedSchemaTypeWithEnterpriseGuidanceInternal(inferredSchemaType, profile, enterpriseGuidanceFields);
}

export function mergeGovernedTopicTags(topicTags: string[], profile: DocumentExtractionProfile | null | undefined) {
  return mergeGovernedTopicTagsInternal(topicTags, profile);
}

export function extractContractFields(text: string, category: string, profile?: DocumentExtractionProfile | null) {
  return extractContractFieldsInternal(text, category, profile, { shouldForceExtraction });
}

export function extractEnterpriseGuidanceFields(
  text: string,
  title: string,
  topicTags: string[],
  category: string,
  profile?: DocumentExtractionProfile | null,
): ParsedDocument['enterpriseGuidanceFields'] | undefined {
  return extractEnterpriseGuidanceFieldsInternal(text, title, topicTags, category, profile, {
    shouldForceExtraction,
  });
}

export function refineEnterpriseGuidanceFields(
  fields: ParsedDocument['enterpriseGuidanceFields'] | undefined,
  input: {
    text: string;
    title: string;
    topicTags: string[];
    profile?: DocumentExtractionProfile | null;
  },
): ParsedDocument['enterpriseGuidanceFields'] | undefined {
  return refineEnterpriseGuidanceFieldsInternal(fields, input, { shouldForceExtraction });
}

export function extractOrderFields(
  text: string,
  title: string,
  bizCategory: ParsedDocument['bizCategory'],
  topicTags: string[],
  profile?: DocumentExtractionProfile | null,
  tableSummary?: TableSummary,
): ParsedDocument['orderFields'] | undefined {
  return extractOrderFieldsInternal(text, title, bizCategory, topicTags, profile, tableSummary, {
    normalizeTableColumnKey,
    shouldForceExtraction,
  });
}

export function extractFootfallFields(
  text: string,
  title: string,
  bizCategory: ParsedDocument['bizCategory'],
  topicTags: string[],
  tableSummary?: TableSummary,
): ParsedDocument['footfallFields'] | undefined {
  return extractFootfallFieldsInternal(text, title, bizCategory, topicTags, tableSummary, {
    normalizeTableColumnKey,
    shouldForceExtraction,
  });
}
