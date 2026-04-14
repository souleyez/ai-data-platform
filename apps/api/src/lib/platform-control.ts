import {
  loadDocumentLibraries,
  type DocumentLibrary,
} from './document-libraries.js';
import { buildDocumentId } from './document-store.js';
import { prepareKnowledgeSupply } from './knowledge-supply.js';
import {
  loadLatestVisibleDetailedDocumentContext,
  shouldIncludeUploadedDocumentFullText,
} from './knowledge-chat-dispatch.js';
import { parseGeneralKnowledgeConversationState } from './knowledge-request-state.js';
import { loadOpenClawMemoryCatalogSnapshot } from './openclaw-memory-catalog.js';
import {
  getPlatformCapabilityArea,
  getPlatformIntegration,
  PLATFORM_CAPABILITY_AREAS,
  PLATFORM_INTEGRATIONS,
  PLATFORM_OUTPUT_FORMATS,
  type PlatformCapabilityArea,
  type PlatformIntegration,
} from './platform-capabilities.js';
import { runDocumentCommand } from './platform-control-documents.js';
import { runDatasourceCommand } from './platform-control-datasources.js';
import { runModelCommand } from './platform-control-models.js';
import { runReportCommand } from './platform-control-reports.js';

type CommandFlags = Record<string, string>;

export type PlatformControlResult = {
  ok: boolean;
  action: string;
  summary: string;
  data?: Record<string, unknown>;
};

function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCommandArgs(argv: string[]) {
  const positionals: string[] = [];
  const flags: CommandFlags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || '').trim();
    if (!token) continue;
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2).trim();
    const next = String(argv[index + 1] || '').trim();
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = 'true';
    }
  }

  return { positionals, flags };
}

function clampLimit(value: string | undefined, fallback: number, max: number) {
  return Math.max(1, Math.min(max, Number(value || fallback) || fallback));
}

function scoreLibraryMatch(reference: string, library: DocumentLibrary) {
  const normalizedReference = normalizeText(reference);
  const haystack = normalizeText(`${library.key} ${library.label} ${library.description || ''}`);
  if (!normalizedReference || !haystack) return 0;
  if (haystack === normalizedReference) return 120;
  if (haystack.includes(normalizedReference)) return 90;
  if (normalizedReference.includes(normalizeText(library.label || ''))) return 60;
  if (normalizedReference.includes(normalizeText(library.key || ''))) return 50;
  return 0;
}

async function resolveLibraryReference(reference: string) {
  const libraries = await loadDocumentLibraries();
  if (!libraries.length) {
    throw new Error('No knowledge libraries are configured.');
  }

  const normalizedReference = String(reference || '').trim();
  if (!normalizedReference && libraries.length === 1) {
    return libraries[0];
  }
  if (!normalizedReference) {
    throw new Error('Missing --library.');
  }

  const matches = libraries
    .map((library) => ({ library, score: scoreLibraryMatch(normalizedReference, library) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!matches.length) {
    throw new Error(`No library matched "${reference}".`);
  }
  if (matches.length > 1 && matches[0].score === matches[1].score) {
    throw new Error(`Library match is ambiguous: ${matches.slice(0, 5).map((item) => item.library.label).join(', ')}`);
  }
  return matches[0].library;
}

function describeCapabilityArea(area: PlatformCapabilityArea) {
  return {
    id: area.id,
    label: area.label,
    description: area.description,
    abilities: area.abilities,
    commands: area.commands,
  };
}

function describeIntegration(integration: PlatformIntegration) {
  return {
    id: integration.id,
    label: integration.label,
    kind: integration.kind,
    description: integration.description,
    capabilities: integration.capabilities,
  };
}

async function runCapabilityCommand(subcommand: string, flags: CommandFlags): Promise<PlatformControlResult> {
  if (!subcommand || subcommand === 'list') {
    return {
      ok: true,
      action: 'capabilities.list',
      summary: `Listed ${PLATFORM_CAPABILITY_AREAS.length} capability areas and ${PLATFORM_INTEGRATIONS.length} integrations.`,
      data: {
        outputFormats: [...PLATFORM_OUTPUT_FORMATS],
        areas: PLATFORM_CAPABILITY_AREAS.map(describeCapabilityArea),
        integrations: PLATFORM_INTEGRATIONS.map(describeIntegration),
      },
    };
  }

  if (subcommand === 'show') {
    const areaId = String(flags.area || flags.domain || flags.id || '').trim();
    const integrationId = String(flags.integration || '').trim();

    if (areaId) {
      const area = getPlatformCapabilityArea(areaId);
      if (!area) {
        throw new Error(`Unknown capability area "${areaId}".`);
      }
      return {
        ok: true,
        action: 'capabilities.show',
        summary: `Loaded capability area "${area.label}".`,
        data: {
          area: describeCapabilityArea(area),
        },
      };
    }

    if (integrationId) {
      const integration = getPlatformIntegration(integrationId);
      if (!integration) {
        throw new Error(`Unknown integration "${integrationId}".`);
      }
      return {
        ok: true,
        action: 'capabilities.show',
        summary: `Loaded integration "${integration.label}".`,
        data: {
          integration: describeIntegration(integration),
        },
      };
    }

    throw new Error('Missing --area or --integration for capabilities show.');
  }

  throw new Error(`Unsupported capabilities subcommand: ${subcommand}`);
}

async function runSupplyCommand(subcommand: string, flags: CommandFlags): Promise<PlatformControlResult> {
  if (!subcommand || subcommand === 'preview') {
    const prompt = String(flags.prompt || flags.request || '').trim();
    if (!prompt) throw new Error('Missing --prompt for supply preview.');
    const generalState = parseGeneralKnowledgeConversationState({
      kind: 'general',
      preferredDocumentPath: String(flags['preferred-document'] || '').trim(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const preferredDocumentPath = String(generalState?.preferredDocumentPath || '').trim();
    const shouldAttachLatestDocumentFullText = shouldIncludeUploadedDocumentFullText(prompt, preferredDocumentPath);
    const latestDetailedDocumentContext = shouldAttachLatestDocumentFullText
      ? await loadLatestVisibleDetailedDocumentContext({
          preferredDocumentPath,
        })
      : { document: null, preferredDocument: null, preferredDocumentReady: false };
    const catalogSnapshot = await loadOpenClawMemoryCatalogSnapshot();
    const preferredDocumentStatus = !preferredDocumentPath
      ? 'none'
      : latestDetailedDocumentContext.preferredDocumentReady
        ? 'ready'
        : (latestDetailedDocumentContext.preferredDocument ? 'not_ready' : 'missing');
    const latestDocumentFullTextIncluded = Boolean(
      shouldAttachLatestDocumentFullText && latestDetailedDocumentContext.document,
    );

    const library = flags.library ? await resolveLibraryReference(flags.library) : null;
    const supply = await prepareKnowledgeSupply({
      requestText: prompt,
      chatHistory: [],
      preferredLibraries: library ? [{ key: library.key, label: library.label }] : [],
      timeRange: String(flags['time-range'] || '').trim(),
      contentFocus: String(flags.focus || '').trim(),
      docLimit: clampLimit(flags['doc-limit'], 6, 24),
      evidenceLimit: clampLimit(flags['evidence-limit'], 8, 24),
    });

    return {
      ok: true,
      action: 'supply.preview',
      summary: `Prepared supply for ${supply.libraries.length || 0} libraries, ${supply.effectiveRetrieval.documents.length} documents, and ${supply.effectiveRetrieval.evidenceMatches.length} evidence chunks.`,
      data: {
        libraries: supply.libraries,
        documents: supply.effectiveRetrieval.documents.map((item) => ({
          id: buildDocumentId(item.path),
          title: item.title || item.name,
          path: item.path,
          parseStage: item.parseStage,
          detailParseStatus: item.detailParseStatus,
          summary: item.summary || '',
        })),
        evidenceMatches: supply.effectiveRetrieval.evidenceMatches.map((item) => ({
          documentId: buildDocumentId(item.item.path),
          documentTitle: item.item.title || item.item.name,
          documentPath: item.item.path,
          score: item.score,
          chunkId: item.chunkId,
          chunkText: item.chunkText,
        })),
        meta: supply.effectiveRetrieval.meta,
        supplyContext: {
          catalogMemoryLibraries: catalogSnapshot?.libraryCount || 0,
          catalogMemoryDocuments: catalogSnapshot?.documentCount || 0,
          catalogMemoryOutputs: catalogSnapshot?.outputCount || 0,
          preferredDocumentPath,
          preferredDocumentStatus,
          latestDocumentFullTextIncluded,
        },
      },
    };
  }

  throw new Error(`Unsupported supply subcommand: ${subcommand}`);
}


export async function executePlatformControlCommand(argv: string[]): Promise<PlatformControlResult> {
  const normalizedArgv = argv.filter((token) => String(token || '').trim() !== '--');
  const { positionals, flags } = parseCommandArgs(normalizedArgv);
  const [domain = '', subcommand = ''] = positionals;

  if (!domain) {
    throw new Error(`Missing control domain. Supported domains: ${PLATFORM_CAPABILITY_AREAS.map((item) => item.id).join(', ')}`);
  }

  if (domain === 'capabilities') {
    return runCapabilityCommand(subcommand || 'list', flags);
  }

  if (domain === 'documents') {
    return runDocumentCommand(subcommand || 'libraries', flags);
  }

  if (domain === 'supply') {
    return runSupplyCommand(subcommand || 'preview', flags);
  }

  if (domain === 'datasources') {
    return runDatasourceCommand(subcommand || 'list', flags);
  }

  if (domain === 'reports') {
    return runReportCommand(subcommand || 'outputs', flags);
  }

  if (domain === 'models') {
    return runModelCommand(subcommand || 'status', flags);
  }

  throw new Error(`Unsupported control domain: ${domain}`);
}
