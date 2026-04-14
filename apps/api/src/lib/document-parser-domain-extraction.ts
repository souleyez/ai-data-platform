import { applyDocumentParseFeedback } from './document-parse-feedback.js';
import { inferSchemaType } from './document-schema.js';
import { shouldForceExtraction } from './document-parser-classification.js';
import {
  applyGovernedSchemaTypeWithEnterpriseGuidance,
  extractContractFields,
  extractEnterpriseGuidanceFields,
  extractFootfallFields,
  extractOrderFields,
  extractResumeFields,
  refineEnterpriseGuidanceFields,
} from './document-parser-domain-fields.js';
import type {
  ParsedDocument,
  StructuredClaim,
  StructuredEntity,
  TableSummary,
} from './document-parser-types.js';
import type { DocumentExtractionProfile } from './document-extraction-governance.js';

type ExtractDocumentDomainStateInput = {
  libraryKeys: string[];
  text: string;
  normalizedText: string;
  inferredTitle: string;
  category: string;
  bizCategory: ParsedDocument['bizCategory'];
  topicTags: string[];
  extractionProfile: DocumentExtractionProfile | null;
  tableSummary?: TableSummary;
  summary: string;
  precomputedContractFields?: ParsedDocument['contractFields'];
  structuredEntities?: StructuredEntity[];
  structuredClaims?: StructuredClaim[];
};

export function extractDocumentDomainState(input: ExtractDocumentDomainStateInput) {
  const contractFields = input.precomputedContractFields || applyDocumentParseFeedback({
    libraryKeys: input.libraryKeys,
    schemaType: 'contract',
    text: input.text,
    fields: extractContractFields(input.normalizedText, input.category, input.extractionProfile),
  });
  const resumeFields = applyDocumentParseFeedback({
    libraryKeys: input.libraryKeys,
    schemaType: 'resume',
    text: input.text,
    fields: extractResumeFields(
      input.text,
      input.inferredTitle,
      input.structuredEntities || [],
      input.structuredClaims || [],
      { force: shouldForceExtraction(input.extractionProfile, 'resume') },
    ),
  });
  const enterpriseGuidanceFields = applyDocumentParseFeedback({
    libraryKeys: input.libraryKeys,
    schemaType: 'technical',
    text: input.text,
    fields: refineEnterpriseGuidanceFields(
      extractEnterpriseGuidanceFields(
        input.text,
        input.inferredTitle,
        input.topicTags,
        input.category,
        input.extractionProfile,
      ),
      {
        text: input.text,
        title: input.inferredTitle,
        topicTags: input.topicTags,
        profile: input.extractionProfile,
      },
    ),
  });
  const orderFields = applyDocumentParseFeedback({
    libraryKeys: input.libraryKeys,
    schemaType: 'order',
    text: input.text,
    fields: extractOrderFields(
      input.text,
      input.inferredTitle,
      input.bizCategory,
      input.topicTags,
      input.extractionProfile,
      input.tableSummary,
    ),
  });
  const footfallFields = extractFootfallFields(
    input.text,
    input.inferredTitle,
    input.bizCategory,
    input.topicTags,
    input.tableSummary,
  );
  const schemaType = applyGovernedSchemaTypeWithEnterpriseGuidance(
    inferSchemaType(
      input.category,
      input.bizCategory,
      resumeFields,
      input.topicTags,
      input.inferredTitle,
      input.summary,
    ),
    input.extractionProfile,
    enterpriseGuidanceFields,
  );

  return {
    contractFields,
    resumeFields,
    enterpriseGuidanceFields,
    orderFields,
    footfallFields,
    schemaType,
  };
}
