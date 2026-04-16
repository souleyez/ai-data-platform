import type { ReportGroup } from './report-center.js';
import {
  buildSearchText,
  computeKeywordMatchScore,
  interpolateTemplate,
  resolveKeywordMatch,
} from './report-governance-normalization.js';
import { readReportGovernanceConfig } from './report-governance-storage.js';
import type {
  RequestedKnowledgeOutputKind,
  ReportGovernanceDatasourceProfile,
  ReportGovernanceRequestAdapterEnvelopeKind,
  ReportGovernanceRequestAdapterProfile,
} from './report-governance-types.js';
import type { ReportTemplateType } from './report-standards.js';

function findDefaultRequestAdapterView(profile: ReportGovernanceRequestAdapterProfile) {
  return profile.views.find((item) => item.id === profile.defaultViewId)
    || profile.views[0]
    || null;
}

function resolveEnvelopeKind(
  requestedKind: RequestedKnowledgeOutputKind,
  profile: ReportGovernanceRequestAdapterProfile,
): ReportGovernanceRequestAdapterEnvelopeKind {
  if (requestedKind === 'page' || requestedKind === 'table') {
    return requestedKind;
  }
  return profile.fallbackEnvelopeKind;
}

export function buildDefaultSystemTemplates() {
  return readReportGovernanceConfig().systemTemplates;
}

export function resolveDatasourceGovernanceProfile(label: string, key: string): ReportGovernanceDatasourceProfile {
  const config = readReportGovernanceConfig();
  const searchText = buildSearchText(label, key);
  const fallback = config.datasourceProfiles.find((item) => item.id === 'default') || config.datasourceProfiles[0];

  return config.datasourceProfiles.find((item) => (
    item.id !== 'default' && resolveKeywordMatch(searchText, item.matchKeywords)
  )) || fallback;
}

export function expandDatasourceGovernanceProfile(profile: ReportGovernanceDatasourceProfile, label: string, key: string) {
  return {
    id: profile.id,
    label: profile.label,
    description: interpolateTemplate(profile.description, label),
    triggerKeywords: Array.from(new Set([label, ...profile.triggerKeywords].filter(Boolean))),
    defaultTemplateKey: `${key}-${profile.defaultTemplateSuffix}`,
    templates: profile.templates.map((template) => ({
      key: `${key}-${template.suffix}`,
      label: interpolateTemplate(template.label, label),
      type: template.type,
      description: interpolateTemplate(template.description, label),
      supported: template.supported,
    })),
  };
}

export function resolveTemplateEnvelopeProfile(template: {
  label?: string;
  description?: string;
  type: ReportTemplateType;
}) {
  const config = readReportGovernanceConfig();
  const searchText = buildSearchText(template.label || '', template.description || '');
  const fallback = config.templateProfiles.find((item) => (
    item.type === template.type && (item.id === `${template.type}-default` || !item.matchKeywords.length)
  )) || config.templateProfiles.find((item) => item.type === template.type);

  return config.templateProfiles.find((item) => (
    item.type === template.type
    && item.matchKeywords.length > 0
    && resolveKeywordMatch(searchText, item.matchKeywords)
  )) || fallback;
}

export function resolveRequestAdapterProfile(group: Pick<ReportGroup, 'key' | 'label' | 'description' | 'triggerKeywords'>) {
  const config = readReportGovernanceConfig();
  const searchText = buildSearchText(group.key, group.label, group.description, ...(group.triggerKeywords || []));

  return config.requestAdapterProfiles.find((item) => (
    item.matchKeywords.length > 0 && resolveKeywordMatch(searchText, item.matchKeywords)
  )) || null;
}

export function resolveRequestAdapterView(profile: ReportGovernanceRequestAdapterProfile, requestText: string) {
  const searchText = buildSearchText(requestText);
  const matches = profile.views
    .map((item) => ({
      item,
      score: item.matchKeywords.length > 0
        ? computeKeywordMatchScore(searchText, item.matchKeywords)
        : 0,
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return matches[0]?.item || findDefaultRequestAdapterView(profile);
}

export function resolveRequestAdapterEnvelope(
  group: Pick<ReportGroup, 'key' | 'label' | 'description' | 'triggerKeywords'>,
  requestedKind: RequestedKnowledgeOutputKind,
  requestText: string,
) {
  const profile = resolveRequestAdapterProfile(group);
  if (!profile) return null;

  const resolvedKind = resolveEnvelopeKind(requestedKind, profile);
  const defaultView = findDefaultRequestAdapterView(profile);
  const matchedView = resolveRequestAdapterView(profile, requestText);
  const override =
    matchedView?.kindOverrides?.[resolvedKind]
    || defaultView?.kindOverrides?.[resolvedKind]
    || null;

  if (!override) return null;

  return {
    profileId: profile.id,
    viewId: matchedView?.id || defaultView?.id || '',
    kind: resolvedKind,
    override,
  };
}
