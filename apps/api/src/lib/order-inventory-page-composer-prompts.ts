import type { ParsedDocument } from './document-parser.js';
import type { ReportPlan } from './report-planner.js';
import type { ReportTemplateEnvelope } from './report-center.js';
import { loadWorkspaceSkillBundle } from './workspace-skills.js';
import type { ComposerPromptMode } from './order-inventory-page-composer-types.js';
import { buildOrderComposerEvidenceSummary } from './order-inventory-page-composer-evidence.js';
import {
  detectOrderInventoryRequestView,
  sanitizeOrderComposerText,
} from './order-inventory-page-composer-support.js';

export function buildOrderInventoryComposerContext(input: {
  requestText: string;
  reportPlan?: ReportPlan | null;
  envelope?: ReportTemplateEnvelope | null;
  documents: ParsedDocument[];
}, mode: ComposerPromptMode) {
  const compact = mode === 'compact';
  const view = detectOrderInventoryRequestView(input);
  const stockView = view === 'stock';
  const evidence = buildOrderComposerEvidenceSummary({ documents: input.documents }, mode, view);

  return {
    requestText: sanitizeOrderComposerText(input.requestText, 240),
    view,
    envelope: input.envelope ? {
      title: sanitizeOrderComposerText(input.envelope.title, 120),
      outputHint: sanitizeOrderComposerText(input.envelope.outputHint, stockView ? 84 : (compact ? 100 : 160)),
      pageSections: (input.envelope.pageSections || []).slice(0, stockView ? 4 : (compact ? 5 : 6)),
    } : null,
    reportPlan: input.reportPlan ? {
      objective: sanitizeOrderComposerText(input.reportPlan.objective, stockView ? 96 : (compact ? 120 : 180)),
      stylePriorities: (input.reportPlan.stylePriorities || []).slice(0, stockView ? 1 : (compact ? 2 : 3)),
      evidenceRules: (input.reportPlan.evidenceRules || []).slice(0, stockView ? 1 : (compact ? 2 : 3)),
      completionRules: (input.reportPlan.completionRules || []).slice(0, stockView ? 1 : (compact ? 2 : 3)),
      cards: (input.reportPlan.cards || []).slice(0, stockView ? 2 : (compact ? 3 : 4)).map((item) => ({
        label: sanitizeOrderComposerText(item.label, 80),
        purpose: sanitizeOrderComposerText(item.purpose, stockView ? 60 : (compact ? 80 : 120)),
      })),
      charts: (input.reportPlan.charts || []).slice(0, stockView ? 1 : (compact ? 2 : 3)).map((item) => ({
        title: sanitizeOrderComposerText(item.title, 80),
        purpose: sanitizeOrderComposerText(item.purpose, stockView ? 60 : (compact ? 80 : 120)),
      })),
      sections: (input.reportPlan.sections || []).slice(0, stockView ? 3 : (compact ? 4 : 5)).map((item) => ({
        title: sanitizeOrderComposerText(item.title, 80),
        purpose: sanitizeOrderComposerText(item.purpose, stockView ? 60 : (compact ? 80 : 120)),
        evidenceFocus: sanitizeOrderComposerText(item.evidenceFocus, stockView ? 60 : (compact ? 80 : 120)),
      })),
    } : null,
    cockpit: evidence.cockpit,
    documents: evidence.documents,
  };
}

export async function buildOrderInventoryComposerSystemPrompt() {
  const skillInstruction = await loadWorkspaceSkillBundle('order-inventory-page-composer', [
    'references/output-schema.md',
    'references/layout-guidance.md',
  ]);

  return [
    'You are an order and inventory visual-report page composer for a private enterprise knowledge-report system.',
    'Return strict JSON only. No markdown. No explanation.',
    'Compose a premium static page that reads like an operating cockpit, not a generic report export.',
    'Treat the supplied report plan and envelope as the structural contract.',
    'Treat the supplied cockpit aggregates and evidence snapshots as the evidence layer for channels, SKU/category focus, inventory health, replenishment priorities, and anomalies.',
    'Do not invent GMV, growth rates, sell-through, stockout days, or replenishment quantities when they are not explicitly supported.',
    'If evidence is weaker than the requested shell ambition, lower specificity and make uncertainty visible in warnings or section language.',
    skillInstruction,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildOrderInventoryComposerPrompt(input: {
  requestText: string;
  reportPlan?: ReportPlan | null;
  envelope?: ReportTemplateEnvelope | null;
  documents: ParsedDocument[];
}, mode: ComposerPromptMode) {
  const modeInstruction = mode === 'compact'
    ? 'Retry in compact mode. Preserve the cockpit shell, keep the page concise, and use only the clearest evidence clusters.'
    : 'Compose one final order or inventory cockpit page from the following report-planning context and evidence aggregates.';

  return [
    `Request: ${sanitizeOrderComposerText(input.requestText, 240)}`,
    modeInstruction,
    JSON.stringify(buildOrderInventoryComposerContext(input, mode)),
  ].join('\n\n');
}
