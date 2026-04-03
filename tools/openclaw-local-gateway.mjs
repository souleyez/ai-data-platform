import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const port = Number(process.env.OPENCLAW_LOCAL_PORT || 18789);
const host = process.env.OPENCLAW_LOCAL_HOST || '127.0.0.1';
const wslDistro = process.env.OPENCLAW_WSL_DISTRO || 'Ubuntu-24.04';
let wslGatewayCache = { token: null, expiresAt: 0 };

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

function runCommand(file, args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: ['pipe', 'pipe', 'pipe'] });
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
      } else {
        reject(new Error(stderr.trim() || `${file} exited with code ${code}`));
      }
    });

    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

async function getWslGatewayToken() {
  const now = Date.now();
  if (wslGatewayCache.token && wslGatewayCache.expiresAt > now) {
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

  const result = await runCommand('wsl.exe', ['-d', wslDistro, '--', 'bash', '-lc', script]);
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

async function tryWslGateway(method, pathname, payloadText = '') {
  try {
    const token = await getWslGatewayToken();
    const curlArgs = [
      '-d',
      wslDistro,
      '--',
      'bash',
      '-lc',
      [
        'curl -sS',
        `-X ${method}`,
        `-H "Authorization: Bearer ${token}"`,
        '-H "Content-Type: application/json"',
        payloadText ? '--data-binary @-' : '',
        `-w "\\n%{http_code}" http://127.0.0.1:18789${pathname}`,
      ].filter(Boolean).join(' '),
    ];

    const result = await runCommand('wsl.exe', curlArgs, payloadText);
    const lines = result.stdout.split(/\r?\n/);
    const status = Number(lines.pop() || 0);
    const body = lines.join('\n').trim();

    if (!status) return null;
    return { status, body };
  } catch {
    return null;
  }
}

function resolveRequestedModel(config, requestedModel) {
  const primary = String(config?.agents?.defaults?.model?.primary || '').trim();
  const normalizedRequestedModel = String(requestedModel || '').trim();
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

    const response = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(upstreamBody),
    });

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
    sendJson(reply, 500, {
      error: 'gateway_error',
      detail: String(error?.message || error),
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
