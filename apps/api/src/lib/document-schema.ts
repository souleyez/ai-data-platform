import type { EvidenceChunk, ParsedDocument, ResumeFields, TableSummary } from './document-parser.js';
import { type DocumentLibraryContext } from './document-extraction-governance.js';
import {
  applyGovernedSchemaType,
  inferSchemaType,
  mergeGovernedTopicTags,
} from './document-schema-heuristics.js';
import { buildStructuredProfile } from './document-schema-profile-builder.js';

export { includesAnyText, inferSchemaType, isLikelyResumePersonName } from './document-schema-heuristics.js';
export { buildStructuredProfile } from './document-schema-profile-builder.js';

export function deriveSchemaProfile(input: {
  category: string;
  bizCategory: ParsedDocument['bizCategory'];
  title: string;
  topicTags: string[];
  summary: string;
  contractFields?: ParsedDocument['contractFields'];
  enterpriseGuidanceFields?: ParsedDocument['enterpriseGuidanceFields'];
  orderFields?: ParsedDocument['orderFields'];
  footfallFields?: ParsedDocument['footfallFields'];
  resumeFields?: ResumeFields;
  evidenceChunks?: EvidenceChunk[];
  libraryContext?: DocumentLibraryContext;
  tableSummary?: TableSummary;
}) {
  const { topicTags, profile } = mergeGovernedTopicTags(input.topicTags, input.libraryContext);
  const schemaType = applyGovernedSchemaType(
    inferSchemaType(
      input.category,
      input.bizCategory,
      input.resumeFields,
      topicTags,
      input.title,
      input.summary,
    ),
    profile?.fallbackSchemaType,
  );

  return {
    topicTags,
    schemaType,
    resumeFields: input.resumeFields,
    structuredProfile: buildStructuredProfile({
      schemaType,
      title: input.title,
      topicTags,
      summary: input.summary,
      contractFields: input.contractFields,
      enterpriseGuidanceFields: input.enterpriseGuidanceFields,
      orderFields: input.orderFields,
      footfallFields: input.footfallFields,
      resumeFields: input.resumeFields,
      evidenceChunks: input.evidenceChunks,
      tableSummary: input.tableSummary,
      extractionProfile: profile ? {
        fieldSet: profile.fieldSet,
        preferredFieldKeys: profile.preferredFieldKeys,
        requiredFieldKeys: profile.requiredFieldKeys,
        fieldAliases: profile.fieldAliases,
        fieldPrompts: profile.fieldPrompts,
        fieldNormalizationRules: profile.fieldNormalizationRules,
        fieldConflictStrategies: profile.fieldConflictStrategies,
      } : undefined,
    }),
  };
}

export function refreshDerivedSchemaProfile(item: ParsedDocument): ParsedDocument {
  if (!item) return item;
  const derived = deriveSchemaProfile({
    category: item.category,
    bizCategory: item.bizCategory,
    title: item.title || item.name,
    topicTags: item.topicTags || [],
    summary: item.summary || '',
    contractFields: item.contractFields,
    enterpriseGuidanceFields: item.enterpriseGuidanceFields,
    orderFields: item.orderFields,
    footfallFields: item.footfallFields,
    resumeFields: item.resumeFields,
    evidenceChunks: item.evidenceChunks,
    libraryContext: {
      keys: item.confirmedGroups?.length ? item.confirmedGroups : item.groups || [],
      labels: item.confirmedGroups?.length ? item.confirmedGroups : item.groups || [],
    },
    tableSummary: item.structuredProfile?.tableSummary as TableSummary | undefined,
  });

  return {
    ...item,
    topicTags: derived.topicTags,
    resumeFields: derived.resumeFields,
    schemaType: derived.schemaType,
    structuredProfile: item.manualStructuredProfile && item.structuredProfile
      ? item.structuredProfile
      : derived.structuredProfile,
  };
}
