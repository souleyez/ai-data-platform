import { isWeakResumeCandidateName } from './resume-canonicalizer.js';
import type { ResumePageEntry, ResumePageStats, ResumeShowcaseProject } from './knowledge-output-resume-types.js';
import {
  buildRankedLabelCounts,
  getResumeDisplayName,
  normalizeText,
  normalizeUniqueStrings,
  parseResumeExperienceYears,
  sanitizeText,
} from './knowledge-output-resume-shared.js';

function scoreResumeEntry(entry: ResumePageEntry) {
  let score = 0;
  const displayName = getResumeDisplayName(entry);
  if (displayName) score += isWeakResumeCandidateName(displayName) ? 6 : 18;
  if (entry.latestCompany) score += 14;
  if (entry.itProjectHighlights.length) score += 12 + Math.min(entry.itProjectHighlights.length, 3) * 2;
  else if (entry.projectHighlights.length) score += 6 + Math.min(entry.projectHighlights.length, 3);
  score += Math.min(entry.skills.length, 4) * 3;
  if (entry.education) score += 2;
  if (entry.summary || entry.highlights.length) score += 2;
  score += Math.min(parseResumeExperienceYears(entry.yearsOfExperience), 20);
  return score;
}

function sortResumeEntriesForClientShowcase(entries: ResumePageEntry[]) {
  return [...entries].sort((left, right) => (
    scoreResumeEntry(right) - scoreResumeEntry(left)
    || right.itProjectHighlights.length - left.itProjectHighlights.length
    || right.projectHighlights.length - left.projectHighlights.length
    || right.skills.length - left.skills.length
    || parseResumeExperienceYears(right.yearsOfExperience) - parseResumeExperienceYears(left.yearsOfExperience)
    || getResumeDisplayName(left).localeCompare(getResumeDisplayName(right), 'zh-CN')
  ));
}

function buildWeightedResumeProjectCountIndex(entries: ResumePageEntry[]) {
  const counts = new Map<string, { label: string; value: number; priority: number }>();
  for (const entry of entries) {
    const priority = scoreResumeEntry(entry);
    const labels = (entry.itProjectHighlights.length ? entry.itProjectHighlights : entry.projectHighlights)
      .map((item) => sanitizeText(item))
      .filter(Boolean);
    for (const label of labels) {
      const normalized = normalizeText(label);
      if (!normalized) continue;
      const next = counts.get(normalized);
      if (next) {
        next.value += 1;
        next.priority = Math.max(next.priority, priority);
        continue;
      }
      counts.set(normalized, { label, value: 1, priority });
    }
  }

  return counts;
}

function buildWeightedResumeProjectCounts(entries: ResumePageEntry[], limit = 10) {
  const counts = buildWeightedResumeProjectCountIndex(entries);

  return [...counts.values()]
    .sort((left, right) => (
      right.value - left.value
      || right.priority - left.priority
      || left.label.localeCompare(right.label, 'zh-CN')
    ))
    .slice(0, limit)
    .map(({ label, value }) => ({ label, value }));
}

function buildResumeCandidateFit(entry: ResumePageEntry) {
  return normalizeUniqueStrings([
    ...(entry.itProjectHighlights.length ? entry.itProjectHighlights.slice(0, 1) : entry.projectHighlights.slice(0, 1)),
    ...entry.skills.slice(0, 2),
  ], 3).join(' / ');
}

function buildResumeProjectShowcase(entries: ResumePageEntry[], limit = 5): ResumeShowcaseProject[] {
  const counts = buildWeightedResumeProjectCountIndex(entries);
  const candidates: Array<ResumeShowcaseProject & { priority: number }> = [];

  for (const entry of entries) {
    const ownerName = getResumeDisplayName(entry);
    const ownerKey = normalizeText(ownerName || entry.sourceName || entry.latestCompany || 'resume-project');
    const companyKey = normalizeText(entry.latestCompany || ownerName || 'resume-company');
    const fit = buildResumeCandidateFit(entry);
    const labels = normalizeUniqueStrings(
      entry.itProjectHighlights.length ? entry.itProjectHighlights : entry.projectHighlights,
      6,
    );

    for (const label of labels) {
      const normalized = normalizeText(label);
      if (!normalized) continue;
      const count = counts.get(normalized);
      candidates.push({
        label: count?.label || label,
        value: count?.value || 1,
        ownerName,
        ownerKey,
        company: entry.latestCompany,
        companyKey,
        fit,
        priority: count?.priority || scoreResumeEntry(entry),
      });
    }
  }

  candidates.sort((left, right) => (
    right.value - left.value
    || right.priority - left.priority
    || left.label.localeCompare(right.label, 'zh-CN')
  ));

  const selected: ResumeShowcaseProject[] = [];
  const usedLabels = new Set<string>();
  const usedOwners = new Set<string>();
  const usedCompanies = new Set<string>();

  const selectWith = (predicate: (item: ResumeShowcaseProject & { priority: number }) => boolean) => {
    for (const candidate of candidates) {
      if (selected.length >= limit) break;
      const labelKey = normalizeText(candidate.label);
      if (!labelKey || usedLabels.has(labelKey)) continue;
      if (!predicate(candidate)) continue;
      usedLabels.add(labelKey);
      if (candidate.ownerKey) usedOwners.add(candidate.ownerKey);
      if (candidate.companyKey) usedCompanies.add(candidate.companyKey);
      selected.push({
        label: candidate.label,
        value: candidate.value,
        ownerName: candidate.ownerName,
        ownerKey: candidate.ownerKey,
        company: candidate.company,
        companyKey: candidate.companyKey,
        fit: candidate.fit,
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

function buildResumeCandidateLine(entry: ResumePageEntry) {
  const parts = [
    getResumeDisplayName(entry),
    entry.latestCompany ? `${entry.latestCompany}` : '',
    entry.yearsOfExperience || '',
    entry.education ? `学历 ${entry.education}` : '',
    buildResumeCandidateFit(entry) ? `匹配 ${buildResumeCandidateFit(entry)}` : '',
  ].filter(Boolean);
  return parts.join('，');
}

function buildResumeCompanyLine(item: { label: string; value: number }, stats: ResumePageStats) {
  const relatedCandidates = stats.entries
    .filter((entry) => entry.latestCompany === item.label)
    .map((entry) => getResumeDisplayName(entry))
    .filter(Boolean)
    .slice(0, 3);
  const candidateText = relatedCandidates.length ? `；代表候选人 ${relatedCandidates.join('、')}` : '';
  return `${item.label}：覆盖 ${item.value} 份简历${candidateText}`;
}

function buildResumeShowcaseProjectLine(item: ResumeShowcaseProject) {
  const ownerText = item.ownerName ? `：代表候选人 ${item.ownerName}` : '';
  const companyText = item.company ? `，关联公司 ${item.company}` : '';
  const fitText = item.fit ? `；匹配 ${item.fit}` : '';
  return `${item.label}${ownerText}${companyText}${fitText}`;
}

function buildResumeProjectLine(item: { label: string; value: number }, stats: ResumePageStats) {
  const owner = stats.entries.find((entry) => (
    entry.itProjectHighlights.includes(item.label) || entry.projectHighlights.includes(item.label)
  ));
  const ownerText = owner ? getResumeDisplayName(owner) : '';
  const companyText = owner?.latestCompany ? `，关联公司 ${owner.latestCompany}` : '';
  const fitText = owner ? buildResumeCandidateFit(owner) : '';
  return `${item.label}${ownerText ? `：代表候选人 ${ownerText}` : ''}${companyText}${fitText ? `；匹配 ${fitText}` : ''}`;
}

function buildResumeSkillLine(item: { label: string; value: number }, stats: ResumePageStats) {
  const candidates = stats.entries
    .filter((entry) => entry.skills.includes(item.label))
    .map((entry) => getResumeDisplayName(entry))
    .filter(Boolean)
    .slice(0, 3);
  return `${item.label}：覆盖 ${item.value} 位候选人${candidates.length ? `；代表候选人 ${candidates.join('、')}` : ''}`;
}

export function buildResumePageStats(entries: ResumePageEntry[]): ResumePageStats {
  const rankedEntries = sortResumeEntriesForClientShowcase(entries);
  const companies = buildRankedLabelCounts(rankedEntries.map((entry) => entry.latestCompany).filter(Boolean), 8);
  const projects = buildWeightedResumeProjectCounts(rankedEntries, 10);
  const showcaseProjects = buildResumeProjectShowcase(rankedEntries, 5);
  const skills = buildRankedLabelCounts(rankedEntries.flatMap((entry) => entry.skills).filter(Boolean), 10);
  const educations = buildRankedLabelCounts(rankedEntries.map((entry) => entry.education).filter(Boolean), 6);
  const salaryLines = normalizeUniqueStrings(
    rankedEntries
      .map((entry) => entry.expectedSalary)
      .filter(Boolean),
    6,
  );

  const stats: ResumePageStats = {
    entries: rankedEntries,
    candidateCount: new Set(rankedEntries.map((entry) => getResumeDisplayName(entry)).filter(Boolean)).size,
    companyCount: companies.length,
    projectCount: projects.length,
    skillCount: skills.length,
    companies,
    projects,
    skills,
    educations,
    candidateLines: [],
    companyLines: [],
    projectLines: [],
    skillLines: [],
    salaryLines,
    showcaseCandidateNames: [],
    showcaseProjectLabels: [],
    showcaseProjects,
  };

  stats.candidateLines = rankedEntries.filter((entry) => getResumeDisplayName(entry)).slice(0, 6).map(buildResumeCandidateLine);
  stats.companyLines = companies.map((item) => buildResumeCompanyLine(item, stats)).slice(0, 6);
  const showcaseProjectLabels = new Set(showcaseProjects.map((item) => normalizeText(item.label)).filter(Boolean));
  stats.projectLines = [
    ...showcaseProjects.map((item) => buildResumeShowcaseProjectLine(item)),
    ...projects
      .filter((item) => !showcaseProjectLabels.has(normalizeText(item.label)))
      .map((item) => buildResumeProjectLine(item, stats)),
  ].slice(0, 6);
  stats.skillLines = skills.map((item) => buildResumeSkillLine(item, stats)).slice(0, 6);
  const rankedCandidateNames = normalizeUniqueStrings(rankedEntries.map((entry) => getResumeDisplayName(entry)).filter(Boolean), 6);
  stats.showcaseCandidateNames = [
    ...rankedCandidateNames.filter((name) => !isWeakResumeCandidateName(name)),
    ...rankedCandidateNames.filter((name) => isWeakResumeCandidateName(name)),
  ].slice(0, 3);
  stats.showcaseProjectLabels = showcaseProjects.map((item) => item.label).slice(0, 3);
  return stats;
}
