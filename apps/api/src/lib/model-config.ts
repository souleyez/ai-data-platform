import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { STORAGE_CONFIG_DIR, TOOLS_DIR } from './paths.js';

const execFileAsync = promisify(execFile);

const STORAGE_DIR = STORAGE_CONFIG_DIR;
const MODEL_CONFIG_FILE = path.join(STORAGE_DIR, 'model-config.json');
const WINDOWS_OPENCLAW_CONFIG_FILE = path.join(os.homedir(), '.openclaw-autoclaw', 'openclaw.json');
const WSL_OPENCLAW_CONFIG_PATH = '~/.openclaw/openclaw.json';
const WSL_CONFIG_READ_TIMEOUT_MS = 2500;
const WSL_RUNTIME_META_TIMEOUT_MS = 3000;

type PersistedProviderPreference = {
  methodId?: string;
};

type PersistedModelConfig = {
  selectedModelId?: string;
  providerPreferences?: Record<string, PersistedProviderPreference>;
};

type ProviderFamilyId = 'openai' | 'github-copilot' | 'minimax' | 'moonshot' | 'zai';
type ProviderMethodKind = 'browserLogin' | 'apiKey';

type ModelOption = {
  id: string;
  label: string;
  provider: string;
  familyId: ProviderFamilyId | 'openclaw';
  source: 'openclaw' | 'catalog';
  configured: boolean;
};

type ProviderMethodDescriptor = {
  id: string;
  label: string;
  description: string;
  kind: ProviderMethodKind;
  providerId: string;
  openclawMethod: string;
};

type ProviderMethodState = ProviderMethodDescriptor & {
  selected: boolean;
};

type ProviderState = {
  id: ProviderFamilyId;
  label: string;
  description: string;
  configured: boolean;
  configuredMethodId: string | null;
  statusText: string;
  models: Array<{ id: string; label: string }>;
  methods: ProviderMethodState[];
  webSearchConfigured?: boolean;
};

type OpenClawRuntimeInfo = {
  installed: boolean;
  running: boolean;
  installMode: 'wsl' | 'direct' | 'none';
  installedVersion?: string;
  gatewayUrl?: string;
  availableModels: ModelOption[];
  defaultModelId?: string;
  providers: ProviderState[];
};

type OpenClawConfig = {
  auth?: {
    profiles?: Record<string, { provider?: string; mode?: string }>;
    order?: Record<string, string[]>;
  };
  agents?: {
    defaults?: {
      model?: {
        primary?: string;
        fallbacks?: string[];
      };
      models?: Record<string, Record<string, unknown>>;
    };
  };
  models?: {
    mode?: string;
    providers?: Record<string, Record<string, unknown>>;
  };
  tools?: {
    web?: {
      search?: Record<string, unknown>;
    };
  };
  plugins?: {
    entries?: Record<string, { enabled?: boolean; config?: Record<string, unknown> }>;
  };
  gateway?: {
    http?: {
      endpoints?: Record<string, Record<string, unknown>>;
    };
  };
  [key: string]: unknown;
};

type SaveProviderInput = {
  providerId: ProviderFamilyId;
  methodId: string;
  apiKey?: string;
};

type LaunchProviderLoginInput = {
  providerId: ProviderFamilyId;
  methodId: string;
};

type ProviderFamilyDescriptor = {
  id: ProviderFamilyId;
  label: string;
  description: string;
  methods: ProviderMethodDescriptor[];
  models: Array<{ id: string; label: string }>;
};

const PROVIDER_FAMILIES: ProviderFamilyDescriptor[] = [
  {
    id: 'openai',
    label: 'OpenAI Codex',
    description: '使用 ChatGPT OAuth 登录后，把 OpenAI Codex 模型接入当前系统。',
    methods: [
      {
        id: 'oauth',
        label: '网页登录',
        description: '打开交互窗口，用 OpenAI 账号登录。',
        kind: 'browserLogin',
        providerId: 'openai-codex',
        openclawMethod: 'oauth',
      },
    ],
    models: [
      { id: 'openai-codex/gpt-5.4', label: 'GPT-5.4' },
      { id: 'openai-codex/gpt-5.4-mini', label: 'GPT-5.4 Mini' },
    ],
  },
  {
    id: 'github-copilot',
    label: 'GitHub Copilot',
    description: '通过 GitHub 设备码登录，把 Copilot 提供的模型接入当前系统。',
    methods: [
      {
        id: 'device',
        label: '设备码登录',
        description: '打开终端窗口，用 GitHub 账号完成 Copilot 登录。',
        kind: 'browserLogin',
        providerId: 'github-copilot',
        openclawMethod: 'device',
      },
    ],
    models: [
      { id: 'github-copilot/gpt-5.4', label: 'GPT-5.4' },
      { id: 'github-copilot/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
      { id: 'github-copilot/gpt-4o', label: 'GPT-4o' },
    ],
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    description: '支持 CN / Global 的 API Key 或 OAuth 登录，模型接入后直接写入系统配置。',
    methods: [
      {
        id: 'oauth',
        label: 'OAuth 登录（Global）',
        description: '在新窗口完成 MiniMax Global OAuth。',
        kind: 'browserLogin',
        providerId: 'minimax-portal',
        openclawMethod: 'oauth',
      },
      {
        id: 'oauth-cn',
        label: 'OAuth 登录（CN）',
        description: '在新窗口完成 MiniMax CN OAuth。',
        kind: 'browserLogin',
        providerId: 'minimax-portal',
        openclawMethod: 'oauth-cn',
      },
      {
        id: 'api-global',
        label: 'API Key（Global）',
        description: '写入 api.minimax.io 的 API Key。',
        kind: 'apiKey',
        providerId: 'minimax',
        openclawMethod: 'api-global',
      },
      {
        id: 'api-cn',
        label: 'API Key（CN）',
        description: '写入 api.minimaxi.com 的 API Key。',
        kind: 'apiKey',
        providerId: 'minimax',
        openclawMethod: 'api-cn',
      },
    ],
    models: [
      { id: 'minimax/MiniMax-M2.7', label: 'MiniMax M2.7' },
      { id: 'minimax/MiniMax-M2.5', label: 'MiniMax M2.5' },
      { id: 'minimax/MiniMax-M2.5-highspeed', label: 'MiniMax M2.5 Highspeed' },
      { id: 'minimax-cn/MiniMax-M2.7', label: 'MiniMax M2.7（CN）' },
      { id: 'minimax-cn/MiniMax-M2.5', label: 'MiniMax M2.5（CN）' },
      { id: 'minimax-cn/MiniMax-M2.5-highspeed', label: 'MiniMax M2.5 Highspeed（CN）' },
    ],
  },
  {
    id: 'moonshot',
    label: 'Moonshot / Kimi',
    description: '配置 Kimi 模型 API Key，并同时同步 Kimi 搜索配置。',
    methods: [
      {
        id: 'api-key',
        label: 'API Key（.ai）',
        description: '使用 api.moonshot.ai 的 API Key。',
        kind: 'apiKey',
        providerId: 'moonshot',
        openclawMethod: 'api-key',
      },
      {
        id: 'api-key-cn',
        label: 'API Key（.cn）',
        description: '使用 api.moonshot.cn 的 API Key。',
        kind: 'apiKey',
        providerId: 'moonshot',
        openclawMethod: 'api-key-cn',
      },
    ],
    models: [
      { id: 'moonshot/kimi-k2.5', label: 'Kimi K2.5' },
      { id: 'moonshot/kimi-k2-turbo', label: 'Kimi K2.5 Turbo' },
      { id: 'moonshot/kimi-k2-thinking', label: 'Kimi K2.5 Thinking' },
      { id: 'moonshot/kimi-k2-thinking-turbo', label: 'Kimi K2.5 Thinking Turbo' },
    ],
  },
  {
    id: 'zai',
    label: 'Z.AI / GLM',
    description: '支持 Global / CN / Coding-Plan 多种 GLM 端点，直接配置给当前系统。',
    methods: [
      {
        id: 'global',
        label: 'API Key（Global）',
        description: 'api.z.ai 标准 GLM 端点。',
        kind: 'apiKey',
        providerId: 'zai',
        openclawMethod: 'global',
      },
      {
        id: 'cn',
        label: 'API Key（CN）',
        description: 'open.bigmodel.cn 标准 GLM 端点。',
        kind: 'apiKey',
        providerId: 'zai',
        openclawMethod: 'cn',
      },
      {
        id: 'coding-global',
        label: 'Coding Plan（Global）',
        description: 'api.z.ai 的 Coding Plan 端点。',
        kind: 'apiKey',
        providerId: 'zai',
        openclawMethod: 'coding-global',
      },
      {
        id: 'coding-cn',
        label: 'Coding Plan（CN）',
        description: 'open.bigmodel.cn 的 Coding Plan 端点。',
        kind: 'apiKey',
        providerId: 'zai',
        openclawMethod: 'coding-cn',
      },
    ],
    models: [
      { id: 'zai/glm-5', label: 'GLM-5' },
      { id: 'zai/glm-5-turbo', label: 'GLM-5 Turbo' },
      { id: 'zai/glm-4.7', label: 'GLM-4.7' },
      { id: 'zai/glm-4.7-flash', label: 'GLM-4.7 Flash' },
      { id: 'zai/glm-4.7-flashx', label: 'GLM-4.7 FlashX' },
      { id: 'zai/glm-4.5', label: 'GLM-4.5' },
    ],
  },
];

function env(name: string, fallback?: string) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function getWslDistro() {
  return env('OPENCLAW_WSL_DISTRO', 'Ubuntu-24.04') || 'Ubuntu-24.04';
}

function buildGatewayUrl() {
  return env('OPENCLAW_GATEWAY_URL', 'http://127.0.0.1:18789') || 'http://127.0.0.1:18789';
}

function prettifyProviderLabel(providerId: string) {
  const map: Record<string, string> = {
    openai: 'OpenAI',
    'openai-codex': 'OpenAI Codex',
    'github-copilot': 'GitHub Copilot',
    minimax: 'MiniMax',
    'minimax-cn': 'MiniMax CN',
    'minimax-portal': 'MiniMax',
    moonshot: 'Moonshot / Kimi',
    zai: 'Z.AI / GLM',
    openclaw: '系统默认',
  };
  return map[providerId] || providerId;
}

function inferFamilyFromModelId(modelId: string): ProviderFamilyId | 'openclaw' {
  const prefix = String(modelId || '').split('/', 1)[0];
  if (prefix === 'openai-codex' || prefix === 'openai') return 'openai';
  if (prefix === 'github-copilot') return 'github-copilot';
  if (prefix === 'minimax' || prefix === 'minimax-cn' || prefix === 'minimax-portal') return 'minimax';
  if (prefix === 'moonshot') return 'moonshot';
  if (prefix === 'zai') return 'zai';
  return 'openclaw';
}

function getModelLabel(modelId: string) {
  return modelId.includes('/') ? modelId.split('/').slice(1).join('/') : modelId;
}

async function ensureStorageDir() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
}

async function readPersistedModelConfig(): Promise<PersistedModelConfig> {
  try {
    const raw = await fs.readFile(MODEL_CONFIG_FILE, 'utf8');
    return JSON.parse(raw) as PersistedModelConfig;
  } catch {
    return {};
  }
}

async function writePersistedModelConfig(payload: PersistedModelConfig) {
  await ensureStorageDir();
  await fs.writeFile(MODEL_CONFIG_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

function runCommand(file: string, args: string[], input = '') {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(file, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || `${file} exited with code ${code}`));
    });

    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

async function readJsonFile(filePath: string) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return JSON.parse(text) as OpenClawConfig;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, data: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function readWslConfig() {
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

async function writeWslConfig(data: OpenClawConfig) {
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

function ensureConfigShape(config: OpenClawConfig | null | undefined): OpenClawConfig {
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

function ensureDuckDuckGoSearchPreference(config: OpenClawConfig) {
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

function migrateLegacyKimiSearchConfig(config: OpenClawConfig) {
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
    moonshotEntry.config && typeof moonshotEntry.config === 'object' ? { ...moonshotEntry.config } : {};
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

async function loadCanonicalOpenClawConfig() {
  if (process.platform === 'win32') {
    const wslConfig = await readWslConfig();
    if (wslConfig) {
      const migrated = migrateLegacyKimiSearchConfig(wslConfig);
      if (migrated.changed) {
        await writeWslConfig(migrated.config);
      }
      return { config: migrated.config, source: 'wsl' as const };
    }

    const localConfig = await readJsonFile(WINDOWS_OPENCLAW_CONFIG_FILE);
    if (localConfig) {
      return { config: ensureConfigShape(localConfig), source: 'direct' as const };
    }

    return { config: null, source: 'none' as const };
  }

  const directPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  const directConfig = await readJsonFile(directPath);
  if (!directConfig) {
    return { config: null, source: 'none' as const };
  }

  const migrated = migrateLegacyKimiSearchConfig(directConfig);
  if (migrated.changed) {
    await writeJsonFile(directPath, migrated.config);
  }
  return { config: migrated.config, source: 'direct' as const };
}

async function writeCanonicalOpenClawConfig(config: OpenClawConfig, source: 'wsl' | 'direct' | 'none') {
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

function getConfiguredAuthProfiles(config: OpenClawConfig | null | undefined) {
  const profiles = config?.auth?.profiles;
  return profiles && typeof profiles === 'object' ? profiles : {};
}

function getConfiguredProviders(config: OpenClawConfig | null | undefined) {
  const providers = config?.models?.providers;
  return providers && typeof providers === 'object' ? providers : {};
}

function hasMoonshotWebSearch(config: OpenClawConfig | null | undefined) {
  const searchProvider = String(config?.tools?.web?.search?.provider || '').trim();
  const moonshotWebSearch = config?.plugins?.entries?.moonshot?.config?.webSearch as Record<string, unknown> | undefined;
  return searchProvider === 'kimi' && Boolean(moonshotWebSearch?.apiKey);
}

function detectConfiguredMethodId(
  family: ProviderFamilyDescriptor,
  config: OpenClawConfig | null | undefined,
  persisted: PersistedModelConfig,
) {
  const preferredMethodId = persisted.providerPreferences?.[family.id]?.methodId;
  if (preferredMethodId && family.methods.some((item) => item.id === preferredMethodId)) {
    return preferredMethodId;
  }

  const providers = getConfiguredProviders(config);
  const authProfiles = Object.values(getConfiguredAuthProfiles(config));

  if (family.id === 'openai') {
    return authProfiles.some((item) => item?.provider === 'openai-codex') ? 'oauth' : null;
  }

  if (family.id === 'github-copilot') {
    return authProfiles.some((item) => item?.provider === 'github-copilot') ? 'device' : null;
  }

  if (family.id === 'minimax') {
    if (providers['minimax-cn']) return 'api-cn';
    if (providers.minimax) return 'api-global';
    const hasCnAuth = authProfiles.some((item) => String(item?.provider || '').startsWith('minimax') && String(item?.mode || '').includes('cn'));
    if (hasCnAuth) return 'oauth-cn';
    const hasAuth = authProfiles.some((item) => String(item?.provider || '').startsWith('minimax'));
    return hasAuth ? 'oauth' : null;
  }

  if (family.id === 'moonshot') {
    const provider = providers.moonshot as Record<string, unknown> | undefined;
    if (!provider) return null;
    return String(provider.baseUrl || '').includes('.cn') ? 'api-key-cn' : 'api-key';
  }

  if (family.id === 'zai') {
    const provider = providers.zai as Record<string, unknown> | undefined;
    if (!provider) return null;
    const baseUrl = String(provider.baseUrl || '');
    if (baseUrl.includes('/coding/') && baseUrl.includes('open.bigmodel.cn')) return 'coding-cn';
    if (baseUrl.includes('/coding/')) return 'coding-global';
    if (baseUrl.includes('open.bigmodel.cn')) return 'cn';
    if (baseUrl.includes('api.z.ai')) return 'global';
    return 'global';
  }

  return null;
}

function isFamilyConfigured(family: ProviderFamilyDescriptor, config: OpenClawConfig | null | undefined, methodId: string | null) {
  if (family.id === 'moonshot') {
    return Boolean(methodId || hasMoonshotWebSearch(config));
  }
  return Boolean(methodId);
}

function getProviderStatusText(
  family: ProviderFamilyDescriptor,
  configured: boolean,
  configuredMethodId: string | null,
  config: OpenClawConfig | null | undefined,
) {
  if (!configured) return '未配置';

  const method = family.methods.find((item) => item.id === configuredMethodId);
  if (family.id === 'moonshot') {
    const search = hasMoonshotWebSearch(config) ? '，Kimi 搜索已同步' : '';
    return method ? `已配置：${method.label}${search}` : `已配置${search}`;
  }

  return method ? `已配置：${method.label}` : '已配置';
}

function collectConfiguredCatalogModels(family: ProviderFamilyDescriptor, configuredMethodId: string | null) {
  if (!configuredMethodId) return [];

  if (family.id === 'minimax') {
    const useCn = configuredMethodId === 'api-cn' || configuredMethodId === 'oauth-cn';
    return family.models.filter((item) => (useCn ? item.id.startsWith('minimax-cn/') : item.id.startsWith('minimax/')));
  }

  return family.models;
}

function buildProviderStates(config: OpenClawConfig | null | undefined, persisted: PersistedModelConfig) {
  return PROVIDER_FAMILIES.map((family) => {
    const configuredMethodId = detectConfiguredMethodId(family, config, persisted);
    const configured = isFamilyConfigured(family, config, configuredMethodId);
    const methods: ProviderMethodState[] = family.methods.map((method) => ({
      ...method,
      selected: method.id === configuredMethodId || (!configuredMethodId && method.id === family.methods[0]?.id),
    }));

    return {
      id: family.id,
      label: family.label,
      description: family.description,
      configured,
      configuredMethodId,
      statusText: getProviderStatusText(family, configured, configuredMethodId, config),
      models: family.models,
      methods,
      webSearchConfigured: family.id === 'moonshot' ? hasMoonshotWebSearch(config) : undefined,
    } satisfies ProviderState;
  });
}

function buildAvailableModels(config: OpenClawConfig | null | undefined, providers: ProviderState[]) {
  const available = new Map<string, ModelOption>();
  const declaredProviders = getConfiguredProviders(config);
  const modelDefaults = config?.agents?.defaults?.model;
  const configuredMethods = new Map(providers.map((item) => [item.id, item.configuredMethodId]));

  const pushModel = (modelId: string, source: 'openclaw' | 'catalog', configured = true) => {
    const normalized = String(modelId || '').trim();
    if (!normalized || available.has(normalized)) return;
    const familyId = inferFamilyFromModelId(normalized);
    const providerKey = normalized.includes('/') ? normalized.split('/', 1)[0] : 'openclaw';
    available.set(normalized, {
      id: normalized,
      label: getModelLabel(normalized),
      provider: prettifyProviderLabel(providerKey),
      familyId,
      source,
      configured,
    });
  };

  pushModel(String(modelDefaults?.primary || '').trim(), 'openclaw');
  for (const item of Array.isArray(modelDefaults?.fallbacks) ? modelDefaults?.fallbacks : []) {
    pushModel(String(item || '').trim(), 'openclaw');
  }

  for (const [providerKey, providerConfig] of Object.entries(declaredProviders)) {
    const providerModels = Array.isArray((providerConfig as Record<string, unknown>)?.models)
      ? ((providerConfig as Record<string, unknown>).models as Array<Record<string, unknown>>)
      : [];
    for (const model of providerModels) {
      const modelId = String(model?.id || model?.name || '').trim();
      if (!modelId) continue;
      pushModel(`${providerKey}/${modelId}`, 'openclaw');
    }
  }

  for (const family of PROVIDER_FAMILIES) {
    const catalogModels = collectConfiguredCatalogModels(family, configuredMethods.get(family.id) || null);
    for (const model of catalogModels) {
      pushModel(model.id, 'catalog');
    }
  }

  return Array.from(available.values()).sort((a, b) => {
    const familyCompare = a.familyId.localeCompare(b.familyId);
    if (familyCompare !== 0) return familyCompare;
    return a.label.localeCompare(b.label);
  });
}

async function isGatewayReachable(url: string) {
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(1200),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function loadWslRuntimeMeta() {
  const distro = getWslDistro();
  try {
    const [{ stdout: versionStdout }, { stdout: statusStdout }] = await Promise.all([
      execFileAsync('wsl.exe', ['-d', distro, '--', 'bash', '-lc', 'openclaw --version 2>/dev/null || true'], {
        windowsHide: true,
        timeout: WSL_RUNTIME_META_TIMEOUT_MS,
      }),
      execFileAsync(
        'wsl.exe',
        ['-d', distro, '--', 'bash', '-lc', 'systemctl --user is-active openclaw-gateway.service 2>/dev/null || true'],
        {
          windowsHide: true,
          timeout: WSL_RUNTIME_META_TIMEOUT_MS,
        },
      ),
    ]);

    return {
      installed: Boolean(versionStdout.trim()),
      installedVersion: versionStdout.trim() || undefined,
      running: statusStdout.trim() === 'active',
    };
  } catch {
    return {
      installed: false,
      running: false,
      installedVersion: undefined,
    };
  }
}

function loadDirectRuntimeMeta(config: OpenClawConfig | null | undefined) {
  return {
    installed: Boolean(config),
    running: Boolean(config),
    installedVersion: undefined,
  };
}

async function loadOpenClawRuntimeInfo(): Promise<OpenClawRuntimeInfo> {
  const persisted = await readPersistedModelConfig();
  const { config, source } = await loadCanonicalOpenClawConfig();
  const normalizedConfig = config ? ensureConfigShape(config) : null;
  const providers = buildProviderStates(normalizedConfig, persisted);
  const availableModels = buildAvailableModels(normalizedConfig, providers);
  const runtimeMeta =
    process.platform === 'win32' && source === 'wsl'
      ? await loadWslRuntimeMeta()
      : loadDirectRuntimeMeta(normalizedConfig);

  return {
    installed: runtimeMeta.installed || Boolean(normalizedConfig),
    running: runtimeMeta.running,
    installMode: source === 'wsl' ? 'wsl' : source === 'direct' ? 'direct' : 'none',
    installedVersion: runtimeMeta.installedVersion,
    gatewayUrl: buildGatewayUrl(),
    defaultModelId: normalizedConfig?.agents?.defaults?.model?.primary || undefined,
    availableModels,
    providers,
  };
}

async function loadPersistedAndRuntime() {
  const [persisted, runtime] = await Promise.all([readPersistedModelConfig(), loadOpenClawRuntimeInfo()]);
  return { persisted, runtime };
}

export async function getActiveOpenClawModel() {
  const { persisted, runtime } = await loadPersistedAndRuntime();
  const selectedModelId = persisted.selectedModelId;
  const availableIds = new Set(runtime.availableModels.map((item) => item.id));

  if (selectedModelId && availableIds.has(selectedModelId)) {
    return selectedModelId;
  }

  return runtime.defaultModelId || env('OPENCLAW_MODEL') || `openclaw:${env('OPENCLAW_AGENT_ID', 'main') || 'main'}`;
}

export async function loadModelConfigState() {
  const [persisted, runtime] = await Promise.all([readPersistedModelConfig(), loadOpenClawRuntimeInfo()]);
  const gatewayUrl = runtime.gatewayUrl || buildGatewayUrl();
  const gatewayReachable = await isGatewayReachable(gatewayUrl);
  const activeModelId = await getActiveOpenClawModel();
  const currentModel = runtime.availableModels.find((item) => item.id === activeModelId) || runtime.availableModels[0] || null;

  return {
    openclaw: {
      installed: runtime.installed,
      running: runtime.running || gatewayReachable,
      installMode: runtime.installMode,
      installedVersion: runtime.installedVersion || null,
      gatewayUrl,
      needsInstall: !runtime.installed,
      usesDevBridge: process.platform === 'win32',
    },
    currentModel: currentModel
      ? {
          id: currentModel.id,
          label: currentModel.label,
          provider: currentModel.provider,
          source: persisted.selectedModelId ? 'project' : 'openclaw-default',
        }
      : null,
    availableModels: runtime.availableModels,
    providers: runtime.providers,
  };
}

export async function ensureNativeSearchPreferredConfig() {
  const { config, source } = await loadCanonicalOpenClawConfig();
  const preferred = ensureDuckDuckGoSearchPreference(config || {});
  if (preferred.changed || source === 'none') {
    await writeCanonicalOpenClawConfig(preferred.config, source);
  }

  return {
    provider: 'duckduckgo' as const,
    previousProvider: preferred.previousProvider,
    changed: preferred.changed || source === 'none',
    state: await loadModelConfigState(),
  };
}

async function updateCanonicalPrimaryModel(modelId: string) {
  const [{ config, source }, persisted] = await Promise.all([loadCanonicalOpenClawConfig(), readPersistedModelConfig()]);
  const normalizedConfig = ensureConfigShape(config);
  const providers = buildProviderStates(normalizedConfig, persisted);
  const availableModels = buildAvailableModels(normalizedConfig, providers);

  if (!availableModels.some((item) => item.id === modelId)) {
    throw new Error(`未找到可用模型：${modelId}`);
  }

  const defaults = normalizedConfig.agents!.defaults!;
  const modelDefaults = defaults.model!;
  const previousPrimary = String(modelDefaults.primary || '').trim();
  const existingFallbacks = Array.isArray(modelDefaults.fallbacks) ? [...modelDefaults.fallbacks] : [];
  const nextFallbacks = existingFallbacks.filter((item) => String(item || '').trim() && item !== modelId);

  if (previousPrimary && previousPrimary !== modelId && !nextFallbacks.includes(previousPrimary)) {
    nextFallbacks.unshift(previousPrimary);
  }

  modelDefaults.primary = modelId;
  modelDefaults.fallbacks = nextFallbacks;
  defaults.models = defaults.models || {};
  defaults.models[modelId] = defaults.models[modelId] || {};

  await writeCanonicalOpenClawConfig(normalizedConfig, source);
  await writePersistedModelConfig({
    ...persisted,
    selectedModelId: modelId,
  });
}

export async function updateSelectedModel(modelId: string) {
  await updateCanonicalPrimaryModel(modelId);
  return loadModelConfigState();
}

function applyMiniMaxProviderConfig(config: OpenClawConfig, methodId: string, apiKey: string) {
  const providers = config.models!.providers!;
  const isCn = methodId === 'api-cn';
  const providerKey = isCn ? 'minimax-cn' : 'minimax';
  providers[providerKey] = {
    baseUrl: isCn ? 'https://api.minimaxi.com/anthropic' : 'https://api.minimax.io/anthropic',
    api: 'anthropic-messages',
    authHeader: true,
    apiKey,
    models: [
      { id: 'MiniMax-M2.7', name: 'MiniMax M2.7', reasoning: true, input: ['text'], contextWindow: 200000, maxTokens: 8192 },
      { id: 'MiniMax-M2.5', name: 'MiniMax M2.5', reasoning: true, input: ['text'], contextWindow: 200000, maxTokens: 8192 },
      { id: 'MiniMax-M2.5-highspeed', name: 'MiniMax M2.5 Highspeed', reasoning: true, input: ['text'], contextWindow: 200000, maxTokens: 8192 },
    ],
  };
}

function applyMoonshotProviderConfig(config: OpenClawConfig, methodId: string, apiKey: string) {
  config.models!.providers!.moonshot = {
    baseUrl: methodId === 'api-key-cn' ? 'https://api.moonshot.cn/v1' : 'https://api.moonshot.ai/v1',
    api: 'openai-completions',
    apiKey,
    models: [
      { id: 'kimi-k2.5', name: 'Kimi K2.5', reasoning: true, input: ['text'], contextWindow: 256000, maxTokens: 32768 },
      { id: 'kimi-k2-turbo', name: 'Kimi K2.5 Turbo', reasoning: false, input: ['text'], contextWindow: 256000, maxTokens: 32768 },
      { id: 'kimi-k2-thinking', name: 'Kimi K2.5 Thinking', reasoning: true, input: ['text'], contextWindow: 256000, maxTokens: 32768 },
      { id: 'kimi-k2-thinking-turbo', name: 'Kimi K2.5 Thinking Turbo', reasoning: true, input: ['text'], contextWindow: 256000, maxTokens: 32768 },
    ],
  };

  config.tools!.web!.search = {
    ...(config.tools?.web?.search || {}),
    enabled: true,
    provider: 'kimi',
  };
  config.plugins!.entries = config.plugins!.entries || {};
  const moonshotEntry = config.plugins!.entries.moonshot || {};
  const moonshotConfig = moonshotEntry.config && typeof moonshotEntry.config === 'object' ? { ...moonshotEntry.config } : {};
  moonshotConfig.webSearch = {
    ...(moonshotConfig.webSearch && typeof moonshotConfig.webSearch === 'object'
      ? (moonshotConfig.webSearch as Record<string, unknown>)
      : {}),
    apiKey,
  };
  config.plugins!.entries.moonshot = {
    ...moonshotEntry,
    enabled: true,
    config: moonshotConfig,
  };
}

function applyZaiProviderConfig(config: OpenClawConfig, methodId: string, apiKey: string) {
  const baseUrlMap: Record<string, string> = {
    global: 'https://api.z.ai/api/paas/v4',
    cn: 'https://open.bigmodel.cn/api/paas/v4',
    'coding-global': 'https://api.z.ai/api/coding/paas/v4',
    'coding-cn': 'https://open.bigmodel.cn/api/coding/paas/v4',
  };

  config.models!.providers!.zai = {
    baseUrl: baseUrlMap[methodId] || baseUrlMap.global,
    api: 'openai-completions',
    apiKey,
    models: [
      { id: 'glm-5', name: 'GLM-5', reasoning: true, input: ['text'], contextWindow: 256000, maxTokens: 65536 },
      { id: 'glm-5-turbo', name: 'GLM-5 Turbo', reasoning: true, input: ['text'], contextWindow: 256000, maxTokens: 65536 },
      { id: 'glm-4.7', name: 'GLM-4.7', reasoning: true, input: ['text'], contextWindow: 256000, maxTokens: 65536 },
      { id: 'glm-4.7-flash', name: 'GLM-4.7 Flash', reasoning: false, input: ['text'], contextWindow: 128000, maxTokens: 32768 },
      { id: 'glm-4.7-flashx', name: 'GLM-4.7 FlashX', reasoning: false, input: ['text'], contextWindow: 128000, maxTokens: 32768 },
      { id: 'glm-4.5', name: 'GLM-4.5', reasoning: true, input: ['text'], contextWindow: 128000, maxTokens: 32768 },
    ],
  };
}

function getDefaultModelForMethod(providerId: ProviderFamilyId, methodId: string) {
  if (providerId === 'openai') return 'openai-codex/gpt-5.4';
  if (providerId === 'github-copilot') return 'github-copilot/gpt-5.4';
  if (providerId === 'minimax') return methodId === 'api-cn' || methodId === 'oauth-cn' ? 'minimax-cn/MiniMax-M2.7' : 'minimax/MiniMax-M2.7';
  if (providerId === 'moonshot') return 'moonshot/kimi-k2.5';
  if (providerId === 'zai') return 'zai/glm-5';
  return '';
}

async function rememberProviderMethod(providerId: ProviderFamilyId, methodId: string) {
  const persisted = await readPersistedModelConfig();
  const providerPreferences = {
    ...(persisted.providerPreferences || {}),
    [providerId]: { methodId },
  };
  await writePersistedModelConfig({
    ...persisted,
    providerPreferences,
  });
}

export async function saveProviderSettings(input: SaveProviderInput) {
  const provider = PROVIDER_FAMILIES.find((item) => item.id === input.providerId);
  if (!provider) {
    throw new Error(`不支持的模型供应商：${input.providerId}`);
  }

  const method = provider.methods.find((item) => item.id === input.methodId);
  if (!method) {
    throw new Error(`不支持的配置方式：${input.methodId}`);
  }
  if (method.kind !== 'apiKey') {
    throw new Error('该配置方式需要通过网页登录，不支持直接保存密钥。');
  }

  const apiKey = String(input.apiKey || '').trim();
  if (!apiKey) {
    throw new Error('请输入有效的 API Key。');
  }

  const { config, source } = await loadCanonicalOpenClawConfig();
  const normalizedConfig = ensureConfigShape(config);

  if (provider.id === 'minimax') {
    applyMiniMaxProviderConfig(normalizedConfig, method.id, apiKey);
  } else if (provider.id === 'moonshot') {
    applyMoonshotProviderConfig(normalizedConfig, method.id, apiKey);
  } else if (provider.id === 'zai') {
    applyZaiProviderConfig(normalizedConfig, method.id, apiKey);
  } else {
    throw new Error('该供应商当前只支持网页登录，不支持直接写入密钥。');
  }

  const defaultModelId = getDefaultModelForMethod(provider.id, method.id);
  if (!normalizedConfig.agents!.defaults!.model!.primary && defaultModelId) {
    normalizedConfig.agents!.defaults!.model!.primary = defaultModelId;
  }
  normalizedConfig.agents!.defaults!.models = normalizedConfig.agents!.defaults!.models || {};
  if (defaultModelId && !normalizedConfig.agents!.defaults!.models![defaultModelId]) {
    normalizedConfig.agents!.defaults!.models![defaultModelId] = {};
  }

  await writeCanonicalOpenClawConfig(normalizedConfig, source);
  await rememberProviderMethod(provider.id, method.id);

  return loadModelConfigState();
}

export async function launchProviderLogin(input: LaunchProviderLoginInput) {
  if (process.platform !== 'win32') {
    throw new Error('网页登录拉起目前只支持 Windows 开发机。');
  }

  const provider = PROVIDER_FAMILIES.find((item) => item.id === input.providerId);
  if (!provider) {
    throw new Error(`不支持的模型供应商：${input.providerId}`);
  }
  const method = provider.methods.find((item) => item.id === input.methodId);
  if (!method) {
    throw new Error(`不支持的登录方式：${input.methodId}`);
  }
  if (method.kind !== 'browserLogin') {
    throw new Error('该方式不需要网页登录，请直接保存 API Key。');
  }

  const { config, source } = await loadCanonicalOpenClawConfig();
  if (config) {
    const migrated = migrateLegacyKimiSearchConfig(config);
    await writeCanonicalOpenClawConfig(migrated.config, source);
  }

  const scriptPath = path.join(TOOLS_DIR, 'openclaw-auth-login.ps1');
  await execFileAsync(
    'powershell.exe',
    [
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-Provider',
      method.providerId,
      '-Method',
      method.openclawMethod,
      '-Distro',
      getWslDistro(),
    ],
    {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  );

  await rememberProviderMethod(provider.id, method.id);

  return {
    status: 'login_started',
    message: `已为 ${provider.label} 打开登录窗口，请在新终端完成授权后回到页面刷新状态。`,
    state: await loadModelConfigState(),
  };
}

export async function installLatestOpenClaw() {
  if (process.platform !== 'win32') {
    throw new Error('当前安装脚本仅支持 Windows + WSL 开发环境。');
  }

  const scriptPath = path.join(TOOLS_DIR, 'install-openclaw-latest.ps1');
  const { stdout } = await execFileAsync('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });

  return {
    status: 'installed',
    output: stdout.trim(),
    state: await loadModelConfigState(),
  };
}
