import { logDatasourceRunDeletion } from './datasource-audit.js';
import {
  deleteDatasourceCredential,
  listDatasourceCredentials,
  upsertDatasourceCredential,
  type DatasourceCredentialKind,
} from './datasource-credentials.js';
import {
  deleteDatasourceDefinition,
  deleteDatasourceRun,
  getDatasourceDefinition,
  listDatasourceDefinitions,
  listDatasourceRuns,
  upsertDatasourceDefinition,
  type DatasourceDefinition,
} from './datasource-definitions.js';
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
import { loadDocumentLibraries } from './document-libraries.js';
import { createAndRunWebCaptureTask, listWebCaptureTasks, runDueWebCaptureTasks } from './web-capture.js';
import {
  buildWebCaptureCredentialSummary,
  loadWebCaptureCredential,
  saveWebCaptureCredential,
} from './web-capture-credentials.js';

type CommandFlags = Record<string, string>;

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
  if (normalized === 'local_directory') return 'local_directory';
  if (normalized === 'web' || normalized === 'public_web') return 'web_public';
  if (normalized === 'web_login' || normalized === 'login_web') return 'web_login';
  if (normalized === 'web_discovery' || normalized === 'discovery_web') return 'web_discovery';
  if (normalized === 'upload' || normalized === 'public_upload') return 'upload_public';
  if (normalized === 'local' || normalized === 'directory' || normalized === 'folder') return 'local_directory';
  if (normalized === 'database') return 'database';
  if (normalized === 'erp') return 'erp';
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
  if (normalized === 'manual') return 'manual';
  if (normalized === 'daily') return 'daily';
  if (normalized === 'weekly') return 'weekly';
  throw new Error(`Unsupported datasource schedule "${value}".`);
}

function resolveDatasourceAuthModeFlag(value: string | undefined, kind: DatasourceDefinition['kind']): DatasourceDefinition['authMode'] {
  if (kind === 'local_directory') return 'none';
  const normalized = normalizeText(value || '');
  if (!normalized) return 'none';
  if (normalized === 'none') return 'none';
  if (normalized === 'credential' || normalized === 'login') return 'credential';
  if (normalized === 'manual_session' || normalized === 'session') return 'manual_session';
  if (normalized === 'database_password' || normalized === 'database') return 'database_password';
  if (normalized === 'api_token' || normalized === 'token') return 'api_token';
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
  if (flags.path !== undefined) nextConfig.path = String(flags.path || '').trim();
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

function scoreLibraryMatch(reference: string, library: { key: string; label: string; description?: string }) {
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

async function resolveTargetLibrariesFromFlags(flags: CommandFlags) {
  const requested = [...splitFlagList(flags.library), ...splitFlagList(flags.libraries)];
  if (!requested.length) return [];
  const dedup = new Map<string, { key: string; label: string; mode: 'primary' | 'secondary' }>();
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

export async function runDatasourceCommand(subcommand: string, flags: CommandFlags): Promise<PlatformControlResult> {
  if (subcommand === 'credentials') {
    const items = await listDatasourceCredentials();
    return { ok: true, action: 'datasources.credentials', summary: `Loaded ${items.length} datasource credentials.`, data: { items } };
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
    return { ok: true, action: 'datasources.save-credential', summary: `Saved datasource credential "${item.label}".`, data: { item } };
  }
  if (subcommand === 'delete-credential') {
    const id = String(flags.credential || flags.id || '').trim();
    if (!id) throw new Error('Missing --credential for datasources delete-credential.');
    const item = await deleteDatasourceCredential(id);
    if (!item) throw new Error(`Datasource credential "${id}" not found.`);
    return { ok: true, action: 'datasources.delete-credential', summary: `Deleted datasource credential "${item.label}".`, data: { item } };
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
      credentialRef: credentialId ? { id: credentialId, kind: authMode, label: credentialLabel, origin: String(flags.origin || flags.url || '').trim(), updatedAt: new Date().toISOString() } : null,
      config: buildDatasourceConfigPatch(flags, kind),
      notes: String(flags.note || '').trim(),
    });
    return { ok: true, action: 'datasources.create', summary: `Created datasource "${item.name}".`, data: { item } };
  }
  if (subcommand === 'update') {
    const definition = await resolveDatasourceReference(flags.datasource || flags.id || '');
    const kind = flags.kind !== undefined ? resolveDatasourceKindFlag(flags.kind) : definition.kind;
    const targetLibraries = (flags.library !== undefined || flags.libraries !== undefined) ? await resolveTargetLibrariesFromFlags(flags) : definition.targetLibraries;
    const authMode = flags.auth !== undefined ? resolveDatasourceAuthModeFlag(flags.auth, kind) : definition.authMode;
    const credentialId = flags.credential !== undefined || flags['credential-id'] !== undefined ? String(flags.credential || flags['credential-id'] || '').trim() : (definition.credentialRef?.id || '');
    const credentialLabel = flags['credential-label'] !== undefined ? String(flags['credential-label'] || '').trim() : (definition.credentialRef?.label || '');
    const item = await upsertDatasourceDefinition({
      ...definition,
      name: flags.name !== undefined ? String(flags.name || '').trim() || definition.name : definition.name,
      kind,
      status: flags.status !== undefined ? resolveDatasourceStatusFlag(flags.status) : definition.status,
      targetLibraries,
      schedule: {
        kind: flags.schedule !== undefined ? resolveDatasourceScheduleFlag(flags.schedule) : definition.schedule.kind,
        timezone: flags.timezone !== undefined ? String(flags.timezone || '').trim() : definition.schedule.timezone,
        maxItemsPerRun: flags['max-items'] !== undefined ? clampLimit(flags['max-items'], 5, 200) : definition.schedule.maxItemsPerRun,
      },
      authMode,
      credentialRef: credentialId ? { id: credentialId, kind: authMode, label: credentialLabel, origin: String(flags.origin || flags.url || definition.credentialRef?.origin || '').trim(), updatedAt: new Date().toISOString() } : null,
      config: buildDatasourceConfigPatch(flags, kind, definition.config),
      notes: flags.note !== undefined ? String(flags.note || '').trim() : definition.notes,
    });
    return { ok: true, action: 'datasources.update', summary: `Updated datasource "${item.name}".`, data: { item } };
  }
  if (subcommand === 'delete') {
    const definition = await resolveDatasourceReference(flags.datasource || flags.id || '');
    await deleteDatasourceExecutionArtifacts(definition);
    const item = await deleteDatasourceDefinition(definition.id);
    if (!item) throw new Error(`Datasource "${definition.name}" could not be deleted.`);
    return { ok: true, action: 'datasources.delete', summary: `Deleted datasource "${definition.name}".`, data: { item } };
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
    return { ok: true, action: 'datasources.runs', summary: `Loaded ${items.length} recent datasource runs.`, data: { datasource: datasource ? { id: datasource.id, name: datasource.name } : null, items } };
  }
  if (subcommand === 'run-due') {
    const result = await runDueDatasourceDefinitions();
    return { ok: true, action: 'datasources.run-due', summary: result.executedCount ? `Ran ${result.executedCount} due datasource definitions.` : 'No datasource definitions were due.', data: result as unknown as Record<string, unknown> };
  }
  if (subcommand === 'web-tasks') {
    const items = await listWebCaptureTasks();
    return { ok: true, action: 'datasources.web-tasks', summary: `Loaded ${items.length} web capture tasks.`, data: { items } };
  }
  if (subcommand === 'web-run-due') {
    const result = await runDueWebCaptureTasks();
    return { ok: true, action: 'datasources.web-run-due', summary: result.executedCount ? `Ran ${result.executedCount} due web capture tasks.` : 'No web capture tasks were due.', data: result as unknown as Record<string, unknown> };
  }
  if (subcommand === 'delete-run') {
    const runId = String(flags.run || flags.id || '').trim();
    if (!runId) throw new Error('Missing --run for datasources delete-run.');
    const removed = await deleteDatasourceRun(runId);
    if (!removed) throw new Error(`Datasource run "${runId}" not found.`);
    await logDatasourceRunDeletion(removed, 'user');
    return { ok: true, action: 'datasources.delete-run', summary: `Deleted datasource run "${runId}".`, data: { item: removed } };
  }
  if (subcommand === 'capture-url') {
    const url = String(flags.url || '').trim();
    if (!/^https?:\/\//i.test(url)) throw new Error('Missing valid --url for datasources capture-url.');
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
    const webIngest = task.lastStatus === 'success' ? await ingestWebCaptureTaskDocument({ task, targetLibraries: definition.targetLibraries }) : null;
    const successCount = webIngest?.ingestResult.summary.successCount || 0;
    const failedCount = webIngest?.ingestResult.summary.failedCount || (successCount > 0 ? 0 : (task.lastStatus === 'error' ? 1 : 0));
    return {
      ok: true,
      action: 'datasources.capture-url',
      summary: task.lastStatus === 'success' && successCount > 0
        ? `Captured URL "${url}" and ingested it into ${definition.targetLibraries.map((item) => item.label).join(', ') || 'the target library'}.`
        : `Capture executed for "${url}", but ingestion did not complete successfully.`,
      data: {
        datasource: { id: definition.id, name: definition.name, kind: definition.kind, targetLibraries: definition.targetLibraries },
        task,
        ingest: webIngest ? { ingestPath: webIngest.ingestPath, summary: webIngest.ingestResult.summary, libraryKeys: webIngest.ingestResult.confirmedLibraryKeys } : null,
        captureStatus: task.lastStatus || 'idle',
        captureSummary: task.lastSummary || '',
        successCount,
        failedCount,
      },
    };
  }
  if (subcommand === 'login-capture') {
    const url = String(flags.url || '').trim();
    if (!/^https?:\/\//i.test(url)) throw new Error('Missing valid --url for datasources login-capture.');
    const username = String(flags.username || '').trim();
    const password = String(flags.password || '').trim();
    const remember = resolveBooleanFlag(flags.remember);
    let stored = await loadWebCaptureCredential(url);
    if (!username || !password) {
      if (!stored) throw new Error('Missing login credential. Provide --username and --password, or store one first.');
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
    const webIngest = task.lastStatus === 'success' ? await ingestWebCaptureTaskDocument({ task, targetLibraries: definition.targetLibraries }) : null;
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
        datasource: { id: definition.id, name: definition.name, kind: definition.kind, targetLibraries: definition.targetLibraries },
        credentialSummary: buildWebCaptureCredentialSummary(url, latestStored),
        task,
        ingest: webIngest ? { ingestPath: webIngest.ingestPath, summary: webIngest.ingestResult.summary, libraryKeys: webIngest.ingestResult.confirmedLibraryKeys } : null,
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
    return { ok: true, action: 'datasources.run', summary: `Ran datasource "${definition.name}".`, data: { datasource: { id: definition.id, name: definition.name }, run: result.run || null } };
  }
  if (subcommand === 'pause') {
    const updated = await pauseDatasourceDefinition(definition.id);
    return { ok: true, action: 'datasources.pause', summary: `Paused datasource "${updated.name}".`, data: { datasource: updated } };
  }
  if (subcommand === 'activate') {
    const updated = await activateDatasourceDefinition(definition.id);
    const reloaded = await getDatasourceDefinition(updated.id);
    return { ok: true, action: 'datasources.activate', summary: `Activated datasource "${updated.name}".`, data: { datasource: reloaded || updated } };
  }
  throw new Error(`Unsupported datasources subcommand: ${subcommand}`);
}
