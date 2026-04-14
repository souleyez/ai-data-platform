import path from 'node:path';
import { persistChatOutputIfNeeded } from './chat-output-persistence.js';
import { loadDocumentCategoryConfig } from './document-config.js';
import {
  documentMatchesLibrary,
  loadDocumentLibraries,
  type DocumentLibrary,
} from './document-libraries.js';
import {
  DATASOURCE_AUTH_MODES,
  DATASOURCE_KINDS,
  DATASOURCE_SCHEDULE_KINDS,
  deleteDatasourceDefinition,
  deleteDatasourceRun,
  getDatasourceDefinition,
  listDatasourceDefinitions,
  listDatasourceRuns,
  upsertDatasourceDefinition,
  type DatasourceDefinition,
  type DatasourceTargetLibrary,
} from './datasource-definitions.js';
import { logDatasourceRunDeletion } from './datasource-audit.js';
import {
  deleteDatasourceCredential,
  listDatasourceCredentials,
  upsertDatasourceCredential,
  type DatasourceCredentialKind,
} from './datasource-credentials.js';
import {
  activateDatasourceDefinition,
  deleteDatasourceExecutionArtifacts,
  pauseDatasourceDefinition,
  runDatasourceDefinition,
  runDueDatasourceDefinitions,
} from './datasource-execution.js';
import {
  buildDatasourceLibraryLabelMap,
  buildDatasourceRunReadModels,
} from './datasource-service.js';
import { syncWebCaptureTaskToDatasource } from './datasource-web-bridge.js';
import { ingestWebCaptureTaskDocument } from './datasource-web-ingest.js';
import {
  loadDocumentDetailPayload,
} from './document-route-detail-loaders.js';
import {
  createManagedDocumentLibrary,
  deleteManagedDocumentLibrary,
  updateManagedDocumentLibrary,
} from './document-route-services.js';
import {
  runDocumentCanonicalBackfillAction,
  runDocumentDeepParseAction,
  runDocumentOrganizeAction,
  runDocumentReparseAction,
  runDocumentVectorRebuildAction,
  runReclusterUngroupedAction,
} from './document-route-operations.js';
import { ingestLocalFilesIntoLibrary } from './document-upload-ingest.js';
import { buildDocumentId, DEFAULT_SCAN_DIR, loadParsedDocuments } from './document-store.js';
import { readOpenClawMemorySyncStatus } from './openclaw-memory-sync.js';
import { executeKnowledgeOutput } from './knowledge-execution.js';
import { prepareKnowledgeSupply } from './knowledge-supply.js';
import {
  loadLatestVisibleDetailedDocumentContext,
  shouldIncludeUploadedDocumentFullText,
} from './knowledge-chat-dispatch.js';
import { parseGeneralKnowledgeConversationState } from './knowledge-request-state.js';
import { loadOpenClawMemoryCatalogSnapshot } from './openclaw-memory-catalog.js';
import {
  installLatestOpenClaw,
  launchProviderLogin,
  loadModelConfigState,
  saveProviderSettings,
  updateSelectedModel,
} from './model-config.js';
import {
  getPlatformCapabilityArea,
  getPlatformIntegration,
  PLATFORM_CAPABILITY_AREAS,
  PLATFORM_INTEGRATIONS,
  PLATFORM_OUTPUT_FORMATS,
  type PlatformCapabilityArea,
  type PlatformIntegration,
} from './platform-capabilities.js';
import {
  addSharedTemplateReferenceFileFromPath,
  addSharedTemplateReferenceLink,
  createSharedReportTemplate,
  deleteReportOutput,
  deleteSharedReportTemplate,
  finalizeDraftReportOutput,
  inferReportTemplateTypeFromSource,
  loadReportCenterState,
  reviseReportOutputDraftCopy,
  reviseReportOutputDraftModule,
  reviseReportOutputDraftStructure,
  reviseReportOutput,
  updateReportGroupTemplate,
  updateSharedReportTemplate,
  type ReportTemplateType,
} from './report-center.js';
import type { ReportPlanLayoutVariant } from './report-planner.js';
import type { KnowledgeOutputKind } from './knowledge-template.js';
import { createAndRunWebCaptureTask, listWebCaptureTasks, runDueWebCaptureTasks } from './web-capture.js';
import {
  buildWebCaptureCredentialSummary,
  loadWebCaptureCredential,
  saveWebCaptureCredential,
} from './web-capture-credentials.js';

type CommandFlags = Record<string, string>;
type ModelProviderId = 'openai' | 'github-copilot' | 'minimax' | 'moonshot' | 'zai';

export type PlatformControlResult = {
  ok: boolean;
  action: string;
  summary: string;
  data?: Record<string, unknown>;
};

const DATASOURCE_KIND_ALIASES: Record<string, string[]> = {
  local_directory: ['local directory', 'directory datasource', 'folder datasource'],
  upload_public: ['upload datasource', 'public upload'],
  web_public: ['web datasource', 'public web'],
  web_login: ['login web datasource', 'logged-in web'],
  web_discovery: ['web discovery', 'discovery web datasource'],
  database: ['database datasource', 'database'],
  erp: ['erp', 'business system datasource'],
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

function splitFlagList(value: string | undefined) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveBooleanFlag(value: string | undefined) {
  const normalized = normalizeText(value || '');
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function resolveDatasourceKindFlag(value: string | undefined): DatasourceDefinition['kind'] {
  const normalized = normalizeText(value || '').replace(/\s+/g, '_');
  if (!normalized) return 'web_public';
  const direct = DATASOURCE_KINDS.find((item) => item === normalized);
  if (direct) return direct;
  if (normalized === 'web' || normalized === 'public_web') return 'web_public';
  if (normalized === 'web_login' || normalized === 'login_web') return 'web_login';
  if (normalized === 'web_discovery' || normalized === 'discovery_web') return 'web_discovery';
  if (normalized === 'upload' || normalized === 'public_upload') return 'upload_public';
  if (normalized === 'local' || normalized === 'directory' || normalized === 'folder') return 'local_directory';
  throw new Error(`Unsupported datasource kind "${value}".`);
}

function resolveDatasourceStatusFlag(value: string | undefined): DatasourceDefinition['status'] {
  const normalized = normalizeText(value || '');
  if (!normalized) return 'active';
  if (normalized === 'draft') return 'draft';
  if (normalized === 'paused' || normalized === 'pause') return 'paused';
  if (normalized === 'error') return 'error';
  if (normalized === 'active' || normalized === 'enabled') return 'active';
  throw new Error(`Unsupported datasource status "${value}".`);
}

function resolveDatasourceScheduleFlag(value: string | undefined): DatasourceDefinition['schedule']['kind'] {
  const normalized = normalizeText(value || '');
  if (!normalized) return 'manual';
  const direct = DATASOURCE_SCHEDULE_KINDS.find((item) => item === normalized);
  if (direct) return direct;
  throw new Error(`Unsupported datasource schedule "${value}".`);
}

function resolveDatasourceAuthModeFlag(value: string | undefined, kind: DatasourceDefinition['kind']): DatasourceDefinition['authMode'] {
  if (kind === 'local_directory') return 'none';
  const normalized = normalizeText(value || '');
  if (!normalized) return 'none';
  const direct = DATASOURCE_AUTH_MODES.find((item) => item === normalized);
  if (direct) return direct;
  throw new Error(`Unsupported datasource auth mode "${value}".`);
}

function resolveDatasourceCredentialKindFlag(value: string | undefined): DatasourceCredentialKind {
  const normalized = normalizeText(value || '');
  if (!normalized) return 'credential';
  if (normalized === 'credential' || normalized === 'login') return 'credential';
  if (normalized === 'manual_session' || normalized === 'session') return 'manual_session';
  if (normalized === 'database_password' || normalized === 'database') return 'database_password';
  if (normalized === 'api token' || normalized === 'api_token' || normalized === 'token') return 'api_token';
  throw new Error(`Unsupported datasource credential kind "${value}".`);
}

function parseHeadersFlag(value: string | undefined) {
  const entries = splitFlagList(value);
  if (!entries.length) return undefined;
  const headers = Object.fromEntries(
    entries
      .map((entry) => {
        const [key, ...rest] = String(entry || '').split(':');
        return [String(key || '').trim(), rest.join(':').trim()] as const;
      })
      .filter(([key, headerValue]) => key && headerValue),
  );
  return Object.keys(headers).length ? headers : undefined;
}

function buildDatasourceConfigPatch(
  flags: CommandFlags,
  kind: DatasourceDefinition['kind'],
  existingConfig: Record<string, unknown> = {},
) {
  const nextConfig: Record<string, unknown> = { ...existingConfig };
  if (flags.url !== undefined) nextConfig.url = String(flags.url || '').trim();
  if (flags.path !== undefined) nextConfig.path = path.resolve(String(flags.path || '').trim());
  if (flags.focus !== undefined) nextConfig.focus = String(flags.focus || '').trim();
  if (flags.note !== undefined) nextConfig.note = String(flags.note || '').trim();
  if (flags.keywords !== undefined) nextConfig.keywords = splitFlagList(flags.keywords);
  if (flags['site-hints'] !== undefined) nextConfig.siteHints = splitFlagList(flags['site-hints']);
  if (flags['seed-urls'] !== undefined) nextConfig.seedUrls = splitFlagList(flags['seed-urls']);
  if (flags['crawl-mode'] !== undefined) {
    const crawlMode = normalizeText(flags['crawl-mode']);
    nextConfig.crawlMode = crawlMode === 'listing detail' ? 'listing-detail' : 'single-page';
  }
  if (flags['max-items'] !== undefined) nextConfig.maxItems = clampLimit(flags['max-items'], 5, 200);
  if (flags['keep-original'] !== undefined) nextConfig.keepOriginalFiles = resolveBooleanFlag(flags['keep-original']);
  if (kind === 'upload_public' && flags['upload-token'] !== undefined) {
    nextConfig.uploadToken = String(flags['upload-token'] || '').trim();
  }
  return nextConfig;
}

function buildDatasourceMatchTerms(definition: DatasourceDefinition) {
  const pathHints = [
    String(definition.config?.path || '').trim(),
    String(definition.config?.url || '').trim(),
  ]
    .filter(Boolean)
    .flatMap((value) => {
      const parts = value.split(/[\\/]/).filter(Boolean);
      return [value, parts.at(-1) || '', parts.at(-2) || ''];
    });

  return [
    definition.name,
    definition.id,
    ...definition.targetLibraries.flatMap((item) => [item.key, item.label]),
    ...(DATASOURCE_KIND_ALIASES[definition.kind] || []),
    ...pathHints,
  ];
}

function scoreDatasourceMatch(reference: string, definition: DatasourceDefinition) {
  const normalizedReference = normalizeText(reference);
  if (!normalizedReference) return 0;

  let score = 0;
  for (const term of buildDatasourceMatchTerms(definition)) {
    const normalizedTerm = normalizeText(term);
    if (!normalizedTerm) continue;
    if (normalizedReference === normalizedTerm) {
      score += 120;
      continue;
    }
    if (normalizedReference.includes(normalizedTerm)) {
      score += Math.max(18, Math.min(72, normalizedTerm.length * 6));
    }
  }
  return score;
}

async function resolveDatasourceReference(reference: string) {
  const definitions = await listDatasourceDefinitions();
  if (!definitions.length) {
    throw new Error('No managed datasources are configured.');
  }

  const normalizedReference = String(reference || '').trim();
  if (!normalizedReference && definitions.length === 1) {
    return definitions[0];
  }
  if (!normalizedReference) {
    throw new Error(`Missing --datasource. Available: ${definitions.slice(0, 8).map((item) => item.name).join(', ')}`);
  }

  const matches = definitions
    .map((definition) => ({ definition, score: scoreDatasourceMatch(normalizedReference, definition) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!matches.length) {
    throw new Error(`No datasource matched "${normalizedReference}".`);
  }

  const topScore = matches[0].score;
  const closeMatches = matches.filter((item) => item.score >= Math.max(18, topScore - 10));
  if (closeMatches.length > 1) {
    throw new Error(`Datasource match is ambiguous: ${closeMatches.map((item) => item.definition.name).join(', ')}`);
  }

  return closeMatches[0].definition;
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

async function resolveTargetLibrariesFromFlags(flags: CommandFlags): Promise<DatasourceTargetLibrary[]> {
  const requested = [
    ...splitFlagList(flags.library),
    ...splitFlagList(flags.libraries),
  ];
  if (!requested.length) return [];

  const dedup = new Map<string, DatasourceTargetLibrary>();
  for (const [index, reference] of requested.entries()) {
    const library = await resolveLibraryReference(reference);
    if (!dedup.has(library.key)) {
      dedup.set(library.key, {
        key: library.key,
        label: library.label,
        mode: index === 0 ? 'primary' : 'secondary',
      });
    }
  }
  const values = Array.from(dedup.values());
  if (values[0]) values[0].mode = 'primary';
  return values;
}

function resolveOutputKind(value: string): KnowledgeOutputKind {
  const normalized = normalizeText(value);
  if (!normalized) return 'page';
  if (['table', 'sheet', 'csv'].includes(normalized)) return 'table';
  if (['page', 'static page', 'html'].includes(normalized)) return 'page';
  if (['ppt', 'pptx', 'slides'].includes(normalized)) return 'ppt';
  if (['pdf'].includes(normalized)) return 'pdf';
  if (['md', 'markdown'].includes(normalized)) return 'md';
  if (['doc', 'docx', 'docs', 'word'].includes(normalized)) return 'doc';
  throw new Error(`Unsupported output format "${value}". Supported: ${PLATFORM_OUTPUT_FORMATS.join(', ')}`);
}

function resolveReportTemplateType(value: string | undefined): ReportTemplateType | undefined {
  const normalized = normalizeText(value || '');
  if (!normalized) return undefined;
  if (['table', 'sheet', 'spreadsheet'].includes(normalized)) return 'table';
  if (['static-page', 'page', 'html', 'static page'].includes(normalized)) return 'static-page';
  if (['ppt', 'slides', 'pptx'].includes(normalized)) return 'ppt';
  if (['document', 'doc', 'docx', 'word'].includes(normalized)) return 'document';
  throw new Error('Unsupported template type. Supported: table, static-page, ppt, document');
}

function resolveReportLayoutVariant(value: string | undefined) {
  const normalized = normalizeText(value || '');
  if (!normalized) return undefined;
  if (normalized === 'insight brief') return 'insight-brief';
  if (normalized === 'risk brief') return 'risk-brief';
  if (normalized === 'operations cockpit') return 'operations-cockpit';
  if (normalized === 'talent showcase') return 'talent-showcase';
  if (normalized === 'research brief') return 'research-brief';
  if (normalized === 'solution overview') return 'solution-overview';
  throw new Error('Unsupported layout variant. Supported: insight-brief, risk-brief, operations-cockpit, talent-showcase, research-brief, solution-overview');
}

function formatOutputKindLabel(kind: KnowledgeOutputKind) {
  if (kind === 'table') return 'table';
  if (kind === 'page') return 'static page';
  if (kind === 'ppt') return 'ppt';
  if (kind === 'pdf') return 'pdf';
  if (kind === 'md') return 'markdown document';
  return 'document';
}

function buildTemplateOutputRequest(input: {
  libraryLabel: string;
  outputKind: KnowledgeOutputKind;
  timeRange: string;
  focus: string;
  templateKey: string;
  request: string;
}) {
  if (input.request) return input.request;

  const outputLabel = formatOutputKindLabel(input.outputKind);
  const timeText = input.timeRange ? `${input.timeRange} material` : 'all available material';
  const templateText = input.templateKey ? `using template ${input.templateKey}` : 'using the default template';
  const focusText = input.focus || input.libraryLabel;
  return `Use ${input.libraryLabel} library ${timeText}, ${templateText}, and generate a ${outputLabel} focused on ${focusText}.`;
}

function summarizeReportTemplateItem(item: {
  key: string;
  label: string;
  type: string;
  description?: string;
  preferredLayoutVariant?: string;
  isDefault?: boolean;
  origin?: string;
  referenceImages?: unknown[];
}) {
  return {
    key: item.key,
    label: item.label,
    type: item.type,
    description: item.description || '',
    preferredLayoutVariant: item.preferredLayoutVariant || '',
    isDefault: item.isDefault === true,
    origin: item.origin || 'system',
    referenceCount: Array.isArray(item.referenceImages) ? item.referenceImages.length : 0,
  };
}

function summarizeDocumentItem(item: Awaited<ReturnType<typeof loadParsedDocuments>>['items'][number]) {
  return {
    id: buildDocumentId(item.path),
    title: item.title || item.name,
    name: item.name,
    path: item.path,
    libraryGroups: Array.isArray(item.groups) ? item.groups : [],
    parseStage: item.parseStage,
    detailParseStatus: item.detailParseStatus,
    summary: item.summary || '',
  };
}

async function resolveDocumentSnapshotItem(documentId: string) {
  const normalizedId = String(documentId || '').trim();
  if (!normalizedId) {
    throw new Error('Missing --document.');
  }

  const snapshot = await loadParsedDocuments(5000, false);
  const item = snapshot.items.find((entry) => buildDocumentId(entry.path) === normalizedId);
  if (!item) {
    throw new Error(`Document "${normalizedId}" was not found.`);
  }
  return item;
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

async function runDocumentCommand(subcommand: string, flags: CommandFlags): Promise<PlatformControlResult> {
  if (!subcommand || subcommand === 'libraries') {
    const libraries = await loadDocumentLibraries();
    return {
      ok: true,
      action: 'documents.libraries',
      summary: `Loaded ${libraries.length} libraries.`,
      data: {
        items: libraries.map((item) => ({
          key: item.key,
          label: item.label,
          description: item.description || '',
        })),
      },
    };
  }

  if (subcommand === 'create-library') {
    const name = String(flags.name || flags.label || '').trim();
    if (!name) throw new Error('Missing --name for documents create-library.');
    const { library, libraries } = await createManagedDocumentLibrary({
      name,
      description: String(flags.description || '').trim() || undefined,
      permissionLevel: flags.permission !== undefined ? Number(flags.permission) : undefined,
    });
    return {
      ok: true,
      action: 'documents.create-library',
      summary: `Created library "${library.label}".`,
      data: {
        item: library,
        items: libraries,
      },
    };
  }

  if (subcommand === 'update-library') {
    const key = String(flags.library || flags.key || '').trim();
    if (!key) throw new Error('Missing --library for documents update-library.');
    const patch: Parameters<typeof updateManagedDocumentLibrary>[1] = {};
    if (flags.label !== undefined) patch.label = String(flags.label || '').trim();
    if (flags.description !== undefined) patch.description = String(flags.description || '').trim();
    if (flags.permission !== undefined) patch.permissionLevel = Number(flags.permission);
    if (flags['knowledge-pages'] !== undefined) patch.knowledgePagesEnabled = resolveBooleanFlag(flags['knowledge-pages']);
    if (flags['knowledge-pages-mode'] !== undefined) patch.knowledgePagesMode = String(flags['knowledge-pages-mode'] || '').trim() as 'none' | 'overview' | 'topics';
    if (!Object.keys(patch).length) {
      throw new Error('Missing library update fields. Provide --label, --description, --permission, or knowledge page flags.');
    }
    const { library, libraries } = await updateManagedDocumentLibrary(key, patch);
    return {
      ok: true,
      action: 'documents.update-library',
      summary: `Updated library "${library.label}".`,
      data: {
        item: library,
        items: libraries,
      },
    };
  }

  if (subcommand === 'delete-library') {
    const key = String(flags.library || flags.key || '').trim();
    if (!key) throw new Error('Missing --library for documents delete-library.');
    const { deleted, libraries } = await deleteManagedDocumentLibrary(key);
    return {
      ok: true,
      action: 'documents.delete-library',
      summary: `Deleted library "${deleted.label}".`,
      data: {
        item: deleted,
        items: libraries,
      },
    };
  }

  if (subcommand === 'list') {
    const libraries = await loadDocumentLibraries();
    const scopeLibrary = flags.library ? await resolveLibraryReference(flags.library) : null;
    const limit = clampLimit(flags.limit, 20, 200);
    const snapshot = await loadParsedDocuments(Math.max(limit * 5, 200), false);
    const items = (scopeLibrary
      ? snapshot.items.filter((item) => documentMatchesLibrary(item, scopeLibrary))
      : snapshot.items)
      .slice(0, limit)
      .map(summarizeDocumentItem);

    return {
      ok: true,
      action: 'documents.list',
      summary: `Loaded ${items.length} documents${scopeLibrary ? ` from ${scopeLibrary.label}` : ''}.`,
      data: {
        library: scopeLibrary
          ? { key: scopeLibrary.key, label: scopeLibrary.label }
          : null,
        totalCached: snapshot.items.length,
        availableLibraries: libraries.map((item) => ({ key: item.key, label: item.label })),
        items,
      },
    };
  }

  if (subcommand === 'import-local') {
    const filePaths = [
      ...splitFlagList(flags.paths),
      ...splitFlagList(flags.path),
    ];
    if (!filePaths.length) {
      throw new Error('Missing --path or --paths for documents import-local.');
    }
    const targetLibraries = await resolveTargetLibrariesFromFlags(flags);
    const config = await loadDocumentCategoryConfig(DEFAULT_SCAN_DIR);
    const libraries = await loadDocumentLibraries();
    const ingestResult = await ingestLocalFilesIntoLibrary({
      filePaths,
      documentConfig: config,
      libraries,
      preferredLibraryKeys: targetLibraries.map((item) => item.key),
      forcedLibraryKeys: targetLibraries.map((item) => item.key),
    });
    return {
      ok: true,
      action: 'documents.import-local',
      summary: `Imported ${ingestResult.summary.successCount}/${ingestResult.summary.total} local files into the dataset base.`,
      data: {
        uploadedFiles: ingestResult.uploadedFiles,
        summary: ingestResult.summary,
        metrics: ingestResult.metrics,
        confirmedLibraryKeys: ingestResult.confirmedLibraryKeys,
        ingestItems: ingestResult.ingestItems,
      },
    };
  }

  if (subcommand === 'sync-status') {
    const status = await readOpenClawMemorySyncStatus();
    return {
      ok: true,
      action: 'documents.sync-status',
      summary: `Memory sync status: ${status.status}.`,
      data: status as unknown as Record<string, unknown>,
    };
  }

  if (subcommand === 'detail') {
    const id = String(flags.id || '').trim();
    if (!id) throw new Error('Missing --id for documents detail.');
    const payload = await loadDocumentDetailPayload(id, { includeSourceAvailability: true });
    if (!payload) throw new Error(`Document "${id}" was not found.`);
    return {
      ok: true,
      action: 'documents.detail',
      summary: `Loaded detail for document "${id}".`,
      data: payload,
    };
  }

  if (subcommand === 'reparse') {
    const ids = [
      ...splitFlagList(flags.ids),
      ...splitFlagList(flags.id),
    ];
    if (!ids.length) throw new Error('Missing --id or --ids for documents reparse.');
    const result = await runDocumentReparseAction(ids);
    return {
      ok: true,
      action: 'documents.reparse',
      summary: `Reparse completed: matched=${result.matchedCount}, succeeded=${result.succeededCount}, failed=${result.failedCount}.`,
      data: result,
    };
  }

  if (subcommand === 'organize') {
    const result = await runDocumentOrganizeAction();
    return {
      ok: true,
      action: 'documents.organize',
      summary: `Auto-grouping completed for ${result.organizedCount} documents.`,
      data: result,
    };
  }

  if (subcommand === 'recluster-ungrouped') {
    const result = await runReclusterUngroupedAction();
    return {
      ok: true,
      action: 'documents.recluster-ungrouped',
      summary: `Reclustered ${result.processedCount} ungrouped documents.`,
      data: result,
    };
  }

  if (subcommand === 'deep-parse') {
    const result = await runDocumentDeepParseAction(flags.limit);
    return {
      ok: true,
      action: 'documents.deep-parse',
      summary: `Detailed parse batch completed.`,
      data: result as Record<string, unknown>,
    };
  }

  if (subcommand === 'canonical-backfill') {
    const result = await runDocumentCanonicalBackfillAction(flags.limit, resolveBooleanFlag(flags.run));
    return {
      ok: true,
      action: 'documents.canonical-backfill',
      summary: result.runImmediately
        ? `Queued ${result.queuedCount}/${result.matchedCount} canonical backfill candidates and ran one detailed-parse batch.`
        : `Queued ${result.queuedCount}/${result.matchedCount} canonical backfill candidates.`,
      data: result as Record<string, unknown>,
    };
  }

  if (subcommand === 'vector-rebuild') {
    const result = await runDocumentVectorRebuildAction();
    return {
      ok: true,
      action: 'documents.vector-rebuild',
      summary: 'Vector rebuild completed.',
      data: result as Record<string, unknown>,
    };
  }

  throw new Error(`Unsupported documents subcommand: ${subcommand}`);
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

async function runDatasourceCommand(subcommand: string, flags: CommandFlags): Promise<PlatformControlResult> {
  if (subcommand === 'credentials') {
    const items = await listDatasourceCredentials();
    return {
      ok: true,
      action: 'datasources.credentials',
      summary: `Loaded ${items.length} datasource credentials.`,
      data: {
        items,
      },
    };
  }

  if (subcommand === 'save-credential') {
    const label = String(flags.label || flags.name || '').trim();
    if (!label) throw new Error('Missing --label for datasources save-credential.');
    const secret = {
      username: String(flags.username || '').trim() || undefined,
      password: String(flags.password || '').trim() || undefined,
      token: String(flags.token || flags['api-key'] || '').trim() || undefined,
      connectionString: String(flags['connection-string'] || '').trim() || undefined,
      cookies: String(flags.cookies || '').trim() || undefined,
      headers: parseHeadersFlag(flags.headers),
    };
    const item = await upsertDatasourceCredential({
      id: String(flags.id || '').trim() || `cred-${Date.now()}`,
      kind: resolveDatasourceCredentialKindFlag(flags.kind),
      label,
      origin: String(flags.origin || '').trim(),
      notes: String(flags.note || flags.notes || '').trim(),
      secret,
    });
    return {
      ok: true,
      action: 'datasources.save-credential',
      summary: `Saved datasource credential "${item.label}".`,
      data: {
        item,
      },
    };
  }

  if (subcommand === 'delete-credential') {
    const id = String(flags.credential || flags.id || '').trim();
    if (!id) throw new Error('Missing --credential for datasources delete-credential.');
    const item = await deleteDatasourceCredential(id);
    if (!item) throw new Error(`Datasource credential "${id}" not found.`);
    return {
      ok: true,
      action: 'datasources.delete-credential',
      summary: `Deleted datasource credential "${item.label}".`,
      data: {
        item,
      },
    };
  }

  if (subcommand === 'create') {
    const name = String(flags.name || '').trim();
    if (!name) throw new Error('Missing --name for datasources create.');
    const kind = resolveDatasourceKindFlag(flags.kind);
    const targetLibraries = await resolveTargetLibrariesFromFlags(flags);
    const authMode = resolveDatasourceAuthModeFlag(flags.auth, kind);
    const credentialId = String(flags.credential || flags['credential-id'] || '').trim();
    const credentialLabel = String(flags['credential-label'] || '').trim();
    const item = await upsertDatasourceDefinition({
      id: String(flags.id || '').trim() || `ds-${Date.now()}`,
      name,
      kind,
      status: resolveDatasourceStatusFlag(flags.status),
      targetLibraries,
      schedule: {
        kind: resolveDatasourceScheduleFlag(flags.schedule),
        timezone: String(flags.timezone || process.env.TZ || 'Asia/Shanghai').trim(),
        maxItemsPerRun: flags['max-items'] !== undefined ? clampLimit(flags['max-items'], 5, 200) : undefined,
      },
      authMode,
      credentialRef: credentialId
        ? {
            id: credentialId,
            kind: authMode,
            label: credentialLabel,
            origin: String(flags.origin || flags.url || '').trim(),
            updatedAt: new Date().toISOString(),
          }
        : null,
      config: buildDatasourceConfigPatch(flags, kind),
      notes: String(flags.note || '').trim(),
    });
    return {
      ok: true,
      action: 'datasources.create',
      summary: `Created datasource "${item.name}".`,
      data: {
        item,
      },
    };
  }

  if (subcommand === 'update') {
    const definition = await resolveDatasourceReference(flags.datasource || flags.id || '');
    const kind = flags.kind !== undefined ? resolveDatasourceKindFlag(flags.kind) : definition.kind;
    const targetLibraries = (flags.library !== undefined || flags.libraries !== undefined)
      ? await resolveTargetLibrariesFromFlags(flags)
      : definition.targetLibraries;
    const authMode = flags.auth !== undefined ? resolveDatasourceAuthModeFlag(flags.auth, kind) : definition.authMode;
    const credentialId = flags.credential !== undefined || flags['credential-id'] !== undefined
      ? String(flags.credential || flags['credential-id'] || '').trim()
      : (definition.credentialRef?.id || '');
    const credentialLabel = flags['credential-label'] !== undefined
      ? String(flags['credential-label'] || '').trim()
      : (definition.credentialRef?.label || '');
    const item = await upsertDatasourceDefinition({
      ...definition,
      name: flags.name !== undefined ? String(flags.name || '').trim() || definition.name : definition.name,
      kind,
      status: flags.status !== undefined ? resolveDatasourceStatusFlag(flags.status) : definition.status,
      targetLibraries,
      schedule: {
        kind: flags.schedule !== undefined ? resolveDatasourceScheduleFlag(flags.schedule) : definition.schedule.kind,
        timezone: flags.timezone !== undefined ? String(flags.timezone || '').trim() : definition.schedule.timezone,
        maxItemsPerRun: flags['max-items'] !== undefined
          ? clampLimit(flags['max-items'], 5, 200)
          : definition.schedule.maxItemsPerRun,
      },
      authMode,
      credentialRef: credentialId
        ? {
            id: credentialId,
            kind: authMode,
            label: credentialLabel,
            origin: String(flags.origin || flags.url || definition.credentialRef?.origin || '').trim(),
            updatedAt: new Date().toISOString(),
          }
        : null,
      config: buildDatasourceConfigPatch(flags, kind, definition.config),
      notes: flags.note !== undefined ? String(flags.note || '').trim() : definition.notes,
    });
    return {
      ok: true,
      action: 'datasources.update',
      summary: `Updated datasource "${item.name}".`,
      data: {
        item,
      },
    };
  }

  if (subcommand === 'delete') {
    const definition = await resolveDatasourceReference(flags.datasource || flags.id || '');
    await deleteDatasourceExecutionArtifacts(definition);
    const item = await deleteDatasourceDefinition(definition.id);
    if (!item) throw new Error(`Datasource "${definition.name}" could not be deleted.`);
    return {
      ok: true,
      action: 'datasources.delete',
      summary: `Deleted datasource "${definition.name}".`,
      data: {
        item,
      },
    };
  }

  if (!subcommand || subcommand === 'list') {
    const definitions = await listDatasourceDefinitions();
    return {
      ok: true,
      action: 'datasources.list',
      summary: `Loaded ${definitions.length} managed datasources.`,
      data: {
        items: definitions.map((item) => ({
          id: item.id,
          name: item.name,
          kind: item.kind,
          status: item.status,
          targetLibraries: item.targetLibraries,
          lastRunAt: item.lastRunAt || '',
          lastStatus: item.lastStatus || '',
        })),
      },
    };
  }

  if (subcommand === 'runs') {
    const libraries = await loadDocumentLibraries();
    const definitions = await listDatasourceDefinitions();
    const datasource = flags.datasource ? await resolveDatasourceReference(flags.datasource) : null;
    const limit = clampLimit(flags.limit, 6, 20);
    const runs = await listDatasourceRuns(datasource?.id);
    const items = buildDatasourceRunReadModels({
      runs: runs.slice(0, limit),
      definitions,
      libraryLabelMap: buildDatasourceLibraryLabelMap(libraries),
      documentSummaryMap: new Map(),
    });
    return {
      ok: true,
      action: 'datasources.runs',
      summary: `Loaded ${items.length} recent datasource runs.`,
      data: {
        datasource: datasource ? { id: datasource.id, name: datasource.name } : null,
        items,
      },
    };
  }

  if (subcommand === 'run-due') {
    const result = await runDueDatasourceDefinitions();
    return {
      ok: true,
      action: 'datasources.run-due',
      summary: result.executedCount
        ? `Ran ${result.executedCount} due datasource definitions.`
        : 'No datasource definitions were due.',
      data: result as unknown as Record<string, unknown>,
    };
  }

  if (subcommand === 'web-tasks') {
    const items = await listWebCaptureTasks();
    return {
      ok: true,
      action: 'datasources.web-tasks',
      summary: `Loaded ${items.length} web capture tasks.`,
      data: {
        items,
      },
    };
  }

  if (subcommand === 'web-run-due') {
    const result = await runDueWebCaptureTasks();
    return {
      ok: true,
      action: 'datasources.web-run-due',
      summary: result.executedCount
        ? `Ran ${result.executedCount} due web capture tasks.`
        : 'No web capture tasks were due.',
      data: result as unknown as Record<string, unknown>,
    };
  }

  if (subcommand === 'delete-run') {
    const runId = String(flags.run || flags.id || '').trim();
    if (!runId) {
      throw new Error('Missing --run for datasources delete-run.');
    }
    const removed = await deleteDatasourceRun(runId);
    if (!removed) {
      throw new Error(`Datasource run "${runId}" not found.`);
    }
    await logDatasourceRunDeletion(removed, 'user');
    return {
      ok: true,
      action: 'datasources.delete-run',
      summary: `Deleted datasource run "${runId}".`,
      data: {
        item: removed,
      },
    };
  }

  if (subcommand === 'capture-url') {
    const url = String(flags.url || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('Missing valid --url for datasources capture-url.');
    }

    const targetLibraries = await resolveTargetLibrariesFromFlags(flags);
    const task = await createAndRunWebCaptureTask({
      url,
      focus: String(flags.focus || '').trim(),
      frequency: 'manual',
      note: String(flags.note || '').trim(),
      maxItems: clampLimit(flags['max-items'], 1, 20),
      keepOriginalFiles: resolveBooleanFlag(flags['keep-original']),
    });
    const definition = await syncWebCaptureTaskToDatasource(task, {
      name: String(flags.name || '').trim() || undefined,
      targetLibraries: targetLibraries.length ? targetLibraries : undefined,
      notes: String(flags.note || '').trim() || undefined,
    });
    const webIngest = task.lastStatus === 'success'
      ? await ingestWebCaptureTaskDocument({
          task,
          targetLibraries: definition.targetLibraries,
        })
      : null;
    const successCount = webIngest?.ingestResult.summary.successCount || 0;
    const failedCount = webIngest?.ingestResult.summary.failedCount || (successCount > 0 ? 0 : (task.lastStatus === 'error' ? 1 : 0));

    return {
      ok: true,
      action: 'datasources.capture-url',
      summary: task.lastStatus === 'success' && successCount > 0
        ? `Captured URL "${url}" and ingested it into ${definition.targetLibraries.map((item) => item.label).join(', ') || 'the target library'}.`
        : `Capture executed for "${url}", but ingestion did not complete successfully.`,
      data: {
        datasource: {
          id: definition.id,
          name: definition.name,
          kind: definition.kind,
          targetLibraries: definition.targetLibraries,
        },
        task,
        ingest: webIngest
          ? {
              ingestPath: webIngest.ingestPath,
              summary: webIngest.ingestResult.summary,
              libraryKeys: webIngest.ingestResult.confirmedLibraryKeys,
            }
          : null,
        captureStatus: task.lastStatus || 'idle',
        captureSummary: task.lastSummary || '',
        successCount,
        failedCount,
      },
    };
  }

  if (subcommand === 'login-capture') {
    const url = String(flags.url || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('Missing valid --url for datasources login-capture.');
    }
    const username = String(flags.username || '').trim();
    const password = String(flags.password || '').trim();
    const remember = resolveBooleanFlag(flags.remember);
    let stored = await loadWebCaptureCredential(url);
    if (!username || !password) {
      if (!stored) {
        throw new Error('Missing login credential. Provide --username and --password, or store one first.');
      }
    } else if (remember) {
      const savedCredential = await saveWebCaptureCredential({ url, username, password });
      stored = {
        id: savedCredential.id,
        origin: savedCredential.origin,
        username,
        password,
        maskedUsername: savedCredential.maskedUsername,
        updatedAt: savedCredential.updatedAt,
        sessionCookies: savedCredential.sessionCookies,
        sessionUpdatedAt: savedCredential.sessionUpdatedAt,
      };
    } else {
      stored = {
        id: '',
        origin: new URL(url).origin.toLowerCase(),
        username,
        password,
        maskedUsername: buildWebCaptureCredentialSummary(url, { maskedUsername: username, origin: new URL(url).origin.toLowerCase() }).maskedUsername || `${username.slice(0, 2)}***`,
        updatedAt: new Date().toISOString(),
        sessionCookies: {},
        sessionUpdatedAt: '',
      };
    }

    const targetLibraries = await resolveTargetLibrariesFromFlags(flags);
    const task = await createAndRunWebCaptureTask({
      url,
      focus: String(flags.focus || '').trim(),
      note: String(flags.note || '').trim(),
      frequency: 'manual',
      maxItems: clampLimit(flags['max-items'], 5, 50),
      auth: stored?.username && stored?.password ? { username: stored.username, password: stored.password } : undefined,
      credentialRef: remember ? (stored?.id || '') : '',
      credentialLabel: stored?.maskedUsername || '',
      keepOriginalFiles: resolveBooleanFlag(flags['keep-original']),
    });
    const definition = await syncWebCaptureTaskToDatasource(task, {
      name: String(flags.name || '').trim() || undefined,
      targetLibraries: targetLibraries.length ? targetLibraries : undefined,
      notes: String(flags.note || '').trim() || undefined,
    });
    const webIngest = task.lastStatus === 'success'
      ? await ingestWebCaptureTaskDocument({
          task,
          targetLibraries: definition.targetLibraries,
        })
      : null;
    const latestStored = remember ? await loadWebCaptureCredential(url) : stored;
    const successCount = webIngest?.ingestResult.summary.successCount || 0;
    const failedCount = webIngest?.ingestResult.summary.failedCount || (successCount > 0 ? 0 : (task.lastStatus === 'error' ? 1 : 0));
    return {
      ok: true,
      action: 'datasources.login-capture',
      summary: task.lastStatus === 'success' && successCount > 0
        ? `Captured authenticated URL "${url}" and ingested it into ${definition.targetLibraries.map((item) => item.label).join(', ') || 'the target library'}.`
        : `Authenticated capture executed for "${url}", but ingestion did not complete successfully.`,
      data: {
        datasource: {
          id: definition.id,
          name: definition.name,
          kind: definition.kind,
          targetLibraries: definition.targetLibraries,
        },
        credentialSummary: buildWebCaptureCredentialSummary(url, latestStored),
        task,
        ingest: webIngest
          ? {
              ingestPath: webIngest.ingestPath,
              summary: webIngest.ingestResult.summary,
              libraryKeys: webIngest.ingestResult.confirmedLibraryKeys,
            }
          : null,
        captureStatus: task.lastStatus || 'idle',
        captureSummary: task.lastSummary || '',
        successCount,
        failedCount,
      },
    };
  }

  const definition = await resolveDatasourceReference(flags.datasource || '');
  if (subcommand === 'run') {
    const result = await runDatasourceDefinition(definition.id);
    return {
      ok: true,
      action: 'datasources.run',
      summary: `Ran datasource "${definition.name}".`,
      data: {
        datasource: { id: definition.id, name: definition.name },
        run: result.run || null,
      },
    };
  }

  if (subcommand === 'pause') {
    const updated = await pauseDatasourceDefinition(definition.id);
    return {
      ok: true,
      action: 'datasources.pause',
      summary: `Paused datasource "${updated.name}".`,
      data: {
        datasource: updated,
      },
    };
  }

  if (subcommand === 'activate') {
    const updated = await activateDatasourceDefinition(definition.id);
    const reloaded = await getDatasourceDefinition(updated.id);
    return {
      ok: true,
      action: 'datasources.activate',
      summary: `Activated datasource "${updated.name}".`,
      data: {
        datasource: reloaded || updated,
      },
    };
  }

  throw new Error(`Unsupported datasources subcommand: ${subcommand}`);
}

async function runReportCommand(subcommand: string, flags: CommandFlags): Promise<PlatformControlResult> {
  if (subcommand === 'templates') {
    const state = await loadReportCenterState();
    const templateType = resolveReportTemplateType(flags.type);
    const limit = clampLimit(flags.limit, 20, 100);
    const items = state.templates
      .filter((item) => !templateType || item.type === templateType)
      .slice(0, limit)
      .map(summarizeReportTemplateItem);

    return {
      ok: true,
      action: 'reports.templates',
      summary: `Loaded ${items.length} reusable report templates${templateType ? ` of type ${templateType}` : ''}.`,
      data: {
        items,
      },
    };
  }

  if (subcommand === 'template-from-document') {
    const documentId = String(flags.document || flags.id || '').trim();
    if (!documentId) throw new Error('Missing --document for reports template-from-document.');

    const document = await resolveDocumentSnapshotItem(documentId);
    const templateType = resolveReportTemplateType(flags.type)
      || inferReportTemplateTypeFromSource({ fileName: document.name });
    const templateLabel = String(flags.label || document.title || document.name || '').trim();
    if (!templateLabel) throw new Error('Template label is required.');

    let createdTemplate: Awaited<ReturnType<typeof createSharedReportTemplate>> | null = null;
    try {
      createdTemplate = await createSharedReportTemplate({
        label: templateLabel,
        type: templateType,
        description: String(flags.description || '').trim()
          || `由数据集文件“${document.title || document.name}”创建的输出模板。`,
        preferredLayoutVariant: resolveReportLayoutVariant(flags.layout),
        isDefault: resolveBooleanFlag(flags.default),
      });
      const reference = await addSharedTemplateReferenceFileFromPath(createdTemplate.key, {
        filePath: document.path,
        originalName: document.name,
      });

      return {
        ok: true,
        action: 'reports.template-from-document',
        summary: `Created reusable template "${createdTemplate.label}" from document "${document.title || document.name}".`,
        data: {
          template: {
            key: createdTemplate.key,
            label: createdTemplate.label,
            type: createdTemplate.type,
            description: createdTemplate.description,
            preferredLayoutVariant: createdTemplate.preferredLayoutVariant || '',
            isDefault: createdTemplate.isDefault === true,
          },
          reference,
          document: summarizeDocumentItem(document),
        },
      };
    } catch (error) {
      if (createdTemplate?.key) {
        await deleteSharedReportTemplate(createdTemplate.key).catch(() => undefined);
      }
      throw error;
    }
  }

  if (subcommand === 'create-template') {
    const templateLabel = String(flags.label || flags.name || '').trim();
    if (!templateLabel) throw new Error('Missing --label for reports create-template.');
    const template = await createSharedReportTemplate({
      label: templateLabel,
      type: resolveReportTemplateType(flags.type),
      description: String(flags.description || '').trim() || undefined,
      preferredLayoutVariant: resolveReportLayoutVariant(flags.layout),
      isDefault: resolveBooleanFlag(flags.default),
    });
    return {
      ok: true,
      action: 'reports.create-template',
      summary: `Created reusable template "${template.label}".`,
      data: {
        template: summarizeReportTemplateItem(template),
      },
    };
  }

  if (subcommand === 'update-template') {
    const templateKey = String(flags.template || flags.key || '').trim();
    if (!templateKey) throw new Error('Missing --template for reports update-template.');
    const patch: { label?: string; description?: string; preferredLayoutVariant?: ReportPlanLayoutVariant; isDefault?: boolean } = {};
    if (flags.label !== undefined) patch.label = String(flags.label || '').trim();
    if (flags.description !== undefined) patch.description = String(flags.description || '').trim();
    if (flags.layout !== undefined) patch.preferredLayoutVariant = resolveReportLayoutVariant(flags.layout);
    if (flags.default !== undefined) patch.isDefault = resolveBooleanFlag(flags.default);
    if (!Object.keys(patch).length) {
      throw new Error('Missing template update fields. Provide --label, --description, --layout, or --default.');
    }
    const template = await updateSharedReportTemplate(templateKey, patch);
    return {
      ok: true,
      action: 'reports.update-template',
      summary: `Updated reusable template "${template.label}".`,
      data: {
        template: summarizeReportTemplateItem(template),
      },
    };
  }

  if (subcommand === 'delete-template') {
    const templateKey = String(flags.template || flags.key || '').trim();
    if (!templateKey) throw new Error('Missing --template for reports delete-template.');
    const template = await deleteSharedReportTemplate(templateKey);
    return {
      ok: true,
      action: 'reports.delete-template',
      summary: `Deleted reusable template "${template.label}".`,
      data: {
        template: summarizeReportTemplateItem(template),
      },
    };
  }

  if (subcommand === 'set-group-template') {
    const library = await resolveLibraryReference(flags.library || flags.group || '');
    const templateKey = String(flags.template || flags.key || '').trim();
    if (!templateKey) throw new Error('Missing --template for reports set-group-template.');
    const result = await updateReportGroupTemplate(library.key, templateKey);
    return {
      ok: true,
      action: 'reports.set-group-template',
      summary: `Set default template for "${result.group.label}" to "${result.template.label}".`,
      data: {
        group: {
          key: result.group.key,
          label: result.group.label,
          defaultTemplateKey: result.group.defaultTemplateKey,
        },
        template: summarizeReportTemplateItem(result.template),
      },
    };
  }

  if (subcommand === 'group-templates') {
    const library = await resolveLibraryReference(flags.library || flags.group || '');
    const state = await loadReportCenterState();
    const group = state.groups.find((item) => item.key === library.key);
    if (!group) throw new Error(`Report group "${library.label}" not found.`);
    const items = (group.templates || []).map((item) => ({
      key: item.key,
      label: item.label,
      description: item.description || '',
      type: item.type,
      isDefault: item.key === group.defaultTemplateKey,
    }));
    return {
      ok: true,
      action: 'reports.group-templates',
      summary: `Loaded ${items.length} group templates for "${group.label}".`,
      data: {
        group: {
          key: group.key,
          label: group.label,
          defaultTemplateKey: group.defaultTemplateKey,
        },
        items,
      },
    };
  }

  if (subcommand === 'template-reference-file') {
    const templateKey = String(flags.template || flags.key || '').trim();
    const filePath = String(flags.path || flags.file || '').trim();
    if (!templateKey) throw new Error('Missing --template for reports template-reference-file.');
    if (!filePath) throw new Error('Missing --path for reports template-reference-file.');
    const reference = await addSharedTemplateReferenceFileFromPath(templateKey, {
      filePath,
      originalName: String(flags.name || flags.label || '').trim() || undefined,
    });
    return {
      ok: true,
      action: 'reports.template-reference-file',
      summary: `Attached file reference "${reference.originalName}" to template "${templateKey}".`,
      data: {
        templateKey,
        reference,
      },
    };
  }

  if (subcommand === 'template-reference-link') {
    const templateKey = String(flags.template || flags.key || '').trim();
    const url = String(flags.url || '').trim();
    if (!templateKey) throw new Error('Missing --template for reports template-reference-link.');
    if (!url) throw new Error('Missing --url for reports template-reference-link.');
    const reference = await addSharedTemplateReferenceLink(templateKey, {
      url,
      label: String(flags.label || flags.name || '').trim() || undefined,
    });
    return {
      ok: true,
      action: 'reports.template-reference-link',
      summary: `Attached link reference to template "${templateKey}".`,
      data: {
        templateKey,
        reference,
      },
    };
  }

  if (!subcommand || subcommand === 'outputs') {
    const state = await loadReportCenterState();
    const scopeLibrary = flags.library ? await resolveLibraryReference(flags.library) : null;
    const limit = clampLimit(flags.limit, 10, 50);
    const items = state.outputs
      .filter((item) => {
        if (!scopeLibrary) return true;
        return item.groupKey === scopeLibrary.key
          || item.groupLabel === scopeLibrary.label
          || (item.libraries || []).some((entry) => entry.key === scopeLibrary.key || entry.label === scopeLibrary.label);
      })
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        title: item.title,
        groupKey: item.groupKey,
        groupLabel: item.groupLabel,
        status: item.status,
        kind: item.kind || '',
        format: item.format || '',
        outputType: item.outputType,
        createdAt: item.createdAt,
        templateLabel: item.templateLabel,
      }));

    return {
      ok: true,
      action: 'reports.outputs',
      summary: `Loaded ${items.length} saved outputs${scopeLibrary ? ` for ${scopeLibrary.label}` : ''}.`,
      data: {
        items,
      },
    };
  }

  if (subcommand === 'generate') {
    const library = await resolveLibraryReference(flags.library || '');
    const outputKind = resolveOutputKind(flags.format || flags.kind || '');
    const timeRange = String(flags['time-range'] || '').trim();
    const focus = String(flags.focus || '').trim();
    const templateKey = String(flags.template || '').trim();
    const request = buildTemplateOutputRequest({
      libraryLabel: library.label,
      outputKind,
      timeRange,
      focus,
      templateKey,
      request: String(flags.request || '').trim(),
    });

    const result = await executeKnowledgeOutput({
      prompt: request,
      confirmedRequest: request,
      preferredLibraries: [{ key: library.key, label: library.label }],
      preferredTemplateKey: templateKey,
      timeRange,
      contentFocus: focus,
      chatHistory: [],
    });

    const savedReport = await persistChatOutputIfNeeded({
      prompt: request,
      output: result.output,
      libraries: result.libraries,
      reportTemplate: result.reportTemplate || null,
    });

    return {
      ok: true,
      action: 'reports.generate',
      summary: `Generated a ${formatOutputKindLabel(outputKind)} from library "${library.label}".`,
      data: {
        library: { key: library.key, label: library.label },
        output: result.output,
        reportTemplate: result.reportTemplate || null,
        savedReport: savedReport || null,
      },
    };
  }

  if (subcommand === 'revise') {
    const outputId = String(flags.output || flags.id || '').trim();
    const instruction = String(flags.instruction || '').trim();
    if (!outputId) throw new Error('Missing --output for reports revise.');
    if (!instruction) throw new Error('Missing --instruction for reports revise.');

    const item = await reviseReportOutput(outputId, instruction);
    return {
      ok: true,
      action: 'reports.revise',
      summary: `Revised output "${item.title}".`,
      data: {
        item,
      },
    };
  }

  if (subcommand === 'revise-draft-module') {
    const outputId = String(flags.output || flags.id || '').trim();
    const moduleId = String(flags.module || flags['module-id'] || '').trim();
    const instruction = String(flags.instruction || '').trim();
    if (!outputId) throw new Error('Missing --output for reports revise-draft-module.');
    if (!moduleId) throw new Error('Missing --module for reports revise-draft-module.');
    if (!instruction) throw new Error('Missing --instruction for reports revise-draft-module.');

    const item = await reviseReportOutputDraftModule(outputId, moduleId, instruction);
    return {
      ok: true,
      action: 'reports.revise-draft-module',
      summary: `Revised module "${moduleId}" for "${item.title}".`,
      data: {
        item,
      },
    };
  }

  if (subcommand === 'revise-draft-structure') {
    const outputId = String(flags.output || flags.id || '').trim();
    const instruction = String(flags.instruction || '').trim();
    if (!outputId) throw new Error('Missing --output for reports revise-draft-structure.');
    if (!instruction) throw new Error('Missing --instruction for reports revise-draft-structure.');

    const item = await reviseReportOutputDraftStructure(outputId, instruction);
    return {
      ok: true,
      action: 'reports.revise-draft-structure',
      summary: `Updated draft structure for "${item.title}".`,
      data: {
        item,
      },
    };
  }

  if (subcommand === 'revise-draft-copy') {
    const outputId = String(flags.output || flags.id || '').trim();
    const instruction = String(flags.instruction || '').trim();
    if (!outputId) throw new Error('Missing --output for reports revise-draft-copy.');
    if (!instruction) throw new Error('Missing --instruction for reports revise-draft-copy.');

    const item = await reviseReportOutputDraftCopy(outputId, instruction);
    return {
      ok: true,
      action: 'reports.revise-draft-copy',
      summary: `Updated draft copy for "${item.title}".`,
      data: {
        item,
      },
    };
  }

  if (subcommand === 'finalize-page') {
    const outputId = String(flags.output || flags.id || '').trim();
    if (!outputId) throw new Error('Missing --output for reports finalize-page.');

    const item = await finalizeDraftReportOutput(outputId);
    return {
      ok: true,
      action: 'reports.finalize-page',
      summary: `Finalized static-page draft "${item.title}".`,
      data: {
        item,
      },
    };
  }

  if (subcommand === 'delete-output') {
    const outputId = String(flags.output || flags.id || '').trim();
    if (!outputId) throw new Error('Missing --output for reports delete-output.');
    await deleteReportOutput(outputId);
    return {
      ok: true,
      action: 'reports.delete-output',
      summary: `Deleted output "${outputId}".`,
      data: {
        outputId,
      },
    };
  }

  throw new Error(`Unsupported reports subcommand: ${subcommand}`);
}

async function runModelCommand(subcommand: string, flags: CommandFlags): Promise<PlatformControlResult> {
  if (!subcommand || subcommand === 'status') {
    const state = await loadModelConfigState();
    return {
      ok: true,
      action: 'models.status',
      summary: `Loaded model runtime state${state.currentModel?.label ? ` for ${state.currentModel.label}` : ''}.`,
      data: {
        openclaw: state.openclaw,
        currentModel: state.currentModel || null,
        models: state.availableModels,
        providers: state.providers,
      },
    };
  }

  if (subcommand === 'select') {
    const modelId = String(flags.model || flags.id || '').trim();
    if (!modelId) throw new Error('Missing --model for models select.');
    const state = await updateSelectedModel(modelId);
    return {
      ok: true,
      action: 'models.select',
      summary: `Selected model "${state.currentModel?.label || modelId}".`,
      data: state,
    };
  }

  if (subcommand === 'save-provider') {
    const providerId = String(flags.provider || '').trim() as ModelProviderId;
    const methodId = String(flags.method || '').trim();
    if (!providerId || !methodId) {
      throw new Error('Missing --provider or --method for models save-provider.');
    }
    const state = await saveProviderSettings({
      providerId,
      methodId,
      apiKey: String(flags['api-key'] || ''),
    });
    return {
      ok: true,
      action: 'models.save-provider',
      summary: `Saved provider settings for "${providerId}".`,
      data: state,
    };
  }

  if (subcommand === 'launch-login') {
    const providerId = String(flags.provider || '').trim() as ModelProviderId;
    const methodId = String(flags.method || '').trim();
    if (!providerId || !methodId) {
      throw new Error('Missing --provider or --method for models launch-login.');
    }
    const result = await launchProviderLogin({
      providerId,
      methodId,
    });
    return {
      ok: true,
      action: 'models.launch-login',
      summary: result.message || `Launched login for "${providerId}".`,
      data: result as Record<string, unknown>,
    };
  }

  if (subcommand === 'install-openclaw') {
    const result = await installLatestOpenClaw();
    return {
      ok: true,
      action: 'models.install-openclaw',
      summary: 'OpenClaw installation/update requested.',
      data: result as Record<string, unknown>,
    };
  }

  throw new Error(`Unsupported models subcommand: ${subcommand}`);
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
