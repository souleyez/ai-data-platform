import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { STORAGE_CONFIG_DIR, TOOLS_DIR } from './paths.js';

const execFileAsync = promisify(execFile);

const STORAGE_DIR = STORAGE_CONFIG_DIR;
const MODEL_CONFIG_FILE = path.join(STORAGE_DIR, 'model-config.json');

type PersistedModelConfig = {
  selectedModelId?: string;
};

type ModelOption = {
  id: string;
  label: string;
  provider: string;
  source: 'openclaw';
};

type OpenClawRuntimeInfo = {
  installed: boolean;
  running: boolean;
  installMode: 'wsl' | 'direct' | 'none';
  installedVersion?: string;
  gatewayUrl?: string;
  availableModels: ModelOption[];
  defaultModelId?: string;
};

function env(name: string, fallback?: string) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
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

function prettifyProviderLabel(providerId: string) {
  const map: Record<string, string> = {
    'openai-codex': 'OpenAI Codex',
    'github-copilot': 'GitHub Copilot',
    'minimax-cn': 'MiniMax',
    minimax: 'MiniMax',
    zai: '智谱 AutoGLM',
    custom: 'Custom OpenAI',
  };
  return map[providerId] || providerId;
}

function buildGatewayUrl() {
  return env('OPENCLAW_GATEWAY_URL', 'http://127.0.0.1:18789') || 'http://127.0.0.1:18789';
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

async function loadWslOpenClawInfo(): Promise<OpenClawRuntimeInfo> {
  const distro = env('OPENCLAW_WSL_DISTRO', 'Ubuntu-24.04') || 'Ubuntu-24.04';
  const pythonScript = [
    'import json, pathlib',
    "path = pathlib.Path.home() / '.openclaw' / 'openclaw.json'",
    "data = json.loads(path.read_text(encoding='utf-8'))",
    "models = []",
    "defaults = data.get('agents', {}).get('defaults', {})",
    "primary = defaults.get('model', {}).get('primary')",
    "fallbacks = defaults.get('model', {}).get('fallbacks', [])",
    "declared = defaults.get('models', {})",
    "all_ids = []",
    "for item in [primary, *fallbacks]:",
    "    if item and item not in all_ids:",
    "        all_ids.append(item)",
    "for model_id in all_ids:",
    "    provider = model_id.split('/', 1)[0] if '/' in model_id else 'openclaw'",
    "    alias = declared.get(model_id, {}).get('alias') if isinstance(declared.get(model_id), dict) else None",
    "    label = model_id.split('/', 1)[1] if '/' in model_id else model_id",
    "    models.append({'id': model_id, 'label': label, 'provider': alias or provider})",
    "print(json.dumps({'defaultModelId': primary, 'models': models}, ensure_ascii=False))",
  ].join('\n');

  try {
    const { stdout: configStdout } = await execFileAsync('wsl.exe', ['-d', distro, '--', 'python3', '-c', pythonScript], {
      windowsHide: true,
    });

    const parsed = JSON.parse(configStdout.trim()) as {
      defaultModelId?: string;
      models?: Array<{ id: string; label: string; provider: string }>;
    };

    const [{ stdout: statusStdout }, { stdout: versionStdout }] = await Promise.all([
      execFileAsync(
        'wsl.exe',
        ['-d', distro, '--', 'bash', '-lc', 'systemctl --user is-active openclaw-gateway.service || true'],
        { windowsHide: true },
      ),
      execFileAsync(
        'wsl.exe',
        [
          '-d',
          distro,
          '--',
          'bash',
          '-lc',
          "grep -o 'OPENCLAW_SERVICE_VERSION=.*' ~/.config/systemd/user/openclaw-gateway.service 2>/dev/null | head -n 1 | cut -d= -f2 || true",
        ],
        { windowsHide: true },
      ),
    ]);

    return {
      installed: true,
      running: statusStdout.trim() === 'active',
      installMode: 'wsl',
      installedVersion: versionStdout.trim() || undefined,
      gatewayUrl: buildGatewayUrl(),
      defaultModelId: parsed.defaultModelId,
      availableModels: (parsed.models || []).map((item) => ({
        id: item.id,
        label: item.label,
        provider: prettifyProviderLabel(item.provider),
        source: 'openclaw' as const,
      })),
    };
  } catch {
    return {
      installed: false,
      running: false,
      installMode: 'wsl',
      gatewayUrl: buildGatewayUrl(),
      availableModels: [],
    };
  }
}

function loadDirectOpenClawInfo(): OpenClawRuntimeInfo {
  const envModel = env('OPENCLAW_MODEL') || env('OPENCLAW_AGENT_ID', 'main') || 'main';
  const modelId = envModel.includes('/') ? envModel : `openclaw:${envModel}`;
  const label = modelId.includes('/') ? modelId.split('/', 2)[1] : modelId.replace(/^openclaw:/, '');
  const providerId = modelId.includes('/') ? modelId.split('/', 1)[0] : 'openclaw';
  const providerLabel = providerId === 'openclaw' ? '云端模型服务' : prettifyProviderLabel(providerId);

  return {
    installed: true,
    running: true,
    installMode: 'direct',
    gatewayUrl: buildGatewayUrl(),
    defaultModelId: modelId,
    availableModels: [
      {
        id: modelId,
        label,
        provider: providerLabel,
        source: 'openclaw',
      },
    ],
  };
}

async function loadOpenClawRuntimeInfo(): Promise<OpenClawRuntimeInfo> {
  if (process.platform === 'win32') {
    const info = await loadWslOpenClawInfo();
    if (info.installed) return info;
  }

  return loadDirectOpenClawInfo();
}

export async function getActiveOpenClawModel() {
  const persisted = await readPersistedModelConfig();
  const runtime = await loadOpenClawRuntimeInfo();
  const selectedModelId = persisted.selectedModelId;
  const availableIds = new Set(runtime.availableModels.map((item) => item.id));

  if (selectedModelId && availableIds.has(selectedModelId)) {
    return selectedModelId;
  }

  return runtime.defaultModelId || env('OPENCLAW_MODEL') || `openclaw:${env('OPENCLAW_AGENT_ID', 'main') || 'main'}`;
}

export async function loadModelConfigState() {
  const persisted = await readPersistedModelConfig();
  const runtime = await loadOpenClawRuntimeInfo();
  const gatewayUrl = runtime.gatewayUrl || buildGatewayUrl();
  const gatewayReachable = await isGatewayReachable(gatewayUrl);
  const activeModelId = await getActiveOpenClawModel();
  const currentModel = runtime.availableModels.find((item) => item.id === activeModelId) || runtime.availableModels[0] || null;

  return {
    openclaw: {
      installed: runtime.installed,
      running: runtime.running && gatewayReachable,
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
  };
}

export async function updateSelectedModel(modelId: string) {
  const runtime = await loadOpenClawRuntimeInfo();
  const modelExists = runtime.availableModels.some((item) => item.id === modelId);

  if (!modelExists) {
    throw new Error(`未找到可用模型：${modelId}`);
  }

  await writePersistedModelConfig({ selectedModelId: modelId });
  return loadModelConfigState();
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
