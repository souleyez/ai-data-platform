import type { ParsedDocument } from './document-parser.js';
import { normalizeText } from './knowledge-output-normalization.js';
import {
  buildResumePageCards,
  buildResumePageCharts,
  buildResumePageSummary,
  buildResumePageTitle,
  buildResumeSectionBlueprints,
  hasExpectedResumeTitle,
  hasSuspiciousResumeHardMetrics,
} from './knowledge-output-resume-page-copy.js';
import {
  buildResumePageEntries,
  buildResumePageStats,
} from './knowledge-output-resume-support.js';
import type { ResumeDisplayProfile } from './resume-display-profile-provider.js';
import type { ReportTemplateEnvelope } from './report-center.js';
import type { ChatOutput } from './knowledge-output-types.js';
import type { ResumeRequestView } from './knowledge-output-resume-views.js';
import {
  defaultResumePageSections,
  getResumePageCopyDeps,
  type KnowledgePageOutput,
  resolveResumeFallbackView,
  shouldUseResumePageFallback,
} from './knowledge-output-resume-fallback-support.js';

export function buildResumePageOutput(
  view: ResumeRequestView,
  documents: ParsedDocument[],
  envelope?: ReportTemplateEnvelope | null,
  displayProfiles: ResumeDisplayProfile[] = [],
): KnowledgePageOutput {
  const resumePageCopyDeps = getResumePageCopyDeps();
  const stats = buildResumePageStats(buildResumePageEntries(documents, displayProfiles));
  const summary = buildResumePageSummary(view, documents.length, stats, resumePageCopyDeps);
  const shouldUseEnvelopeSections = Boolean(envelope?.pageSections?.length)
    && hasExpectedResumeTitle(view, envelope?.title || '', resumePageCopyDeps);
  const sectionTitles = shouldUseEnvelopeSections ? (envelope?.pageSections || []) : defaultResumePageSections(view);
  const blueprints = buildResumeSectionBlueprints(view, summary, stats, resumePageCopyDeps);

  return {
    type: 'page',
    title: buildResumePageTitle(view, envelope, resumePageCopyDeps),
    content: summary,
    format: 'html',
    page: {
      summary,
      cards: buildResumePageCards(view, documents.length, stats, resumePageCopyDeps),
      sections: sectionTitles.map((title, index) => {
        const section = blueprints[index] || { body: '', bullets: [] as string[] };
        return {
          title,
          body: section.body || (index === 0 ? summary : ''),
          bullets: section.bullets || [],
        };
      }),
      charts: buildResumePageCharts(view, stats),
    },
  };
}

export function buildResumeFallbackNarrativeTitle(
  view: ResumeRequestView,
  envelope?: ReportTemplateEnvelope | null,
) {
  return buildResumePageTitle(view, envelope, getResumePageCopyDeps());
}

export function hydrateResumePageVisualShell(
  view: ResumeRequestView,
  documents: ParsedDocument[],
  envelope: ReportTemplateEnvelope | null | undefined,
  displayProfiles: ResumeDisplayProfile[],
  page: KnowledgePageOutput['page'],
) {
  const fallbackPage = buildResumePageOutput(view, documents, envelope, displayProfiles).page;
  const mergeCards = (
    primary: NonNullable<KnowledgePageOutput['page']['cards']>,
    fallback: NonNullable<KnowledgePageOutput['page']['cards']>,
    minCount: number,
  ) => {
    const merged = [...primary];
    const seen = new Set(merged.map((item) => normalizeText(item.label || item.value || item.note || '')));
    for (const item of fallback) {
      if (merged.length >= minCount) break;
      const key = normalizeText(item.label || item.value || item.note || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    return merged.length ? merged : fallback;
  };
  const mergeCharts = (
    primary: NonNullable<KnowledgePageOutput['page']['charts']>,
    fallback: NonNullable<KnowledgePageOutput['page']['charts']>,
    minCount: number,
  ) => {
    const merged = [...primary];
    const seen = new Set(merged.map((item) => normalizeText(item.title || '')));
    for (const item of fallback) {
      if (merged.length >= minCount) break;
      const key = normalizeText(item.title || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    return merged.length ? merged : fallback;
  };
  const minCardCount = view === 'client' ? 4 : 0;
  const minChartCount = view === 'client' ? 2 : 0;
  return {
    summary: page.summary || fallbackPage.summary,
    cards: mergeCards(page.cards || [], fallbackPage.cards || [], minCardCount),
    sections: page.sections?.length ? page.sections : fallbackPage.sections,
    charts: mergeCharts(page.charts || [], fallbackPage.charts || [], minChartCount),
  };
}

export function shouldUseResumePageFallbackOutput(
  requestText: string,
  output: ChatOutput,
  documents: ParsedDocument[] = [],
) {
  const resumeDocuments = documents.filter((item) => item.schemaType === 'resume');
  if (!resumeDocuments.length || output.type === 'answer' || !('page' in output) || !output.page) return false;
  const view = resolveResumeFallbackView(requestText);
  return shouldUseResumePageFallback(
    view,
    output.title,
    output.page,
    hasExpectedResumeTitle,
    hasSuspiciousResumeHardMetrics,
  );
}
