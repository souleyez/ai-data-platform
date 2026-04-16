import type { KnowledgeTemplateTaskHint } from './knowledge-template.js';
import { inferReportPlanTaskHintByHeuristics } from './report-planner-heuristics.js';
import {
  attachDatavizSlotsToSections,
  buildCardPlan,
  buildChartPlan,
  buildDatavizSlotPlan,
  buildPageSpec,
  buildPlanQualityTargets,
  buildSectionPurpose,
} from './report-planner-visuals.js';
import type {
  ReportPlan,
  ReportPlanQualityTargets,
  ReportPlanTaskHintInput,
  ReportPlannerInput,
  ReportPlanAudience,
  ReportPlanTemplateMode,
  ReportPlanCompletionMode,
  ReportPlanSectionDisplayMode,
  ReportPlanSection,
  ReportPlanCard,
  ReportPlanChart,
  ReportPlanDatavizSlot,
  ReportPlanPageSpecSection,
  ReportPlanLayoutVariant,
  ReportPlanVisualMixModuleType,
  ReportPlanVisualMixTarget,
  ReportPlanPageSpec,
} from './report-planner-types.js';
import {
  buildKnowledgeScope,
  buildObjective,
  buildReportPlanContextBlock,
  resolveBaseEnvelope,
} from './report-planner-support.js';

export type {
  ReportPlanAudience,
  ReportPlanTemplateMode,
  ReportPlanCompletionMode,
  ReportPlanSectionDisplayMode,
  ReportPlanSection,
  ReportPlanCard,
  ReportPlanChart,
  ReportPlanDatavizSlot,
  ReportPlanPageSpecSection,
  ReportPlanLayoutVariant,
  ReportPlanVisualMixModuleType,
  ReportPlanVisualMixTarget,
  ReportPlanPageSpec,
  ReportPlan,
  ReportPlanQualityTargets,
  ReportPlannerInput,
  ReportPlanTaskHintInput,
} from './report-planner-types.js';
export { buildReportPlanContextBlock } from './report-planner-support.js';

export function inferReportPlanTaskHint(input: ReportPlanTaskHintInput): KnowledgeTemplateTaskHint | null {
  return inferReportPlanTaskHintByHeuristics(input);
}

export function buildReportPlan(input: ReportPlannerInput): ReportPlan {
  const knowledgeScope = buildKnowledgeScope(input.retrieval, input.libraries);
  const envelope = resolveBaseEnvelope(input, knowledgeScope.libraryLabels);
  const sections = envelope.pageSections?.map((title) => {
    const sectionPlan = buildSectionPurpose(title);
    return {
      title,
      purpose: sectionPlan.purpose,
      evidenceFocus: sectionPlan.evidenceFocus,
      completionMode: sectionPlan.completionMode,
      displayMode: sectionPlan.displayMode,
    };
  }) || [];
  const charts = buildChartPlan(input.templateTaskHint);
  const cards = buildCardPlan(input.templateTaskHint);
  const datavizSlots = buildDatavizSlotPlan(input.templateTaskHint, charts, sections);
  const sectionModules = attachDatavizSlotsToSections(sections, datavizSlots);
  const preferredLayoutVariant = input.selectedTemplates?.[0]?.template.preferredLayoutVariant;
  const pageSpec = buildPageSpec(input.templateTaskHint, preferredLayoutVariant, cards, sectionModules, datavizSlots);
  const qualityTargets = buildPlanQualityTargets(pageSpec.layoutVariant, cards, sectionModules);

  return {
    audience: 'client',
    templateMode: input.conceptPageMode ? 'concept-page' : 'shared-template',
    objective: buildObjective(input.templateTaskHint, knowledgeScope.libraryLabels),
    envelope,
    stylePriorities: [
      'summary-first and client-facing',
      'evidence-backed instead of decorative',
      'clear cards and sections before detailed prose',
      'conservative model completion with explicit uncertainty',
    ],
    evidenceRules: [
      'Use knowledge-library evidence as the primary source of truth.',
      'Prefer stronger and more recent evidence over broad but weak summarization.',
      'If evidence is missing, show the gap instead of fabricating metrics or facts.',
      'Keep the page readable for direct client or business review.',
      'Treat dataviz slots as planned modules, not decorative add-ons.',
    ],
    completionRules: [
      'The model may improve titles, summaries, and action wording, but it must stay bounded by matched evidence.',
      'Hard numbers, dates, and claims must come from the knowledge evidence or be labeled as uncertain.',
      'Recommendation sections can synthesize, but they must not invent unsupported business conclusions.',
      'When charts are produced, align them to the planned dataviz slots and keep chart semantics stable.',
    ],
    cards,
    charts,
    datavizSlots,
    sections: sectionModules,
    pageSpec,
    mustHaveModules: qualityTargets.mustHaveModules,
    optionalModules: qualityTargets.optionalModules,
    evidencePriority: qualityTargets.evidencePriority,
    audienceTone: qualityTargets.audienceTone,
    riskNotes: qualityTargets.riskNotes,
    visualMixTargets: qualityTargets.visualMixTargets,
    knowledgeScope,
  };
}
