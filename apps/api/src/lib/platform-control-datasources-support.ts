import {
  listDatasourceCredentials,
  type DatasourceCredentialKind,
} from './datasource-credentials.js';
import {
  listDatasourceDefinitions,
  type DatasourceDefinition,
} from './datasource-definitions.js';
import { loadDocumentLibraries } from './document-libraries.js';
import type { CommandFlags } from './platform-control-datasources-types.js';

const DATASOURCE_KIND_ALIASES: Record<string, string[]> = {
  local_directory: ['local directory', 'directory datasource', 'folder datasource'],
  upload_public: ['upload datasource', 'public upload'],
  web_public: ['web datasource', 'public web'],
  web_login: ['login web datasource', 'logged-in web'],
  web_discovery: ['web discovery', 'discovery web datasource'],
  database: ['database datasource', 'database'],
  erp: ['erp', 'business system datasource'],
};

export function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function clampLimit(value: string | undefined, fallback: number, max: number) {
  return Math.max(1, Math.min(max, Number(value || fallback) || fallback));
}

export function splitFlagList(value: string | undefined) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function resolveBooleanFlag(value: string | undefined) {
  const normalized = normalizeText(value || '');
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export function resolveDatasourceKindFlag(value: string | undefined): DatasourceDefinition['kind'] {
  const normalized = normalizeText(value || '').replace(/\s+/g, '_');
  if (!normalized) return 'web_public';
  if (normalized === 'local_directory') return 'local_directory';
  if (normalized === 'web_public' || normalized === 'web' || normalized === 'public_web') return 'web_public';
  if (normalized === 'web_login' || normalized === 'login_web') return 'web_login';
  if (normalized === 'web_discovery' || normalized === 'discovery_web') return 'web_discovery';
  if (normalized === 'upload_public' || normalized === 'upload' || normalized === 'public_upload') return 'upload_public';
  if (normalized === 'local' || normalized === 'directory' || normalized === 'folder') return 'local_directory';
  if (normalized === 'database') return 'database';
  if (normalized === 'erp') return 'erp';
  throw new Error(`Unsupported datasource kind "${value}".`);
}

export function resolveDatasourceStatusFlag(value: string | undefined): DatasourceDefinition['status'] {
  const normalized = normalizeText(value || '');
  if (!normalized) return 'active';
  if (normalized === 'draft') return 'draft';
  if (normalized === 'paused' || normalized === 'pause') return 'paused';
  if (normalized === 'error') return 'error';
  if (normalized === 'active' || normalized === 'enabled') return 'active';
  throw new Error(`Unsupported datasource status "${value}".`);
}

export function resolveDatasourceScheduleFlag(value: string | undefined): DatasourceDefinition['schedule']['kind'] {
  const normalized = normalizeText(value || '');
  if (!normalized) return 'manual';
  if (normalized === 'manual') return 'manual';
  if (normalized === 'daily') return 'daily';
  if (normalized === 'weekly') return 'weekly';
  throw new Error(`Unsupported datasource schedule "${value}".`);
}

export function resolveDatasourceAuthModeFlag(value: string | undefined, kind: DatasourceDefinition['kind']): DatasourceDefinition['authMode'] {
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

export function resolveDatasourceCredentialKindFlag(value: string | undefined): DatasourceCredentialKind {
  const normalized = normalizeText(value || '');
  if (!normalized) return 'credential';
  if (normalized === 'credential' || normalized === 'login') return 'credential';
  if (normalized === 'manual_session' || normalized === 'session') return 'manual_session';
  if (normalized === 'database_password' || normalized === 'database') return 'database_password';
  if (normalized === 'api token' || normalized === 'api_token' || normalized === 'token') return 'api_token';
  throw new Error(`Unsupported datasource credential kind "${value}".`);
}

export function parseHeadersFlag(value: string | undefined) {
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

export function buildDatasourceConfigPatch(
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

export async function resolveLibraryReference(reference: string) {
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

export async function resolveTargetLibrariesFromFlags(flags: CommandFlags) {
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

export async function resolveDatasourceReference(reference: string) {
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
