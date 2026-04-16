import type { DocumentExtractionProfile } from './document-extraction-governance.js';
import type { EnterpriseGuidanceFields } from './document-parser-guidance-fields.js';
import type { ParsedSchemaType } from './document-parser-classification.js';

export function shouldForceExtraction(
  profile: DocumentExtractionProfile | null | undefined,
  fieldSet: DocumentExtractionProfile['fieldSet'],
) {
  return profile?.fieldSet === fieldSet;
}

export function applyGovernedSchemaType(
  inferredSchemaType: ParsedSchemaType | undefined,
  profile: DocumentExtractionProfile | null | undefined,
): ParsedSchemaType | undefined {
  if (!profile?.fallbackSchemaType) return inferredSchemaType;
  if (inferredSchemaType === profile.fallbackSchemaType) return inferredSchemaType;

  if (profile.fallbackSchemaType === 'contract' && inferredSchemaType === 'generic') return 'contract';
  if (profile.fallbackSchemaType === 'resume' && inferredSchemaType === 'generic') return 'resume';
  if (profile.fallbackSchemaType === 'order' && ['generic', 'report'].includes(String(inferredSchemaType))) return 'order';
  if (profile.fallbackSchemaType === 'technical' && inferredSchemaType === 'generic') return 'technical';

  return inferredSchemaType;
}

export function applyGovernedSchemaTypeWithEnterpriseGuidance(
  inferredSchemaType: ParsedSchemaType | undefined,
  profile: DocumentExtractionProfile | null | undefined,
  enterpriseGuidanceFields: EnterpriseGuidanceFields | undefined,
): ParsedSchemaType | undefined {
  const governed = applyGovernedSchemaType(inferredSchemaType, profile);
  if (profile?.fieldSet !== 'enterprise-guidance') return governed;
  if (!enterpriseGuidanceFields) return governed;
  if (governed === 'resume' || governed === 'order') return governed;

  const hasGuidanceSignal = Boolean(
    enterpriseGuidanceFields.businessSystem
    || enterpriseGuidanceFields.documentKind
    || enterpriseGuidanceFields.applicableScope
    || enterpriseGuidanceFields.operationEntry
    || enterpriseGuidanceFields.approvalLevels?.length
    || enterpriseGuidanceFields.policyFocus?.length
    || enterpriseGuidanceFields.contacts?.length
  );

  if (hasGuidanceSignal && ['generic', 'contract', 'paper', 'report', 'technical'].includes(String(governed))) {
    return 'technical';
  }

  return governed;
}

export function mergeGovernedTopicTags(topicTags: string[], profile: DocumentExtractionProfile | null | undefined) {
  if (!profile) return topicTags;

  const governedTags = profile.fieldSet === 'contract'
    ? ['合同']
    : profile.fieldSet === 'resume'
      ? ['人才简历']
      : profile.fieldSet === 'order'
        ? ['订单分析']
        : ['企业规范'];

  return [...new Set([...topicTags, ...governedTags])];
}
