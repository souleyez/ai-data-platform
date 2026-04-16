import type { EvidenceChunk, ParsedDocument, ResumeFields, TableSummary } from './document-parser.js';
import type { DocumentExtractionProfile } from './document-extraction-governance.js';

export type BuildStructuredProfileInput = {
  schemaType: ParsedDocument['schemaType'];
  title: string;
  topicTags: string[];
  summary: string;
  contractFields?: ParsedDocument['contractFields'];
  enterpriseGuidanceFields?: ParsedDocument['enterpriseGuidanceFields'];
  orderFields?: ParsedDocument['orderFields'];
  footfallFields?: ParsedDocument['footfallFields'];
  resumeFields?: ResumeFields;
  evidenceChunks?: EvidenceChunk[];
  tableSummary?: TableSummary;
  extractionProfile?: Pick<
    DocumentExtractionProfile,
    | 'fieldSet'
    | 'preferredFieldKeys'
    | 'requiredFieldKeys'
    | 'fieldAliases'
    | 'fieldPrompts'
    | 'fieldNormalizationRules'
    | 'fieldConflictStrategies'
  >;
};
