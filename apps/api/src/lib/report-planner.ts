import type { RetrievalResult } from './document-retrieval.js';
import type { KnowledgeTemplateTaskHint, SelectedKnowledgeTemplate } from './knowledge-template.js';
import type { ReportTemplateEnvelope } from './report-center.js';
import {
  buildFallbackSections,
  buildFallbackTitle,
  inferReportPlanTaskHintByHeuristics,
} from './report-planner-heuristics.js';
import {
  attachDatavizSlotsToSections,
  buildCardPlan,
  buildChartPlan,
  buildDatavizSlotPlan,
  buildPageSpec,
  buildPlanQualityTargets,
  buildSectionPurpose,
} from './report-planner-visuals.js';

export type ReportPlanAudience = 'client';
export type ReportPlanTemplateMode = 'concept-page' | 'shared-template';
export type ReportPlanCompletionMode = 'knowledge-first' | 'knowledge-plus-model';
export type ReportPlanSectionDisplayMode = 'summary' | 'insight-list' | 'timeline' | 'comparison' | 'cta' | 'appendix';

export type ReportPlanSection = {
  title: string;
  purpose: string;
  evidenceFocus: string;
  completionMode: ReportPlanCompletionMode;
  displayMode: ReportPlanSectionDisplayMode;
  datavizSlotKeys?: string[];
};

export type ReportPlanCard = {
  label: string;
  purpose: string;
};

export type ReportPlanChart = {
  title: string;
  purpose: string;
};

export type ReportPlanDatavizSlot = {
  key: string;
  title: string;
  purpose: string;
  preferredChartType: 'bar' | 'horizontal-bar' | 'line';
  placement: 'hero' | 'section';
  sectionTitle?: string;
  evidenceFocus: string;
  minItems: number;
  maxItems: number;
};

export type ReportPlanPageSpecSection = {
  title: string;
  purpose: string;
  completionMode: ReportPlanCompletionMode;
  displayMode: ReportPlanSectionDisplayMode;
  datavizSlotKeys: string[];
};

export type ReportPlanLayoutVariant =
  | 'insight-brief'
  | 'risk-brief'
  | 'operations-cockpit'
  | 'talent-showcase'
  | 'research-brief'
  | 'solution-overview';

export type ReportPlanVisualMixModuleType =
  | 'hero'
  | 'summary'
  | 'metric-grid'
  | 'insight-list'
  | 'table'
  | 'chart'
  | 'timeline'
  | 'comparison'
  | 'cta'
  | 'appendix';

export type ReportPlanVisualMixTarget = {
  moduleType: ReportPlanVisualMixModuleType;
  minCount: number;
  targetCount: number;
  maxCount: number;
};

export type ReportPlanPageSpec = {
  layoutVariant: ReportPlanLayoutVariant;
  heroCardLabels: string[];
  heroDatavizSlotKeys: string[];
  sections: ReportPlanPageSpecSection[];
};

export type ReportPlan = {
  audience: ReportPlanAudience;
  templateMode: ReportPlanTemplateMode;
  objective: string;
  envelope: ReportTemplateEnvelope;
  stylePriorities: string[];
  evidenceRules: string[];
  completionRules: string[];
  cards: ReportPlanCard[];
  charts: ReportPlanChart[];
  datavizSlots: ReportPlanDatavizSlot[];
  sections: ReportPlanSection[];
  pageSpec: ReportPlanPageSpec;
  mustHaveModules: string[];
  optionalModules: string[];
  evidencePriority: string[];
  audienceTone: string;
  riskNotes: string[];
  visualMixTargets: ReportPlanVisualMixTarget[];
  knowledgeScope: {
    libraryLabels: string[];
    documentCount: number;
    detailedCount: number;
    dominantTopics: string[];
    dominantSchemas: string[];
  };
};

export type ReportPlanQualityTargets = {
  mustHaveModules: string[];
  optionalModules: string[];
  evidencePriority: string[];
  audienceTone: string;
  riskNotes: string[];
  visualMixTargets: ReportPlanVisualMixTarget[];
};

export type ReportPlannerInput = {
  requestText: string;
  templateTaskHint?: KnowledgeTemplateTaskHint | null;
  conceptPageMode?: boolean;
  selectedTemplates?: SelectedKnowledgeTemplate[];
  baseEnvelope?: ReportTemplateEnvelope | null;
  retrieval: RetrievalResult;
  libraries: Array<{ key?: string; label?: string }>;
};

type ReportPlanTaskHintInput = {
  requestText?: string;
  groupKey?: string;
  groupLabel?: string;
  templateKey?: string;
  templateLabel?: string;
  kind?: 'table' | 'page' | 'ppt' | 'pdf' | 'doc' | 'md';
};

function countTopValues(values: string[], limit = 4) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([label]) => label);
}

function uniqueNonEmpty(values: Array<string | undefined | null>) {
  return [...new Set(
    values
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
}

export function inferReportPlanTaskHint(input: ReportPlanTaskHintInput): KnowledgeTemplateTaskHint | null {
  return inferReportPlanTaskHintByHeuristics(input);
}

function resolveBaseEnvelope(input: ReportPlannerInput, libraryLabels: string[]) {
  const selectedEnvelope = input.selectedTemplates?.[0]?.envelope || input.baseEnvelope || null;
  const pageSections = input.templateTaskHint === 'resume-comparison'
    ? buildFallbackSections(input.templateTaskHint)
    : selectedEnvelope?.pageSections?.length
      ? [...selectedEnvelope.pageSections]
      : buildFallbackSections(input.templateTaskHint);

  return {
    title: selectedEnvelope?.title || buildFallbackTitle(
      input.templateTaskHint,
      libraryLabels,
      input.requestText,
      input.retrieval.documents.map((item) => String(item.title || item.name || '').trim()).filter(Boolean),
    ),
    fixedStructure: uniqueNonEmpty([
      ...(selectedEnvelope?.fixedStructure || []),
      'Lead with the business conclusion and keep the page client-facing.',
      'Prefer a clean visual board with stable sections before decorative details.',
      'Use matched knowledge evidence first, then add conservative model synthesis.',
    ]),
    variableZones: uniqueNonEmpty([
      ...(selectedEnvelope?.variableZones || []),
      ...pageSections,
    ]),
    outputHint: uniqueNonEmpty([
      selectedEnvelope?.outputHint,
      'Generate a client-facing visual static page that is clear, credible, and easy to present.',
    ]).join(' '),
    pageSections,
  } satisfies ReportTemplateEnvelope;
}

function buildObjective(
  templateTaskHint: KnowledgeTemplateTaskHint | null | undefined,
  libraryLabels: string[],
) {
  const primaryLabel = libraryLabels[0] || 'the selected knowledge libraries';
  switch (templateTaskHint) {
    case 'resume-comparison':
      return `Create a client-facing talent insight page from ${primaryLabel}, with quick decision support instead of raw resume dumping.`;
    case 'bids-static-page':
      return `Create a customer-ready bid analysis page from ${primaryLabel}, highlighting risks, gaps, and response direction.`;
    case 'paper-static-page':
      return `Create a readable research insight page from ${primaryLabel}, turning paper evidence into a clear decision-oriented overview.`;
    case 'order-static-page':
      return `Create a multi-channel, multi-SKU operating cockpit from ${primaryLabel}, highlighting channel mix, SKU concentration, inventory health, and replenishment priorities.`;
    case 'footfall-static-page':
      return `Create a mall footfall summary page from ${primaryLabel}, aggregate strictly at mall-zone level, and avoid expanding floor-zone or room-unit detail in the presentation layer.`;
    case 'iot-static-page':
      return `Create a solution overview page from ${primaryLabel}, showing modules, integrations, delivery shape, and business value.`;
    default:
      return `Create a client-facing visual report from ${primaryLabel}, with clear structure, credible evidence, and concise guidance.`;
  }
}

function buildKnowledgeScope(retrieval: RetrievalResult, libraries: Array<{ key?: string; label?: string }>) {
  const libraryLabels = libraries
    .map((item) => String(item.label || item.key || '').trim())
    .filter(Boolean);
  const detailedCount = retrieval.documents.filter(
    (item) => item.parseStage === 'detailed' || item.detailParseStatus === 'succeeded',
  ).length;
  const dominantTopics = countTopValues(retrieval.documents.flatMap((item) => Array.isArray(item.topicTags) ? item.topicTags : []));
  const dominantSchemas = countTopValues(retrieval.documents.map((item) => String(item.schemaType || item.category || 'generic')));

  return {
    libraryLabels,
    documentCount: retrieval.documents.length,
    detailedCount,
    dominantTopics,
    dominantSchemas,
  };
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

export function buildReportPlanContextBlock(plan: ReportPlan) {
  return [
    'Report planner:',
    `Audience: ${plan.audience}`,
    `Template mode: ${plan.templateMode}`,
    `Objective: ${plan.objective}`,
    `Page title target: ${plan.envelope.title}`,
    `Knowledge libraries: ${plan.knowledgeScope.libraryLabels.join(' | ') || 'unknown'}`,
    `Evidence coverage: ${plan.knowledgeScope.documentCount} docs, ${plan.knowledgeScope.detailedCount} detailed`,
    plan.knowledgeScope.dominantTopics.length
      ? `Dominant topics: ${plan.knowledgeScope.dominantTopics.join(' | ')}`
      : '',
    plan.knowledgeScope.dominantSchemas.length
      ? `Dominant schemas: ${plan.knowledgeScope.dominantSchemas.join(' | ')}`
      : '',
    `Style priorities: ${plan.stylePriorities.join(' | ')}`,
    'Evidence rules:',
    ...plan.evidenceRules.map((item, index) => `${index + 1}. ${item}`),
    'Completion rules:',
    ...plan.completionRules.map((item, index) => `${index + 1}. ${item}`),
    'Planned cards:',
    ...plan.cards.map((item, index) => `${index + 1}. ${item.label} :: ${item.purpose}`),
    'Planned charts:',
    ...plan.charts.map((item, index) => `${index + 1}. ${item.title} :: ${item.purpose}`),
    'Planned dataviz slots:',
    ...plan.datavizSlots.map((item, index) => (
      `${index + 1}. ${item.title} :: type=${item.preferredChartType} :: placement=${item.placement}${item.sectionTitle ? ` :: section=${item.sectionTitle}` : ''} :: evidence=${item.evidenceFocus} :: items=${item.minItems}-${item.maxItems}`
    )),
    `Page spec layout: ${plan.pageSpec.layoutVariant}`,
    `Must-have modules: ${plan.mustHaveModules.join(' | ') || '-'}`,
    `Optional modules: ${plan.optionalModules.join(' | ') || '-'}`,
    `Evidence priority: ${plan.evidencePriority.join(' | ') || '-'}`,
    `Audience tone: ${plan.audienceTone || '-'}`,
    plan.riskNotes.length ? `Risk notes: ${plan.riskNotes.join(' | ')}` : '',
    `Visual mix targets: ${plan.visualMixTargets.map((item) => `${item.moduleType}:${item.minCount}/${item.targetCount}/${item.maxCount}`).join(' | ') || '-'}`,
    `Page spec hero cards: ${plan.pageSpec.heroCardLabels.join(' | ')}`,
    `Page spec hero dataviz: ${plan.pageSpec.heroDatavizSlotKeys.join(' | ') || '-'}`,
    'Page spec sections:',
    ...plan.pageSpec.sections.map((item, index) => (
      `${index + 1}. ${item.title} :: completion=${item.completionMode} :: display=${item.displayMode} :: dataviz=${item.datavizSlotKeys.join(' | ') || '-'}`
    )),
    'Planned sections:',
    ...plan.sections.map((item, index) => (
      `${index + 1}. ${item.title} :: purpose=${item.purpose} :: evidence=${item.evidenceFocus} :: completion=${item.completionMode} :: display=${item.displayMode} :: dataviz=${item.datavizSlotKeys?.join(' | ') || '-'}`
    )),
  ]
    .filter(Boolean)
    .join('\n');
}
