import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  ensureConfigShape,
  ensureDuckDuckGoSearchPreference,
  getWslDistro,
  loadCanonicalOpenClawConfig,
  migrateLegacyKimiSearchConfig,
  writeCanonicalOpenClawConfig,
} from './model-config-openclaw.js';
import { loadModelConfigState } from './model-config-runtime.js';
import {
  WINDOWS_OPENCLAW_CONFIG_FILE,
  readJsonFile,
  readPersistedModelConfig,
  writeJsonFile,
  writePersistedModelConfig,
} from './model-config-storage.js';
import { TOOLS_DIR } from './paths.js';
import {
  PROVIDER_FAMILIES,
  type LaunchProviderLoginInput,
  type OpenClawConfig,
  type ProviderFamilyId,
  type SaveProviderInput,
} from './model-config-types.js';

const execFileAsync = promisify(execFile);

async function updateCanonicalPrimaryModel(modelId: string) {
  const [{ config, source }, persisted] = await Promise.all([loadCanonicalOpenClawConfig(), readPersistedModelConfig()]);
  const normalizedConfig = ensureConfigShape(config);
  const providers = normalizedConfig.models?.providers && typeof normalizedConfig.models.providers === 'object'
    ? normalizedConfig.models.providers
    : {};
  const availableModels = new Set<string>();
  const primary = String(normalizedConfig.agents?.defaults?.model?.primary || '').trim();
  if (primary) availableModels.add(primary);
  for (const item of Array.isArray(normalizedConfig.agents?.defaults?.model?.fallbacks)
    ? normalizedConfig.agents?.defaults?.model?.fallbacks
    : []) {
    const normalized = String(item || '').trim();
    if (normalized) availableModels.add(normalized);
  }
  for (const [providerKey, providerConfig] of Object.entries(providers)) {
    const providerModels = Array.isArray((providerConfig as Record<string, unknown>)?.models)
      ? ((providerConfig as Record<string, unknown>).models as Array<Record<string, unknown>>)
      : [];
    for (const model of providerModels) {
      const modelIdValue = String(model?.id || model?.name || '').trim();
      if (modelIdValue) availableModels.add(`${providerKey}/${modelIdValue}`);
    }
  }
  for (const family of PROVIDER_FAMILIES) {
    for (const model of family.models) availableModels.add(model.id);
  }

  if (!availableModels.has(modelId)) {
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

export async function ensureAllowedOpenClawModel(modelId: string) {
  const normalizedModelId = String(modelId || '').trim();
  if (!normalizedModelId) return false;

  let changed = false;
  const { config, source } = await loadCanonicalOpenClawConfig();
  const normalizedConfig = ensureConfigShape(config);
  const defaults = normalizedConfig.agents!.defaults!;
  defaults.models = defaults.models || {};

  if (!defaults.models[normalizedModelId]) {
    defaults.models[normalizedModelId] = {};
    await writeCanonicalOpenClawConfig(normalizedConfig, source);
    changed = true;
  }

  if (process.platform === 'win32') {
    const localRuntimeConfig = ensureConfigShape(await readJsonFile(WINDOWS_OPENCLAW_CONFIG_FILE));
    const localDefaults = localRuntimeConfig.agents!.defaults!;
    localDefaults.models = localDefaults.models || {};
    if (!localDefaults.models[normalizedModelId]) {
      localDefaults.models[normalizedModelId] = {};
      await writeJsonFile(WINDOWS_OPENCLAW_CONFIG_FILE, localRuntimeConfig);
      changed = true;
    }
  }

  return changed;
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
