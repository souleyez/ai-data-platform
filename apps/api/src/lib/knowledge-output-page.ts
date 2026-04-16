import type { ParsedDocument } from './document-parser.js';
import type { ReportTemplateEnvelope } from './report-center.js';
import {
  buildLayoutVariantPageTitle,
  polishLayoutVariantPageCopy,
  resolvePreferredNarrativeTitle,
} from './knowledge-output-layout-polish.js';
import {
  alignSectionsToEnvelope,
  applyPageSpecSectionDisplayModes,
  applyPlannedDatavizSlots,
  extractEmbeddedStructuredPayload,
  isObject,
  looksLikeJsonEchoText,
  normalizeCards,
  normalizeCharts,
  normalizeReportPlanDatavizSlots,
  normalizeReportPlanPageSpec,
  normalizeSections,
  pickNestedObject,
  pickString,
} from './knowledge-output-normalization.js';
import {
  buildFootfallPageOutput,
  hydrateFootfallPageVisualShell,
  isFootfallReportDocument,
} from './knowledge-output-footfall.js';
import {
  buildOrderPageOutput,
  hydrateOrderPageVisualShell,
  isOrderInventoryDocument,
  resolveOrderRequestView,
} from './knowledge-output-order.js';
import {
  buildPromptEchoFallbackOutput,
  buildSupplyEchoPageOutput,
  looksLikeKnowledgeSupplyPayload,
  looksLikePromptEchoPage,
} from './knowledge-output-supply-fallback.js';
import {
  buildResumeFallbackNarrativeTitle,
  hydrateResumePageVisualShell,
  resolveResumeFallbackView,
  shouldUseResumePageFallbackOutput,
} from './knowledge-output-resume-fallback.js';
import type { ResumeDisplayProfile } from './resume-display-profile-provider.js';
import type { ChatOutput, NormalizeReportOutputOptions } from './knowledge-output-types.js';
import {
  DEFAULT_PAGE_SECTIONS,
  buildKnowledgeFallbackOutput,
  getFootfallOutputDeps,
  getLayoutPolishDeps,
  getOrderOutputDeps,
  resolveNarrativeOutputFormat,
} from './knowledge-output-fallback.js';
import type { NormalizedOutputPayloadContext, ReportOutputKind } from './knowledge-output-support.js';

export function normalizeNarrativeReportOutput(input: {
  kind: Extract<ReportOutputKind, 'page' | 'pdf' | 'ppt' | 'doc' | 'md'>;
  requestText: string;
  envelope?: ReportTemplateEnvelope | null;
  documents?: ParsedDocument[];
  displayProfiles?: ResumeDisplayProfile[];
  options?: NormalizeReportOutputOptions;
  context: NormalizedOutputPayloadContext;
}): ChatOutput {
  const {
    kind,
    requestText,
    envelope,
    documents = [],
    displayProfiles = [],
    options = {},
    context,
  } = input;
  const { root, payload, effectivePayload, generatedTitle, title, content } = context;

  const wrapperPageSource = pickNestedObject(payload, [['page']]) || pickNestedObject(root, [['page']]) || payload;
  const nestedPagePayload = extractEmbeddedStructuredPayload(
    isObject(wrapperPageSource) ? wrapperPageSource.summary : null,
    isObject(wrapperPageSource) ? wrapperPageSource.body : null,
    isObject(wrapperPageSource) ? wrapperPageSource.content : null,
    payload.content,
    payload.summary,
    root.content,
    root.summary,
  );
  const pageSource =
    pickNestedObject(nestedPagePayload || effectivePayload, [['page']])
    || nestedPagePayload
    || pickNestedObject(effectivePayload, [['page']])
    || wrapperPageSource;
  const supplyEchoSource = looksLikeKnowledgeSupplyPayload(pageSource)
    ? pageSource
    : looksLikeKnowledgeSupplyPayload(effectivePayload)
      ? effectivePayload
      : looksLikeKnowledgeSupplyPayload(root)
        ? root
        : null;

  if (supplyEchoSource) {
    return buildSupplyEchoPageOutput(kind, title, supplyEchoSource, envelope, DEFAULT_PAGE_SECTIONS);
  }

  const summary = pickString(pageSource.summary, effectivePayload.summary, payload.summary, root.summary, content);
  const cards = normalizeCards(pageSource.cards || effectivePayload.cards || payload.cards || root.cards);
  const rawSections = normalizeSections(pageSource.sections || effectivePayload.sections || payload.sections || root.sections);
  const alignedSections = envelope?.pageSections?.length
    ? alignSectionsToEnvelope(rawSections, envelope.pageSections, summary)
    : rawSections;
  const charts = applyPlannedDatavizSlots(
    normalizeCharts(pageSource.charts || effectivePayload.charts || payload.charts || root.charts),
    options.datavizSlots || [],
  );
  const effectiveSections = alignedSections.length ? alignedSections : rawSections;
  const normalizedPageSpec = normalizeReportPlanPageSpec(options.pageSpec) || undefined;
  const plannedSections = applyPageSpecSectionDisplayModes(
    alignedSections.length
      ? alignedSections
      : (envelope?.pageSections || []).map((sectionTitle, index) => ({
          title: sectionTitle,
          body: index === 0 ? summary : '',
          bullets: [],
          displayMode: '',
        })),
    normalizedPageSpec || null,
  );
  const resumeDocuments = documents.filter((item) => item.schemaType === 'resume');
  const footfallOutputDeps = getFootfallOutputDeps();
  const footfallDocuments = documents.filter((item) => isFootfallReportDocument(item, footfallOutputDeps));
  const orderOutputDeps = getOrderOutputDeps();
  const orderDocuments = documents.filter((item) => isOrderInventoryDocument(item, orderOutputDeps));
  const resumeView = resumeDocuments.length ? resolveResumeFallbackView(requestText) : 'generic';
  const orderView = orderDocuments.length ? resolveOrderRequestView(requestText, orderOutputDeps) : 'generic';
  const layoutPolishDeps = getLayoutPolishDeps();

  if (looksLikePromptEchoPage(requestText, summary, content, cards, effectiveSections)) {
    if (footfallDocuments.length) {
      return buildKnowledgeFallbackOutput(kind, requestText, footfallDocuments, envelope, displayProfiles);
    }
    if (orderDocuments.length) {
      return buildKnowledgeFallbackOutput(kind, requestText, orderDocuments, envelope, displayProfiles);
    }
    if (resumeDocuments.length) {
      return buildKnowledgeFallbackOutput(kind, requestText, resumeDocuments, envelope, displayProfiles);
    }
    return buildPromptEchoFallbackOutput(kind, title, requestText, envelope, DEFAULT_PAGE_SECTIONS);
  }
  const fallbackNarrativeTitle = resumeDocuments.length
    ? buildResumeFallbackNarrativeTitle(resumeView, envelope)
    : footfallDocuments.length
      ? buildFootfallPageOutput(footfallDocuments, envelope, footfallOutputDeps).title
      : orderDocuments.length
        ? buildOrderPageOutput(orderView, orderDocuments, envelope, orderOutputDeps).title
        : buildLayoutVariantPageTitle(normalizedPageSpec?.layoutVariant, envelope, layoutPolishDeps);
  const normalizedTitle = resolvePreferredNarrativeTitle({
    generatedTitle,
    requestText,
    fallbackTitle: fallbackNarrativeTitle,
  }, layoutPolishDeps);

  const normalizedOutput: Exclude<ChatOutput, { type: 'answer' }> = {
    type: kind === 'page' ? 'page' : kind,
    title: normalizedTitle,
    content: content || summary,
    format: resolveNarrativeOutputFormat(kind),
    page: {
      summary,
      cards,
      sections: plannedSections,
      datavizSlots: normalizeReportPlanDatavizSlots(options.datavizSlots),
      pageSpec: normalizedPageSpec,
      charts,
    },
  };

  if (resumeDocuments.length && normalizedOutput.page) {
    normalizedOutput.page = hydrateResumePageVisualShell(
      resumeView,
      resumeDocuments,
      envelope,
      displayProfiles,
      normalizedOutput.page,
    );
  }

  if (!resumeDocuments.length && footfallDocuments.length && normalizedOutput.page) {
    normalizedOutput.page = hydrateFootfallPageVisualShell(
      footfallDocuments,
      envelope,
      normalizedOutput.page,
      footfallOutputDeps,
    );
  }

  if (!resumeDocuments.length && !footfallDocuments.length && orderDocuments.length && normalizedOutput.page) {
    normalizedOutput.page = hydrateOrderPageVisualShell(
      orderView,
      orderDocuments,
      envelope,
      normalizedOutput.page,
      orderOutputDeps,
    );
  }

  if (!resumeDocuments.length && !footfallDocuments.length && !orderDocuments.length && normalizedOutput.page) {
    normalizedOutput.page = polishLayoutVariantPageCopy(
      normalizedOutput.page,
      normalizedPageSpec?.layoutVariant,
      layoutPolishDeps,
    );
  }

  if (normalizedOutput.page && (!normalizedOutput.content || looksLikeJsonEchoText(normalizedOutput.content))) {
    normalizedOutput.content = normalizedOutput.page.summary || normalizedOutput.content;
  }

  if (resumeDocuments.length && normalizedOutput.page && options.allowResumeFallback !== false) {
    if (shouldUseResumePageFallbackOutput(requestText, normalizedOutput, resumeDocuments)) {
      return buildKnowledgeFallbackOutput(kind, requestText, resumeDocuments, envelope, displayProfiles);
    }
  }

  return normalizedOutput;
}
