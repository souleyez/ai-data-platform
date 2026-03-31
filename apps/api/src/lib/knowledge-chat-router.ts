import type { DocumentLibrary } from './document-libraries.js';
import { buildPromptForScoring, collectLibraryMatches, detectOutputKind } from './knowledge-plan.js';
import { runOpenClawChat } from './openclaw-adapter.js';

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

export type KnowledgeChatRouteKind = 'general' | 'catalog' | 'detail' | 'output';
export type KnowledgeEvidenceMode = 'catalog_memory' | 'live_detail' | 'mixed' | 'degraded';

export type KnowledgeIntentContract = {
  route: KnowledgeChatRouteKind;
  subject: string;
  requestedForm: 'answer' | 'table' | 'page' | 'pdf' | 'ppt' | 'unknown';
  targetScope: 'general' | 'library_overview' | 'recent_changes' | 'latest_documents' | 'specific_document' | 'document_facts' | 'comparison';
  needsLiveDetail: boolean;
  normalizedRequest: string;
  rationale: string;
  confidence: number;
};

export type KnowledgeRouteSignals = {
  explicitKnowledgeScope: boolean;
  explicitCatalogRequest: boolean;
  explicitDetailRequest: boolean;
  explicitOutputRequest: boolean;
  explicitOutputArtifact: boolean;
  outputSuppressed: boolean;
  comparisonRequest: boolean;
  mentionsSpecificDocument: boolean;
  mentionsRecentUploads: boolean;
  summaryRequest: boolean;
};

export type KnowledgeChatRouteDecision = {
  route: KnowledgeChatRouteKind;
  evidenceMode: KnowledgeEvidenceMode | null;
  libraries: Array<{ key: string; label: string }>;
  contract: KnowledgeIntentContract;
  signals: KnowledgeRouteSignals;
};

type ResolveKnowledgeChatRouteInput = {
  prompt: string;
  chatHistory: ChatHistoryItem[];
  libraries: DocumentLibrary[];
  sessionUser?: string;
};

type ResolveKnowledgeChatRouteOptions = {
  resolveCloudContract?: (input: {
    prompt: string;
    chatHistory: ChatHistoryItem[];
    libraries: Array<{ key: string; label: string }>;
    signals: KnowledgeRouteSignals;
    sessionUser?: string;
  }) => Promise<KnowledgeIntentContract | null>;
};

const KNOWLEDGE_SCOPE_PATTERNS = [
  /\u77e5\u8bc6\u5e93|\u6587\u6863\u5e93|\u8d44\u6599\u5e93|\u5e93\u5185/i,
  /\u7b80\u5386\u5e93|\u4eba\u624d\u7b80\u5386|\u6807\u4e66\u5e93|\u8ba2\u5355\u5206\u6790|\u5e93\u5b58|\u5408\u540c\u5e93|\u8bba\u6587\u5e93/i,
];

const CATALOG_REQUEST_PATTERNS = [
  /\u6709\u54ea\u4e9b|\u6709\u591a\u5c11|\u6700\u8fd1\u4e0a\u4f20|\u521a\u4e0a\u4f20|\u65b0\u4e0a\u4f20|\u6700\u65b0\u6709\u54ea\u4e9b|\u6700\u8fd1\u6709\u54ea\u4e9b/i,
  /\u65b0\u589e|\u5220\u9664|\u4fee\u6539|\u53d8\u66f4|\u6392\u9664|\u6062\u590d|\u5ba1\u8ba1/i,
  /\u4ec0\u4e48\u5e93|\u54ea\u4e9b\u5e93|\u5e93\u91cc\u6709\u4ec0\u4e48|\u5e93\u5185\u6709\u4ec0\u4e48/i,
];

const DETAIL_PATTERNS =
  /\u7ec6\u8282|\u8be6\u7ec6|\u5177\u4f53|\u6761\u6b3e|\u53c2\u6570|\u5185\u5bb9|\u4f9d\u636e|\u539f\u6587|\u8bc1\u636e|\u7ae0\u8282|\u63a5\u53e3|\u5b57\u6bb5|\u5b66\u5386|\u516c\u53f8|\u65e5\u671f|\u91d1\u989d|\u9884\u7b97|\u7ed3\u8bba/;

const COMPARISON_PATTERNS =
  /\u5bf9\u6bd4|\u5bf9\u7167|\u76d8\u4e00\u4e0b|\u6bd4\u4e00\u6bd4|\u6700\u65b0\u7684?\u51e0\u4efd|\u6700\u8fd1\u7684?\u51e0\u4efd|\u6700\u65b0\u7684?\u51e0\u4e2a|\u6700\u8fd1\u7684?\u51e0\u4e2a|\u770b\u770b.*\u51e0\u4efd/;

const OUTPUT_ACTION_PATTERNS = [
  /\u8f93\u51fa|\u751f\u6210|\u505a\u6210|\u505a\u4e00\u4efd|\u505a\u4e2a|\u5bfc\u51fa|\u5f62\u6210|\u4ea7\u51fa/i,
];

const OUTPUT_ARTIFACT_PATTERNS = [
  /\u62a5\u8868|\u8868\u683c|\u5bf9\u6bd4\u8868|\u9759\u6001\u9875|\u53ef\u89c6\u5316|\u62a5\u544a|dashboard|\u9a7e\u9a76\u8231|ppt|pdf|word|docx/i,
];

const SUMMARY_PATTERNS =
  /\u6982\u62ec|\u603b\u7ed3|\u603b\u89c8|\u6982\u89c8|\u68b3\u7406|\u8bf4\u4e0b|\u8bb2\u4e0b|\u76d8\u4e00\u4e0b|\u76d8\u70b9|\u7b80\u5355\u8bf4|\u5148\u7ed9\u7ed3\u8bba/;

const OUTPUT_SUPPRESSION_PATTERNS = [
  /\u4e0d\u7528\u51fa\u8868|\u4e0d\u7528\u8868\u683c|\u4e0d\u7528\u62a5\u8868|\u4e0d\u7528\u9759\u6001\u9875|\u4e0d\u7528\u62a5\u544a/i,
  /\u5148\u7b80\u5355\u8bf4|\u5148\u8bf4\u4e0b|\u5148\u804a\u804a|\u5148\u770b\u4e0b|\u5148\u7ed9\u7ed3\u8bba/i,
];

const SPECIFIC_DOCUMENT_PATTERNS = [
  /\u8fd9\u4efd\u6587\u6863|\u8fd9\u4e2a\u6587\u4ef6|\u8fd9\u4efd\u6750\u6599|\u8fd9\u7bc7\u6587\u6863|\u8be5\u6587\u6863|\u8be5\u6587\u4ef6/i,
  /\u6700\u65b0\u90a3\u4efd|\u6700\u8fd1\u90a3\u4efd|\u7b2c\u4e00\u4efd|\u67d0\u4e2a\u6587\u4ef6|\u6307\u5b9a\u6587\u6863/i,
];

const RECENT_UPLOAD_PATTERNS = /\u6700\u8fd1\u4e0a\u4f20|\u521a\u4e0a\u4f20|\u65b0\u4e0a\u4f20|\u8fd9\u6279\u6587\u6863|\u8fd9\u6279\u6750\u6599/i;

function trimJsonCandidate(raw: string) {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  const text = fenced ? fenced[1].trim() : raw.trim();
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) return text.slice(firstBrace, lastBrace + 1);
  return text;
}

function normalizeRoute(value: unknown): KnowledgeChatRouteKind {
  const text = String(value || '').trim().toLowerCase();
  if (['catalog', 'detail', 'output', 'general'].includes(text)) {
    return text as KnowledgeChatRouteKind;
  }
  return 'general';
}

function normalizeRequestedForm(value: unknown, prompt: string): KnowledgeIntentContract['requestedForm'] {
  const text = String(value || '').trim().toLowerCase();
  if (['answer', 'table', 'page', 'pdf', 'ppt'].includes(text)) {
    return text as KnowledgeIntentContract['requestedForm'];
  }
  const detected = detectOutputKind(prompt);
  if (detected) return detected;
  return 'answer';
}

function normalizeTargetScope(value: unknown): KnowledgeIntentContract['targetScope'] {
  const text = String(value || '').trim().toLowerCase();
  if ([
    'general',
    'library_overview',
    'recent_changes',
    'latest_documents',
    'specific_document',
    'document_facts',
    'comparison',
  ].includes(text)) {
    return text as KnowledgeIntentContract['targetScope'];
  }
  return 'general';
}

function clampConfidence(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.5;
  return Math.min(1, Math.max(0, parsed));
}

function buildSignals(prompt: string, libraries: Array<{ key: string; label: string }>): KnowledgeRouteSignals {
  const text = String(prompt || '').trim();
  const explicitOutputArtifact = OUTPUT_ARTIFACT_PATTERNS.some((pattern) => pattern.test(text));
  const explicitOutputAction = OUTPUT_ACTION_PATTERNS.some((pattern) => pattern.test(text));
  const summaryRequest = SUMMARY_PATTERNS.test(text);
  const explicitOutputRequest = explicitOutputArtifact || (explicitOutputAction && !summaryRequest);
  const outputSuppressed = OUTPUT_SUPPRESSION_PATTERNS.some((pattern) => pattern.test(text));
  const comparisonRequest = COMPARISON_PATTERNS.test(text);
  const mentionsSpecificDocument = SPECIFIC_DOCUMENT_PATTERNS.some((pattern) => pattern.test(text));
  const mentionsRecentUploads = RECENT_UPLOAD_PATTERNS.test(text);
  return {
    explicitKnowledgeScope: KNOWLEDGE_SCOPE_PATTERNS.some((pattern) => pattern.test(text)) || libraries.length > 0,
    explicitCatalogRequest: CATALOG_REQUEST_PATTERNS.some((pattern) => pattern.test(text)),
    explicitDetailRequest: DETAIL_PATTERNS.test(text),
    explicitOutputRequest,
    explicitOutputArtifact,
    outputSuppressed,
    comparisonRequest,
    mentionsSpecificDocument,
    mentionsRecentUploads,
    summaryRequest,
  };
}

function buildLocalIntentContract(input: {
  prompt: string;
  libraries: Array<{ key: string; label: string }>;
  signals: KnowledgeRouteSignals;
}): KnowledgeIntentContract {
  const { prompt, libraries, signals } = input;
  const route: KnowledgeChatRouteKind = signals.explicitOutputArtifact && !signals.outputSuppressed
    ? 'output'
    : (signals.explicitDetailRequest || signals.comparisonRequest || signals.mentionsSpecificDocument)
      ? 'detail'
      : (signals.explicitCatalogRequest || signals.mentionsRecentUploads)
        ? 'catalog'
        : (signals.summaryRequest && signals.explicitKnowledgeScope)
          ? 'detail'
          : signals.explicitKnowledgeScope
            ? 'catalog'
        : 'general';
  const targetScope: KnowledgeIntentContract['targetScope'] = signals.comparisonRequest
    ? 'comparison'
    : signals.mentionsSpecificDocument
      ? 'specific_document'
      : signals.explicitDetailRequest
        ? 'document_facts'
        : signals.explicitCatalogRequest
          ? 'library_overview'
          : signals.mentionsRecentUploads
            ? 'latest_documents'
            : 'general';
  const subject = libraries[0]?.label || libraries[0]?.key || 'general';
  const requestedForm = route === 'output'
    ? normalizeRequestedForm('unknown', prompt)
    : 'answer';

  return {
    route,
    subject,
    requestedForm,
    targetScope,
    needsLiveDetail: route === 'detail' || route === 'output',
    normalizedRequest: String(prompt || '').trim(),
    rationale: route === 'general'
      ? 'No stable knowledge-specific signal was found.'
      : `Local trigger signals classified this request as ${route}.`,
    confidence: route === 'general' ? 0.35 : 0.68,
  };
}

export function extractKnowledgeIntentContract(rawContent: string, prompt: string): KnowledgeIntentContract | null {
  try {
    const parsed = JSON.parse(trimJsonCandidate(String(rawContent || ''))) as Record<string, unknown>;
    return {
      route: normalizeRoute(parsed.route),
      subject: String(parsed.subject || '').trim() || 'general',
      requestedForm: normalizeRequestedForm(parsed.requestedForm, prompt),
      targetScope: normalizeTargetScope(parsed.targetScope),
      needsLiveDetail: Boolean(parsed.needsLiveDetail),
      normalizedRequest: String(parsed.normalizedRequest || prompt || '').trim() || String(prompt || '').trim(),
      rationale: String(parsed.rationale || '').trim(),
      confidence: clampConfidence(parsed.confidence),
    };
  } catch {
    return null;
  }
}

export function buildKnowledgeRouterPrompt(input: {
  prompt: string;
  chatHistory: ChatHistoryItem[];
  libraries: Array<{ key: string; label: string }>;
  signals: KnowledgeRouteSignals;
}) {
  const recentTurns = input.chatHistory
    .slice(-4)
    .map((item) => `${item.role === 'assistant' ? 'Assistant' : 'User'}: ${item.content}`)
    .join('\n');
  const libraryText = input.libraries.length
    ? input.libraries.map((item) => item.label || item.key).join(', ')
    : 'none';

  return [
    'You are a thin intent router for a knowledge assistant.',
    'Classify the request into one route only: general, catalog, detail, or output.',
    'general: ordinary conversation not requiring knowledge-library routing.',
    'catalog: asks what libraries or documents exist, what changed recently, or recent uploads/exclusions.',
    'detail: asks for concrete document facts, comparisons of actual documents, or specific fields/evidence.',
    'output: asks for a finished deliverable such as table, report, static page, dashboard, ppt, or pdf.',
    'If the user says not to output a table/report/page yet, do not choose output.',
    'Return strict JSON only with schema:',
    '{"route":"general|catalog|detail|output","subject":"...","requestedForm":"answer|table|page|pdf|ppt","targetScope":"general|library_overview|recent_changes|latest_documents|specific_document|document_facts|comparison","needsLiveDetail":true|false,"normalizedRequest":"...","rationale":"...","confidence":0.0}',
    recentTurns ? `Recent conversation:\n${recentTurns}` : '',
    `Matched libraries: ${libraryText}`,
    `Trigger signals: ${JSON.stringify(input.signals)}`,
    `Current user request: ${input.prompt}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function finalizeKnowledgeRoute(
  contract: KnowledgeIntentContract,
  signals: KnowledgeRouteSignals,
): KnowledgeChatRouteKind {
  if (signals.explicitOutputArtifact && !signals.outputSuppressed) return 'output';
  if (!signals.explicitOutputArtifact && contract.route === 'output') {
    if (signals.explicitDetailRequest || signals.comparisonRequest || signals.mentionsSpecificDocument) return 'detail';
    if (signals.explicitCatalogRequest || signals.mentionsRecentUploads) return 'catalog';
    if (signals.summaryRequest || signals.explicitKnowledgeScope) return 'detail';
    return 'general';
  }
  if (signals.outputSuppressed && contract.route === 'output') {
    if (signals.explicitDetailRequest || signals.comparisonRequest || signals.mentionsSpecificDocument) return 'detail';
    if (signals.explicitCatalogRequest || signals.mentionsRecentUploads) return 'catalog';
    return 'general';
  }
  if (signals.mentionsSpecificDocument || signals.comparisonRequest) return 'detail';
  if (signals.explicitDetailRequest && (!signals.explicitOutputArtifact || contract.route !== 'output')) return 'detail';
  if (signals.explicitCatalogRequest && !signals.explicitDetailRequest && !signals.explicitOutputArtifact) return 'catalog';
  if (signals.summaryRequest && !signals.explicitOutputArtifact) return 'detail';
  return contract.route;
}

async function resolveCloudIntentContract(input: {
  prompt: string;
  chatHistory: ChatHistoryItem[];
  libraries: Array<{ key: string; label: string }>;
  signals: KnowledgeRouteSignals;
  sessionUser?: string;
}) {
  const cloud = await runOpenClawChat({
    prompt: buildKnowledgeRouterPrompt(input),
    sessionUser: input.sessionUser,
    chatHistory: [],
  });
  return extractKnowledgeIntentContract(cloud.content, input.prompt);
}

function resolveEvidenceMode(route: KnowledgeChatRouteKind): KnowledgeEvidenceMode | null {
  if (route === 'catalog') return 'catalog_memory';
  if (route === 'detail' || route === 'output') return 'live_detail';
  return null;
}

export async function resolveKnowledgeChatRoute(
  input: ResolveKnowledgeChatRouteInput,
  options?: ResolveKnowledgeChatRouteOptions,
): Promise<KnowledgeChatRouteDecision> {
  const scoredLibraries = collectLibraryMatches(
    buildPromptForScoring(input.prompt, input.chatHistory),
    input.libraries,
  ).map((item) => ({ key: item.library.key, label: item.library.label }));
  const signals = buildSignals(input.prompt, scoredLibraries);
  const localContract = buildLocalIntentContract({
    prompt: input.prompt,
    libraries: scoredLibraries,
    signals,
  });

  const shouldConsultCloud = (
    signals.explicitKnowledgeScope
    || signals.explicitCatalogRequest
    || signals.explicitDetailRequest
    || signals.explicitOutputRequest
    || signals.comparisonRequest
    || signals.mentionsSpecificDocument
    || signals.mentionsRecentUploads
  );

  let contract = localContract;

  if (shouldConsultCloud) {
    try {
      const cloudContract = options?.resolveCloudContract
        ? await options.resolveCloudContract({
          prompt: input.prompt,
          chatHistory: input.chatHistory,
          libraries: scoredLibraries,
          signals,
          sessionUser: input.sessionUser,
        })
        : await resolveCloudIntentContract({
          prompt: input.prompt,
          chatHistory: input.chatHistory,
          libraries: scoredLibraries,
          signals,
          sessionUser: input.sessionUser,
        });
      if (cloudContract) {
        contract = {
          ...cloudContract,
          requestedForm: cloudContract.requestedForm === 'unknown'
            ? localContract.requestedForm
            : cloudContract.requestedForm,
          normalizedRequest: cloudContract.normalizedRequest || localContract.normalizedRequest,
        };
      }
    } catch {
      contract = localContract;
    }
  }

  const route = finalizeKnowledgeRoute(contract, signals);
  const effectiveContract: KnowledgeIntentContract = {
    ...contract,
    route,
    needsLiveDetail: route === 'detail' || route === 'output',
    requestedForm: route === 'output'
      ? (contract.requestedForm === 'answer' ? normalizeRequestedForm('unknown', input.prompt) : contract.requestedForm)
      : 'answer',
  };

  return {
    route,
    evidenceMode: resolveEvidenceMode(route),
    libraries: scoredLibraries,
    contract: effectiveContract,
    signals,
  };
}
