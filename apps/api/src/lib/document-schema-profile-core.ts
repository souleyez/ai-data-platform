import { applyDocumentExtractionFieldGovernance } from './document-extraction-governance.js';
import { buildCommonFieldDetails } from './document-schema-field-details.js';
import type { BuildStructuredProfileInput } from './document-schema-profile-types.js';

export type StructuredProfileBaseParts = {
  evidence: string;
  base: {
    title: string;
    summary: string;
    topicTags: string[];
    fieldDetails: Record<string, unknown>;
    tableSummary?: BuildStructuredProfileInput['tableSummary'];
  };
  contractFields: ReturnType<typeof applyDocumentExtractionFieldGovernance<NonNullable<BuildStructuredProfileInput['contractFields']>>> | undefined;
  enterpriseGuidanceFields: ReturnType<typeof applyDocumentExtractionFieldGovernance<NonNullable<BuildStructuredProfileInput['enterpriseGuidanceFields']>>> | undefined;
  orderFields: ReturnType<typeof applyDocumentExtractionFieldGovernance<NonNullable<BuildStructuredProfileInput['orderFields']>>> | undefined;
  footfallFields: ReturnType<typeof applyDocumentExtractionFieldGovernance<NonNullable<BuildStructuredProfileInput['footfallFields']>>> | undefined;
  resumeFields: ReturnType<typeof applyDocumentExtractionFieldGovernance<NonNullable<BuildStructuredProfileInput['resumeFields']>>> | undefined;
};

export function buildStructuredProfileBase(input: BuildStructuredProfileInput): StructuredProfileBaseParts {
  const evidence = `${input.title} ${input.summary} ${input.topicTags.join(' ')}`.toLowerCase();
  const contractFields = applyDocumentExtractionFieldGovernance(input.contractFields, input.extractionProfile);
  const enterpriseGuidanceFields = applyDocumentExtractionFieldGovernance(
    input.enterpriseGuidanceFields,
    input.extractionProfile,
  );
  const orderFields = applyDocumentExtractionFieldGovernance(input.orderFields, input.extractionProfile);
  const footfallFields = applyDocumentExtractionFieldGovernance(input.footfallFields, input.extractionProfile);
  const resumeFields = applyDocumentExtractionFieldGovernance(input.resumeFields, input.extractionProfile);
  const base = {
    title: input.title,
    summary: input.summary,
    topicTags: input.topicTags.slice(0, 8),
    fieldDetails: buildCommonFieldDetails(input),
    ...(input.tableSummary ? { tableSummary: input.tableSummary } : {}),
  };

  return {
    evidence,
    base,
    contractFields,
    enterpriseGuidanceFields,
    orderFields,
    footfallFields,
    resumeFields,
  };
}
