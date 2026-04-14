export type PersistedProviderPreference = {
  methodId?: string;
};

export type PersistedModelConfig = {
  selectedModelId?: string;
  providerPreferences?: Record<string, PersistedProviderPreference>;
};

export type ProviderFamilyId = 'openai' | 'github-copilot' | 'minimax' | 'moonshot' | 'zai';
export type ProviderMethodKind = 'browserLogin' | 'apiKey';
export type OpenClawConfigSource = 'wsl' | 'direct' | 'none';

export type ModelOption = {
  id: string;
  label: string;
  provider: string;
  familyId: ProviderFamilyId | 'openclaw';
  source: 'openclaw' | 'catalog';
  configured: boolean;
};

export type ProviderMethodDescriptor = {
  id: string;
  label: string;
  description: string;
  kind: ProviderMethodKind;
  providerId: string;
  openclawMethod: string;
};

export type ProviderMethodState = ProviderMethodDescriptor & {
  selected: boolean;
};

export type ProviderState = {
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

export type OpenClawRuntimeInfo = {
  installed: boolean;
  running: boolean;
  installMode: OpenClawConfigSource;
  installedVersion?: string;
  gatewayUrl?: string;
  availableModels: ModelOption[];
  defaultModelId?: string;
  providers: ProviderState[];
};

export type OpenClawConfig = {
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

export type SaveProviderInput = {
  providerId: ProviderFamilyId;
  methodId: string;
  apiKey?: string;
};

export type LaunchProviderLoginInput = {
  providerId: ProviderFamilyId;
  methodId: string;
};

export type ProviderFamilyDescriptor = {
  id: ProviderFamilyId;
  label: string;
  description: string;
  methods: ProviderMethodDescriptor[];
  models: Array<{ id: string; label: string }>;
};

export const PROVIDER_FAMILIES: ProviderFamilyDescriptor[] = [
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

export function prettifyProviderLabel(providerId: string) {
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

export function inferFamilyFromModelId(modelId: string): ProviderFamilyId | 'openclaw' {
  const prefix = String(modelId || '').split('/', 1)[0];
  if (prefix === 'openai-codex' || prefix === 'openai') return 'openai';
  if (prefix === 'github-copilot') return 'github-copilot';
  if (prefix === 'minimax' || prefix === 'minimax-cn' || prefix === 'minimax-portal') return 'minimax';
  if (prefix === 'moonshot') return 'moonshot';
  if (prefix === 'zai') return 'zai';
  return 'openclaw';
}

export function getModelLabel(modelId: string) {
  return modelId.includes('/') ? modelId.split('/').slice(1).join('/') : modelId;
}
