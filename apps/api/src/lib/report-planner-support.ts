import type { KnowledgeTemplateTaskHint } from './knowledge-template.js';
import type { ReportTemplateEnvelope } from './report-center.js';
import { buildFallbackSections, buildFallbackTitle } from './report-planner-heuristics.js';
import type { ReportPlan, ReportPlannerInput } from './report-planner-types.js';

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

export function resolveBaseEnvelope(input: ReportPlannerInput, libraryLabels: string[]) {
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

export function buildObjective(
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

export function buildKnowledgeScope(
  retrieval: ReportPlannerInput['retrieval'],
  libraries: Array<{ key?: string; label?: string }>,
) {
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
