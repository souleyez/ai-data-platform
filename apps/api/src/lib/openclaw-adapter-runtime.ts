import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

let wslGatewayTokenCache: { token: string; expiresAt: number } = {
  token: '',
  expiresAt: 0,
};

function env(name: string, fallback?: string) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

export function getOpenClawGatewayBaseUrl() {
  return env('OPENCLAW_GATEWAY_URL');
}

export function getConfiguredOpenClawGatewayToken() {
  return env('OPENCLAW_GATEWAY_TOKEN');
}

export function getOpenClawAgentId() {
  return env('OPENCLAW_AGENT_ID', 'main');
}

function getGatewayTimeoutMs() {
  const parsed = Number(env('OPENCLAW_GATEWAY_TIMEOUT_MS', '45000'));
  if (!Number.isFinite(parsed) || parsed < 3000) return 45000;
  return parsed;
}

export function resolveGatewayTimeoutMs(timeoutMs?: number) {
  const parsed = Number(timeoutMs);
  if (!Number.isFinite(parsed) || parsed < 3000) return getGatewayTimeoutMs();
  return Math.floor(parsed);
}

export function getGatewayRetryCount() {
  const parsed = Number(env('OPENCLAW_GATEWAY_RETRY_COUNT', '1'));
  if (!Number.isFinite(parsed) || parsed < 0) return 1;
  return Math.min(Math.floor(parsed), 2);
}

export function getGatewayRetryDelayMs(attempt: number) {
  const delays = [350, 900];
  return delays[Math.max(0, Math.min(attempt - 1, delays.length - 1))] || 900;
}

export function hasUsableGatewayToken(token?: string) {
  const value = String(token || '').trim();
  if (!value) return false;
  return !/^replace-with-your-/i.test(value);
}

function isLocalGatewayUrl(url?: string) {
  const value = String(url || '').trim().toLowerCase();
  return value.startsWith('http://127.0.0.1') || value.startsWith('http://localhost');
}

function getWslDistro() {
  return env('OPENCLAW_WSL_DISTRO', 'Ubuntu-24.04') || 'Ubuntu-24.04';
}

async function readWslGatewayToken(forceRefresh = false) {
  if (process.platform !== 'win32') return '';

  const now = Date.now();
  if (!forceRefresh && wslGatewayTokenCache.token && wslGatewayTokenCache.expiresAt > now) {
    return wslGatewayTokenCache.token;
  }

  const script = [
    "python3 - <<'PY'",
    'import json, pathlib',
    "path = pathlib.Path.home() / '.openclaw' / 'openclaw.json'",
    "data = json.loads(path.read_text(encoding='utf-8'))",
    "print(data.get('gateway', {}).get('auth', {}).get('token', ''))",
    'PY',
  ].join('\n');

  try {
    const result = await execFileAsync(
      'wsl.exe',
      ['-d', getWslDistro(), '--', 'bash', '-lc', script],
      {
        windowsHide: true,
        timeout: 3000,
      },
    );
    const token = String(result.stdout || '').trim();
    if (!token) return '';
    wslGatewayTokenCache = {
      token,
      expiresAt: now + 60_000,
    };
    return token;
  } catch {
    return '';
  }
}

export async function resolveGatewayToken(baseUrl?: string, configuredToken?: string) {
  if (hasUsableGatewayToken(configuredToken)) return String(configuredToken || '').trim();
  if (!isLocalGatewayUrl(baseUrl)) return '';
  return readWslGatewayToken();
}

// The API layer must always speak to gateways using the gateway-scoped model ids:
// `openclaw` or `openclaw/<agentId>`.
//
// Windows local development and the 120 server do not use the same bridge
// implementation:
// - Windows uses `tools/openclaw-local-gateway.mjs`
// - 120 uses `tools/http-model-bridge.mjs`
//
// Both bridge layers are required to accept these `openclaw`-scoped ids and
// translate them to the real provider model. Do not change this helper back to
// emitting provider ids such as `minimax/...`, or one side of the deployment
// matrix will break again.
export function buildGatewayRequestModel(agentId?: string) {
  const normalizedAgentId = String(agentId || '').trim();
  if (!normalizedAgentId || normalizedAgentId === 'main') {
    return 'openclaw';
  }
  return `openclaw/${normalizedAgentId}`;
}

export function resolveOpenClawModelOverride(modelOverride?: string) {
  const normalizedOverride = String(modelOverride || '').trim();
  return normalizedOverride || '';
}

export function isOpenClawGatewayConfigured() {
  const baseUrl = getOpenClawGatewayBaseUrl();
  const token = getConfiguredOpenClawGatewayToken();
  return Boolean(baseUrl && (hasUsableGatewayToken(token) || isLocalGatewayUrl(baseUrl)));
}

export async function isOpenClawGatewayReachable() {
  const baseUrl = getOpenClawGatewayBaseUrl();
  const token = getConfiguredOpenClawGatewayToken();
  if (!baseUrl) return false;
  if (!hasUsableGatewayToken(token) && !isLocalGatewayUrl(baseUrl)) return false;

  const headers: Record<string, string> = {};
  const authToken = await resolveGatewayToken(baseUrl, token);
  if (hasUsableGatewayToken(authToken)) headers.Authorization = `Bearer ${authToken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/health`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    return response.ok || response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
