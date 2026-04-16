import { buildContractStructuredProfile, buildResumeStructuredProfile } from './document-schema-profile-contract-resume.js';
import { buildStructuredProfileBase } from './document-schema-profile-core.js';
import { buildOrderStructuredProfile, buildReportStructuredProfile, buildTechnicalStructuredProfile } from './document-schema-profile-business.js';
import type { BuildStructuredProfileInput } from './document-schema-profile-types.js';

export type { BuildStructuredProfileInput } from './document-schema-profile-types.js';

export function buildStructuredProfile(input: BuildStructuredProfileInput) {
  const parts = buildStructuredProfileBase(input);
  const { base } = parts;

  if (input.schemaType === 'contract') {
    return buildContractStructuredProfile(input, parts);
  }

  if (input.schemaType === 'resume') {
    return buildResumeStructuredProfile(input, parts);
  }

  if (input.schemaType === 'formula') {
    return {
      ...base,
      domain: 'formula',
      focus: input.topicTags.filter((tag) => ['奶粉配方', '益生菌', '营养强化'].includes(tag)),
    };
  }

  if (input.schemaType === 'paper') {
    return {
      ...base,
      domain: 'paper',
      focus: input.topicTags.slice(0, 4),
    };
  }

  if (input.schemaType === 'technical') {
    return buildTechnicalStructuredProfile(input, parts);
  }

  if (input.schemaType === 'order') {
    return buildOrderStructuredProfile(input, parts);
  }

  if (input.schemaType === 'report') {
    return buildReportStructuredProfile(input, parts);
  }

  return base;
}
