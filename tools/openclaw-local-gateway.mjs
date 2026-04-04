import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const port = Number(process.env.OPENCLAW_LOCAL_PORT || 18789);
const host = process.env.OPENCLAW_LOCAL_HOST || '127.0.0.1';
const wslDistro = process.env.OPENCLAW_WSL_DISTRO || 'Ubuntu-24.04';
let wslGatewayCache = { token: null, expiresAt: 0 };

function getWslHealthTimeoutMs() {
  const parsed = Number(process.env.OPENCLAW_LOCAL_WSL_HEALTH_TIMEOUT_MS || 1500);
  return Number.isFinite(parsed) && parsed >= 500 ? parsed : 1500;
}

function getWslChatTimeoutMs() {
  // WSL gateway requests can spend a few seconds failing over between
  // providers. Keep the local bridge patient enough to wait for the real WSL
  // result instead of prematurely falling back to the Windows-side dev config.
  const parsed = Number(process.env.OPENCLAW_LOCAL_WSL_CHAT_TIMEOUT_MS || 45000);
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : 45000;
}

function getProviderTimeoutMs() {
  const parsed = Number(process.env.OPENCLAW_LOCAL_PROVIDER_TIMEOUT_MS || 30000);
  return Number.isFinite(parsed) && parsed >= 3000 ? parsed : 30000;
}

function allowDirectProviderFallback() {
  return String(process.env.OPENCLAW_LOCAL_ALLOW_DIRECT_FALLBACK || '').trim().toLowerCase() === 'true';
}

function getConfigPath() {
  if (process.env.OPENCLAW_CONFIG_PATH) {
    return process.env.OPENCLAW_CONFIG_PATH;
  }

  return path.join(os.homedir(), '.openclaw-autoclaw', 'openclaw.json');
}

async function loadConfig() {
  const configPath = getConfigPath();
  const text = await fs.readFile(configPath, 'utf8');
  return JSON.parse(text);
}

function runCommand(file, args, input = '', options = {}) {
  const timeoutMs = Number(options.timeoutMs || 0);
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer = null;

    function finishError(error) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(error);
    }

    function finishSuccess(payload) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(payload);
    }

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', finishError);
    child.on('close', (code) => {
      if (settled) return;
      if (code === 0) {
        finishSuccess({ stdout, stderr });
      } else {
        finishError(new Error(stderr.trim() || `${file} exited with code ${code}`));
      }
    });

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        try {
          child.kill('SIGTERM');
        } catch {}
        finishError(new Error(`${file} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

async function getWslGatewayToken(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && wslGatewayCache.token && wslGatewayCache.expiresAt > now) {
    return wslGatewayCache.token;
  }

  const script = [
    'python3 - <<\'PY\'',
    'import json, pathlib',
    "path = pathlib.Path.home() / '.openclaw' / 'openclaw.json'",
    "data = json.loads(path.read_text(encoding='utf-8'))",
    "print(data.get('gateway', {}).get('auth', {}).get('token', ''))",
    'PY',
  ].join('\n');

  const result = await runCommand('wsl.exe', ['-d', wslDistro, '--', 'bash', '-lc', script], '', {
    timeoutMs: 3000,
  });
  const token = result.stdout.trim();
  if (!token) {
    throw new Error('WSL OpenClaw gateway token not found');
  }

  wslGatewayCache = {
    token,
    expiresAt: now + 60_000,
  };
  return token;
}

async function tryWslGateway(method, pathname, payloadText = '', options = {}) {
  try {
    const token = await getWslGatewayToken(pathname !== '/health');
    const timeoutMs = pathname === '/health' ? getWslHealthTimeoutMs() : getWslChatTimeoutMs();
    const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
    const curlArgs = [
      '-d',
      wslDistro,
      '--',
      'bash',
      '-lc',
      [
        'curl -sS',
        `-m ${timeoutSec}`,
        `-X ${method}`,
        `-H "Authorization: Bearer ${token}"`,
        '-H "Content-Type: application/json"',
        payloadText ? '--data-binary @-' : '',
        `-w "\\n%{http_code}" http://127.0.0.1:18789${pathname}`,
      ].filter(Boolean).join(' '),
    ];

    const result = await runCommand('wsl.exe', curlArgs, payloadText, { timeoutMs });
    const lines = result.stdout.split(/\r?\n/);
    const status = Number(lines.pop() || 0);
    const body = lines.join('\n').trim();

    if (!status) return null;
    const shouldRetryInvalidToken = !options.retriedInvalidToken
      && status === 401
      && /invalid token/i.test(body);
    if (shouldRetryInvalidToken) {
      wslGatewayCache = { token: null, expiresAt: 0 };
      return tryWslGateway(method, pathname, payloadText, { retriedInvalidToken: true });
    }
    return { status, body };
  } catch {
    return null;
  }
}

function resolveRequestedModel(config, requestedModel) {
  const primary = String(config?.agents?.defaults?.model?.primary || '').trim();
  const normalizedRequestedModel = String(requestedModel || '').trim();
  // Keep Windows local development compatible with the same gateway-scoped
  // model ids that the API uses in production (`openclaw` /
  // `openclaw/<agentId>`). Local fallback must resolve those ids back to the
  // configured provider model instead of treating them as provider names.
  const isGatewayScopedModel = !normalizedRequestedModel
    || normalizedRequestedModel === 'openclaw'
    || normalizedRequestedModel.startsWith('openclaw/')
    || normalizedRequestedModel.startsWith('openclaw:');
  const fallback = !isGatewayScopedModel ? normalizedRequestedModel : primary;

  const modelRef = fallback || primary;
  if (!modelRef) {
    throw new Error('No OpenClaw primary model configured');
  }

  const parts = modelRef.split('/');
  if (parts.length < 2) {
    throw new Error(`Invalid model reference: ${modelRef}`);
  }

  const providerKey = parts[0];
  const modelId = parts.slice(1).join('/');
  const provider = config?.models?.providers?.[providerKey];

  if (!provider) {
    throw new Error(`Unknown provider: ${providerKey}`);
  }

  const declaredModel = Array.isArray(provider.models)
    ? provider.models.find((item) => item.id === modelId || item.name === modelId)
    : null;

  return {
    providerKey,
    provider,
    modelId: declaredModel?.id || modelId,
    displayModel: modelRef,
  };
}

function buildUpstreamUrl(baseUrl) {
  const normalized = String(baseUrl || '').replace(/\/$/, '');
  if (!normalized) throw new Error('Provider baseUrl is missing');
  if (normalized.endsWith('/v1')) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

function buildHeaders(provider, modelId) {
  const headers = {
    'Content-Type': 'application/json',
    ...(provider.headers || {}),
  };

  const declaredModel = Array.isArray(provider.models)
    ? provider.models.find((item) => item.id === modelId || item.name === modelId)
    : null;

  if (declaredModel?.headers && typeof declaredModel.headers === 'object') {
    Object.assign(headers, declaredModel.headers);
  }

  if (!headers.Authorization && !headers['X-Authorization'] && provider.apiKey) {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  return headers;
}

function sendJson(reply, statusCode, payload) {
  reply.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  reply.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8') || '{}';
        resolve(JSON.parse(text));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

async function handleHealth(reply) {
  const wslHealth = await tryWslGateway('GET', '/health');
  if (wslHealth?.status === 200) {
    try {
      const payload = JSON.parse(wslHealth.body);
      return sendJson(reply, 200, {
        status: 'ok',
        service: 'openclaw-local-gateway',
        upstream: 'wsl-openclaw',
        detail: payload,
      });
    } catch {
      return sendJson(reply, 200, {
        status: 'ok',
        service: 'openclaw-local-gateway',
        upstream: 'wsl-openclaw',
      });
    }
  }

  try {
    const config = await loadConfig();
    const primary = String(config?.agents?.defaults?.model?.primary || '').trim();
    sendJson(reply, 200, {
      status: 'ok',
      service: 'openclaw-local-gateway',
      upstream: 'local-provider-proxy',
      primaryModel: primary || null,
    });
  } catch (error) {
    sendJson(reply, 500, {
      status: 'error',
      service: 'openclaw-local-gateway',
      error: String(error?.message || error),
    });
  }
}

async function handleChat(request, reply) {
  try {
    const body = await readJsonBody(request);
    const payloadText = JSON.stringify(body);
    const wslResponse = await tryWslGateway('POST', '/v1/chat/completions', payloadText);
    if (wslResponse?.status) {
      let payload;
      try {
        payload = JSON.parse(wslResponse.body);
      } catch {
        payload = {
          id: `openclaw-wsl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: body.model || 'openclaw:main',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: wslResponse.body },
              finish_reason: 'stop',
            },
          ],
        };
      }

      return sendJson(reply, wslResponse.status, payload);
    }

    // On Windows dev machines this bridge exists primarily to forward requests
    // into the WSL-hosted OpenClaw gateway. Falling back to a separate
    // Windows-side provider config can diverge from the canonical WSL model
    // selection and produce misleading auth failures. Keep that fallback
    // opt-in only.
    if (!allowDirectProviderFallback()) {
      throw new Error('local gateway could not reach the WSL OpenClaw gateway');
    }

    const config = await loadConfig();
    const { provider, modelId, displayModel } = resolveRequestedModel(config, body.model);
    const headers = buildHeaders(provider, modelId);
    const upstreamUrl = buildUpstreamUrl(provider.baseUrl);

    const upstreamBody = {
      model: modelId,
      messages: Array.isArray(body.messages) ? body.messages : [],
      temperature: body.temperature ?? 0.2,
      user: body.user,
      stream: false,
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), getProviderTimeoutMs());
    const response = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify(upstreamBody),
    });
    clearTimeout(timer);

    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = {
        id: `openclaw-local-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: displayModel,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: text },
            finish_reason: 'stop',
          },
        ],
      };
    }

    if (!response.ok) {
      return sendJson(reply, response.status, {
        error: 'upstream_error',
        detail: json,
      });
    }

    if (json && typeof json === 'object' && !json.model) {
      json.model = displayModel;
    }

    sendJson(reply, 200, json);
  } catch (error) {
    const message = String(error?.message || error);
    sendJson(reply, 500, {
      error: 'gateway_error',
      detail: message.includes('timed out after') || message.includes('The operation was aborted')
        ? `local gateway upstream timed out: ${message}`
        : message,
    });
  }
}

const server = http.createServer(async (request, reply) => {
  if (!request.url) {
    return sendJson(reply, 404, { error: 'not_found' });
  }

  if (request.method === 'GET' && request.url === '/health') {
    return handleHealth(reply);
  }

  if (request.method === 'POST' && request.url === '/v1/chat/completions') {
    return handleChat(request, reply);
  }

  if (request.method === 'OPTIONS') {
    reply.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Authorization, x-openclaw-agent-id',
    });
    return reply.end();
  }

  return sendJson(reply, 404, { error: 'not_found' });
});

server.listen(port, host, () => {
  console.log(`OpenClaw local gateway listening on http://${host}:${port}`);
});
