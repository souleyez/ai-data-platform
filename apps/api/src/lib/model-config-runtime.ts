import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  buildGatewayUrl,
  getConfiguredAuthProfiles,
  getConfiguredProviders,
  getWslDistro,
  hasMoonshotWebSearch,
  loadCanonicalOpenClawConfig,
} from './model-config-openclaw.js';
import { WSL_RUNTIME_META_TIMEOUT_MS, env, readPersistedModelConfig } from './model-config-storage.js';
import {
  PROVIDER_FAMILIES,
  getModelLabel,
  inferFamilyFromModelId,
  prettifyProviderLabel,
  type ModelOption,
  type OpenClawConfig,
  type OpenClawRuntimeInfo,
  type PersistedModelConfig,
  type ProviderFamilyDescriptor,
  type ProviderState,
} from './model-config-types.js';

const execFileAsync = promisify(execFile);

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
    const methods = family.methods.map((method) => ({
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
  const providers = buildProviderStates(config, persisted);
  const availableModels = buildAvailableModels(config, providers);
  const runtimeMeta =
    process.platform === 'win32' && source === 'wsl'
      ? await loadWslRuntimeMeta()
      : loadDirectRuntimeMeta(config);

  return {
    installed: runtimeMeta.installed || Boolean(config),
    running: runtimeMeta.running,
    installMode: source === 'wsl' ? 'wsl' : source === 'direct' ? 'direct' : 'none',
    installedVersion: runtimeMeta.installedVersion,
    gatewayUrl: buildGatewayUrl(),
    defaultModelId: config?.agents?.defaults?.model?.primary || undefined,
    availableModels,
    providers,
  };
}

async function loadPersistedAndRuntime() {
  const [persisted, runtime] = await Promise.all([readPersistedModelConfig(), loadOpenClawRuntimeInfo()]);
  return { persisted, runtime };
}

function resolveActiveOpenClawModelId(
  persisted: PersistedModelConfig,
  runtime: OpenClawRuntimeInfo,
) {
  const selectedModelId = persisted.selectedModelId;
  const availableIds = new Set(runtime.availableModels.map((item) => item.id));

  if (selectedModelId && availableIds.has(selectedModelId)) {
    return selectedModelId;
  }

  return runtime.defaultModelId || env('OPENCLAW_MODEL') || `openclaw:${env('OPENCLAW_AGENT_ID', 'main') || 'main'}`;
}

export async function getActiveOpenClawModel() {
  const { persisted, runtime } = await loadPersistedAndRuntime();
  return resolveActiveOpenClawModelId(persisted, runtime);
}

export async function loadModelConfigState() {
  const [persisted, runtime] = await Promise.all([readPersistedModelConfig(), loadOpenClawRuntimeInfo()]);
  const gatewayUrl = runtime.gatewayUrl || buildGatewayUrl();
  const gatewayReachable = await isGatewayReachable(gatewayUrl);
  const activeModelId = resolveActiveOpenClawModelId(persisted, runtime);
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
