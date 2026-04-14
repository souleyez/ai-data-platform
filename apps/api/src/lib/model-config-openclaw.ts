import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  WINDOWS_OPENCLAW_CONFIG_FILE,
  WSL_CONFIG_READ_TIMEOUT_MS,
  WSL_OPENCLAW_CONFIG_PATH,
  env,
  readJsonFile,
  runCommand,
  writeJsonFile,
} from './model-config-storage.js';
import type { OpenClawConfig, OpenClawConfigSource } from './model-config-types.js';

const execFileAsync = promisify(execFile);

export function getWslDistro() {
  return env('OPENCLAW_WSL_DISTRO', 'Ubuntu-24.04') || 'Ubuntu-24.04';
}

export function buildGatewayUrl() {
  return env('OPENCLAW_GATEWAY_URL', 'http://127.0.0.1:18789') || 'http://127.0.0.1:18789';
}

export async function readWslConfig() {
  const distro = getWslDistro();
  try {
    const { stdout } = await execFileAsync(
      'wsl.exe',
      [
        '-d',
        distro,
        '--',
        'python3',
        '-c',
        [
          'import pathlib, sys',
          `path = pathlib.Path(${JSON.stringify(WSL_OPENCLAW_CONFIG_PATH)}).expanduser()`,
          'if not path.exists():',
          "    sys.stdout.write('{}')",
          'else:',
          "    sys.stdout.write(path.read_text(encoding='utf-8'))",
        ].join('\n'),
      ],
      {
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
        timeout: WSL_CONFIG_READ_TIMEOUT_MS,
      },
    );
    return JSON.parse(String(stdout || '{}').trim() || '{}') as OpenClawConfig;
  } catch {
    return null;
  }
}

export async function writeWslConfig(data: OpenClawConfig) {
  const distro = getWslDistro();
  await runCommand(
    'wsl.exe',
    [
      '-d',
      distro,
      '--',
      'python3',
      '-c',
      [
        'import pathlib, sys',
        `path = pathlib.Path(${JSON.stringify(WSL_OPENCLAW_CONFIG_PATH)}).expanduser()`,
        'path.parent.mkdir(parents=True, exist_ok=True)',
        "path.write_text(sys.stdin.read(), encoding='utf-8')",
      ].join('\n'),
    ],
    JSON.stringify(data, null, 2),
  );
}

export function ensureConfigShape(config: OpenClawConfig | null | undefined): OpenClawConfig {
  const next = config && typeof config === 'object' ? { ...config } : {};
  next.auth = next.auth && typeof next.auth === 'object' ? { ...next.auth } : {};
  next.auth.profiles = next.auth.profiles && typeof next.auth.profiles === 'object' ? { ...next.auth.profiles } : {};
  next.auth.order = next.auth.order && typeof next.auth.order === 'object' ? { ...next.auth.order } : {};
  next.agents = next.agents && typeof next.agents === 'object' ? { ...next.agents } : {};
  next.agents.defaults = next.agents.defaults && typeof next.agents.defaults === 'object' ? { ...next.agents.defaults } : {};
  next.agents.defaults.model =
    next.agents.defaults.model && typeof next.agents.defaults.model === 'object'
      ? { ...next.agents.defaults.model }
      : {};
  next.agents.defaults.model.fallbacks = Array.isArray(next.agents.defaults.model.fallbacks)
    ? [...(next.agents.defaults.model.fallbacks as string[])]
    : [];
  next.agents.defaults.models =
    next.agents.defaults.models && typeof next.agents.defaults.models === 'object'
      ? { ...next.agents.defaults.models }
      : {};
  next.models = next.models && typeof next.models === 'object' ? { ...next.models } : {};
  next.models.providers =
    next.models.providers && typeof next.models.providers === 'object' ? { ...next.models.providers } : {};
  next.tools = next.tools && typeof next.tools === 'object' ? { ...next.tools } : {};
  next.tools.web = next.tools.web && typeof next.tools.web === 'object' ? { ...next.tools.web } : {};
  next.tools.web.search =
    next.tools.web.search && typeof next.tools.web.search === 'object' ? { ...next.tools.web.search } : {};
  next.plugins = next.plugins && typeof next.plugins === 'object' ? { ...next.plugins } : {};
  next.plugins.entries =
    next.plugins.entries && typeof next.plugins.entries === 'object' ? { ...next.plugins.entries } : {};
  next.gateway = next.gateway && typeof next.gateway === 'object' ? { ...next.gateway } : {};
  next.gateway.http = next.gateway.http && typeof next.gateway.http === 'object' ? { ...next.gateway.http } : {};
  next.gateway.http.endpoints =
    next.gateway.http.endpoints && typeof next.gateway.http.endpoints === 'object'
      ? { ...next.gateway.http.endpoints }
      : {};
  next.gateway.http.endpoints.responses =
    next.gateway.http.endpoints.responses && typeof next.gateway.http.endpoints.responses === 'object'
      ? { ...next.gateway.http.endpoints.responses }
      : {};
  return next;
}

export function ensureDuckDuckGoSearchPreference(config: OpenClawConfig) {
  const next = ensureConfigShape(config);
  const previousProvider = String(next.tools?.web?.search?.provider || '').trim() || null;
  const previousDuckEnabled = next.plugins?.entries?.duckduckgo?.enabled === true;
  const previousResponsesEnabled = next.gateway?.http?.endpoints?.responses?.enabled === true;
  const searchConfig =
    next.tools?.web?.search && typeof next.tools.web.search === 'object'
      ? { ...(next.tools.web.search as Record<string, unknown>) }
      : {};
  const pluginEntry =
    next.plugins?.entries?.duckduckgo && typeof next.plugins.entries.duckduckgo === 'object'
      ? { ...next.plugins.entries.duckduckgo }
      : {};
  const pluginConfig =
    pluginEntry.config && typeof pluginEntry.config === 'object'
      ? { ...pluginEntry.config }
      : {};
  const endpointConfig =
    next.gateway?.http?.endpoints?.responses && typeof next.gateway.http.endpoints.responses === 'object'
      ? { ...next.gateway.http.endpoints.responses }
      : {};

  searchConfig.enabled = true;
  searchConfig.provider = 'duckduckgo';
  pluginEntry.enabled = true;
  pluginEntry.config = pluginConfig;
  endpointConfig.enabled = true;

  next.tools = next.tools || {};
  next.tools.web = next.tools.web || {};
  next.tools.web.search = searchConfig;
  next.plugins = next.plugins || {};
  next.plugins.entries = {
    ...(next.plugins.entries || {}),
    duckduckgo: pluginEntry,
  };
  next.gateway = next.gateway || {};
  next.gateway.http = next.gateway.http || {};
  next.gateway.http.endpoints = {
    ...(next.gateway.http.endpoints || {}),
    responses: endpointConfig,
  };

  const changed =
    previousProvider !== 'duckduckgo'
    || !previousDuckEnabled
    || !previousResponsesEnabled;

  return {
    config: next,
    changed,
    previousProvider,
  };
}

export function migrateLegacyKimiSearchConfig(config: OpenClawConfig) {
  const next = ensureConfigShape(config);
  const search = next.tools?.web?.search as Record<string, unknown>;
  const legacy = search?.kimi && typeof search.kimi === 'object' ? { ...(search.kimi as Record<string, unknown>) } : null;
  if (!legacy) {
    return { config: next, changed: false };
  }

  const moonshotEntry =
    next.plugins?.entries?.moonshot && typeof next.plugins.entries.moonshot === 'object'
      ? { ...next.plugins.entries.moonshot }
      : {};
  const moonshotConfig =
    moonshotEntry.config && typeof moonshotEntry.config === 'object'
      ? { ...moonshotEntry.config }
      : {};
  const webSearch =
    moonshotConfig.webSearch && typeof moonshotConfig.webSearch === 'object'
      ? { ...(moonshotConfig.webSearch as Record<string, unknown>) }
      : {};

  if (legacy.apiKey && !webSearch.apiKey) webSearch.apiKey = legacy.apiKey;
  if (legacy.baseUrl && !webSearch.baseUrl) webSearch.baseUrl = legacy.baseUrl;
  if (legacy.model && !webSearch.model) webSearch.model = legacy.model;

  moonshotConfig.webSearch = webSearch;
  moonshotEntry.enabled = moonshotEntry.enabled !== false;
  moonshotEntry.config = moonshotConfig;
  next.plugins = next.plugins || {};
  next.plugins.entries = {
    ...(next.plugins.entries || {}),
    moonshot: moonshotEntry,
  };

  delete search.kimi;
  next.tools = next.tools || {};
  next.tools.web = next.tools.web || {};
  next.tools.web.search = search;

  return { config: next, changed: true };
}

export async function loadCanonicalOpenClawConfig(): Promise<{ config: OpenClawConfig | null; source: OpenClawConfigSource }> {
  if (process.platform === 'win32') {
    const wslConfig = await readWslConfig();
    if (wslConfig) {
      const migrated = migrateLegacyKimiSearchConfig(wslConfig);
      if (migrated.changed) {
        await writeWslConfig(migrated.config);
      }
      return { config: migrated.config, source: 'wsl' };
    }

    const localConfig = await readJsonFile(WINDOWS_OPENCLAW_CONFIG_FILE);
    if (localConfig) {
      return { config: ensureConfigShape(localConfig), source: 'direct' };
    }

    return { config: null, source: 'none' };
  }

  const directPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  const directConfig = await readJsonFile(directPath);
  if (!directConfig) {
    return { config: null, source: 'none' };
  }

  const migrated = migrateLegacyKimiSearchConfig(directConfig);
  if (migrated.changed) {
    await writeJsonFile(directPath, migrated.config);
  }
  return { config: migrated.config, source: 'direct' };
}

export async function writeCanonicalOpenClawConfig(config: OpenClawConfig, source: OpenClawConfigSource) {
  const normalized = ensureConfigShape(config);
  if (process.platform === 'win32') {
    if (source === 'wsl' || source === 'none') {
      await writeWslConfig(normalized);
      return;
    }
    await writeJsonFile(WINDOWS_OPENCLAW_CONFIG_FILE, normalized);
    return;
  }

  const directPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  await writeJsonFile(directPath, normalized);
}

export function getConfiguredAuthProfiles(config: OpenClawConfig | null | undefined) {
  const profiles = config?.auth?.profiles;
  return profiles && typeof profiles === 'object' ? profiles : {};
}

export function getConfiguredProviders(config: OpenClawConfig | null | undefined) {
  const providers = config?.models?.providers;
  return providers && typeof providers === 'object' ? providers : {};
}

export function hasMoonshotWebSearch(config: OpenClawConfig | null | undefined) {
  const searchProvider = String(config?.tools?.web?.search?.provider || '').trim();
  const moonshotWebSearch = config?.plugins?.entries?.moonshot?.config?.webSearch as Record<string, unknown> | undefined;
  return searchProvider === 'kimi' && Boolean(moonshotWebSearch?.apiKey);
}
