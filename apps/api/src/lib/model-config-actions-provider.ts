import {
  ensureConfigShape,
  loadCanonicalOpenClawConfig,
  writeCanonicalOpenClawConfig,
} from './model-config-openclaw.js';
import { loadModelConfigState } from './model-config-runtime.js';
import {
  PROVIDER_FAMILIES,
  type SaveProviderInput,
} from './model-config-types.js';
import {
  applyMiniMaxProviderConfig,
  applyMoonshotProviderConfig,
  applyZaiProviderConfig,
  getDefaultModelForMethod,
  rememberProviderMethod,
} from './model-config-actions-support.js';

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
