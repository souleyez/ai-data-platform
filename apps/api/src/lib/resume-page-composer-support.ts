import { isWeakResumeCandidateName } from './resume-canonicalizer.js';
import type { ResumeDisplayProfile } from './resume-display-profile-provider.js';
import type { ComposerPromptMode, ResumePageComposerInput } from './resume-page-composer-types.js';

type ComposerProjectShowcaseItem = {
  label: string;
  value: number;
  displayName: string;
  displayCompany: string;
};

export function sanitizeText(value: unknown, maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

function buildRankedCountList(values: string[], limit = 6) {
  const counts = new Map<string, { label: string; value: number }>();
  for (const raw of values) {
    const label = sanitizeText(raw, 120);
    if (!label) continue;
    const key = label.toLowerCase();
    const next = counts.get(key);
    if (next) {
      next.value += 1;
      continue;
    }
    counts.set(key, { label, value: 1 });
  }
  return [...counts.values()]
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'zh-CN'))
    .slice(0, limit);
}

function buildShowcaseProfiles(profiles: ResumeDisplayProfile[], limit: number) {
  return [
    ...profiles.filter((profile) => !isWeakResumeCandidateName(profile.displayName)),
    ...profiles.filter((profile) => isWeakResumeCandidateName(profile.displayName)),
  ].slice(0, limit);
}

function scoreDisplayProfile(profile: ResumeDisplayProfile) {
  let score = 0;
  const displayName = sanitizeText(profile.displayName, 80);
  if (displayName) score += isWeakResumeCandidateName(displayName) ? 6 : 16;
  if (sanitizeText(profile.displayCompany, 160)) score += 14;
  score += Math.min((profile.displayProjects || []).length, 3) * 5;
  score += Math.min((profile.displaySkills || []).length, 4) * 3;
  if (sanitizeText(profile.displaySummary, 160)) score += 4;
  return score;
}

function sortDisplayProfilesForComposer(profiles: ResumeDisplayProfile[]) {
  return [...profiles].sort((left, right) => (
    scoreDisplayProfile(right) - scoreDisplayProfile(left)
    || (right.displayProjects?.length || 0) - (left.displayProjects?.length || 0)
    || (right.displaySkills?.length || 0) - (left.displaySkills?.length || 0)
    || sanitizeText(left.displayName, 80).localeCompare(sanitizeText(right.displayName, 80), 'zh-CN')
  ));
}

function buildDiversifiedProjectShowcase(profiles: ResumeDisplayProfile[], limit = 5): ComposerProjectShowcaseItem[] {
  const counts = buildRankedCountList(profiles.flatMap((profile) => profile.displayProjects || []), 24);
  const countMap = new Map(counts.map((item) => [sanitizeText(item.label, 120).toLowerCase(), item]));
  const candidates: Array<ComposerProjectShowcaseItem & { ownerKey: string; companyKey: string; priority: number }> = [];

  for (const profile of profiles) {
    const ownerName = sanitizeText(profile.displayName, 80);
    const displayCompany = sanitizeText(profile.displayCompany, 160);
    const ownerKey = sanitizeText(ownerName || profile.sourceName || profile.sourcePath, 160).toLowerCase();
    const companyKey = sanitizeText(displayCompany || ownerName || profile.sourceName, 160).toLowerCase();
    const labels = [...new Set((profile.displayProjects || []).map((item) => sanitizeText(item, 80)).filter(Boolean))];

    for (const label of labels) {
      const labelKey = label.toLowerCase();
      const count = countMap.get(labelKey);
      candidates.push({
        label: count?.label || label,
        value: count?.value || 1,
        displayName: ownerName,
        displayCompany,
        ownerKey,
        companyKey,
        priority: scoreDisplayProfile(profile),
      });
    }
  }

  candidates.sort((left, right) => (
    right.value - left.value
    || right.priority - left.priority
    || left.label.localeCompare(right.label, 'zh-CN')
  ));

  const selected: ComposerProjectShowcaseItem[] = [];
  const usedLabels = new Set<string>();
  const usedOwners = new Set<string>();
  const usedCompanies = new Set<string>();

  const selectWith = (predicate: (item: ComposerProjectShowcaseItem & { ownerKey: string; companyKey: string; priority: number }) => boolean) => {
    for (const candidate of candidates) {
      if (selected.length >= limit) break;
      const labelKey = candidate.label.toLowerCase();
      if (!labelKey || usedLabels.has(labelKey)) continue;
      if (!predicate(candidate)) continue;
      usedLabels.add(labelKey);
      if (candidate.ownerKey) usedOwners.add(candidate.ownerKey);
      if (candidate.companyKey) usedCompanies.add(candidate.companyKey);
      selected.push({
        label: candidate.label,
        value: candidate.value,
        displayName: candidate.displayName,
        displayCompany: candidate.displayCompany,
      });
    }
  };

  selectWith((candidate) => candidate.ownerKey ? !usedOwners.has(candidate.ownerKey) : true);
  if (selected.length < limit) {
    selectWith((candidate) => candidate.companyKey ? !usedCompanies.has(candidate.companyKey) : true);
  }
  if (selected.length < limit) {
    selectWith(() => true);
  }

  return selected;
}

export function buildComposerContext(input: ResumePageComposerInput, mode: ComposerPromptMode) {
  const isCompact = mode === 'compact';
  const rankedProfiles = sortDisplayProfilesForComposer(input.displayProfiles);
  const showcaseProfiles = buildShowcaseProfiles(rankedProfiles, isCompact ? 3 : 4);
  return {
    requestText: sanitizeText(input.requestText, 240),
    envelope: input.envelope ? {
      title: sanitizeText(input.envelope.title, 120),
      outputHint: sanitizeText(input.envelope.outputHint, isCompact ? 120 : 240),
      pageSections: input.envelope.pageSections || [],
    } : null,
    plan: input.reportPlan ? {
      objective: sanitizeText(input.reportPlan.objective, isCompact ? 160 : 240),
      stylePriorities: (input.reportPlan.stylePriorities || []).slice(0, isCompact ? 3 : 4),
      cards: (input.reportPlan.cards || []).slice(0, isCompact ? 3 : 4).map((item) => ({
        label: sanitizeText(item.label, 80),
      })),
      charts: (input.reportPlan.charts || []).slice(0, isCompact ? 1 : 2).map((item) => ({
        title: sanitizeText(item.title, 80),
      })),
      sections: (input.reportPlan.sections || []).slice(0, isCompact ? 4 : 8).map((item) => ({
        title: sanitizeText(item.title, 80),
        purpose: sanitizeText(item.purpose, isCompact ? 100 : 160),
        evidenceFocus: sanitizeText(item.evidenceFocus, isCompact ? 80 : 120),
      })),
    } : null,
    showcase: {
      topCandidates: showcaseProfiles.map((profile) => ({
        displayName: sanitizeText(profile.displayName, 80),
        displayCompany: sanitizeText(profile.displayCompany, 160),
        displayProjects: (profile.displayProjects || []).slice(0, isCompact ? 1 : 2),
        displaySkills: (profile.displaySkills || []).slice(0, isCompact ? 2 : 3),
      })),
      topProjects: buildDiversifiedProjectShowcase(rankedProfiles, isCompact ? 3 : 5),
      topSkills: buildRankedCountList(rankedProfiles.flatMap((profile) => profile.displaySkills || []), isCompact ? 4 : 6),
      topCompanies: buildRankedCountList(rankedProfiles.map((profile) => profile.displayCompany), isCompact ? 3 : 5),
    },
    profiles: rankedProfiles.slice(0, isCompact ? 4 : 6).map((profile) => ({
      sourcePath: isCompact ? '' : sanitizeText(profile.sourcePath, 320),
      sourceName: isCompact ? '' : sanitizeText(profile.sourceName, 160),
      displayName: sanitizeText(profile.displayName, 80),
      displayCompany: sanitizeText(profile.displayCompany, 160),
      displayProjects: (profile.displayProjects || []).slice(0, isCompact ? 1 : 2),
      displaySkills: (profile.displaySkills || []).slice(0, isCompact ? 3 : 4),
      displaySummary: sanitizeText(profile.displaySummary, isCompact ? 80 : 120),
    })),
    supportingDocuments: isCompact
      ? []
      : input.documents
          .filter((item) => item.schemaType === 'resume')
          .slice(0, 4)
          .map((item) => ({
            name: sanitizeText(item.name, 160),
            title: sanitizeText(item.title, 120),
          })),
  };
}
