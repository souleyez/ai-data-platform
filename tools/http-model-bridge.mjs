import http from 'node:http';
import os from 'node:os';

const host = process.env.MODEL_BRIDGE_HOST || '127.0.0.1';
const port = Number(process.env.MODEL_BRIDGE_PORT || 18790);
const defaultModel = process.env.OPENCLAW_MODEL || 'deepseek/deepseek-chat';
const fallbackModel = process.env.OPENCLAW_FALLBACK_MODEL || '';
const platformSessionSkewMs = 5 * 60 * 1000;
let cachedPlatformSession = null;

function env(name, fallback = '') {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function hasPlatformProxyConfigured() {
  return Boolean(env('HOME_PLATFORM_BASE_URL'));
}

function isGatewayScopedModel(modelRef) {
  const normalized = String(modelRef || '').trim();
  return !normalized
    || normalized === 'openclaw'
    || normalized.startsWith('openclaw/')
    || normalized.startsWith('openclaw:');
}

function resolveProviderKey(modelRef) {
  const normalized = String(modelRef || defaultModel).trim();
  const effectiveModelRef = isGatewayScopedModel(normalized) ? defaultModel : normalized;
  const [providerKey] = effectiveModelRef.split('/');
  return providerKey || '';
}

function resolveHomePlatformModel(modelRef) {
  const normalized = String(modelRef || '').trim();
  if (!normalized || isGatewayScopedModel(normalized)) {
    return env('HOME_PLATFORM_MODEL', defaultModel);
  }
  return normalized;
}

function resolveHomePlatformProvider(modelRef) {
  return env('HOME_PLATFORM_PROVIDER', resolveProviderKey(resolveHomePlatformModel(modelRef)));
}

function resolveHomePlatformProjectKey() {
  return env('HOME_PLATFORM_PROJECT_KEY', 'ai-data-platform');
}

function resolveHomePlatformPrincipalKey() {
  return env('HOME_PLATFORM_PRINCIPAL_KEY', `server:${os.hostname().toLowerCase()}`);
}

function resolveHomePlatformPrincipalLabel() {
  return env('HOME_PLATFORM_PRINCIPAL_LABEL', `AI Data Platform ${os.hostname()}`);
}

function resolveHomePlatformDeviceFingerprint() {
  return env('HOME_PLATFORM_DEVICE_FINGERPRINT', `bridge:${os.hostname().toLowerCase()}:${port}`);
}

function resolveHomePlatformBaseUrl() {
  return env('HOME_PLATFORM_BASE_URL').replace(/\/$/, '');
}

function resolveBridgeRuntimeVersion() {
  return env('OPENCLAW_MODEL', defaultModel);
}

function resolveBridgeClientVersion() {
  return env('AI_DATA_PLATFORM_CLIENT_VERSION', 'server-model-bridge');
}

function sessionStillUsable(session) {
  if (!session?.token || !session?.expiresAt) {
    return false;
  }
  const expiresAtMs = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    return false;
  }
  return expiresAtMs - Date.now() > platformSessionSkewMs;
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  return { response, payload };
}

async function bootstrapHomePlatformSession(forceRefresh = false) {
  if (!forceRefresh && sessionStillUsable(cachedPlatformSession)) {
    return cachedPlatformSession;
  }

  const baseUrl = resolveHomePlatformBaseUrl();
  const { response, payload } = await requestJson(`${baseUrl}/client/bootstrap/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectKey: resolveHomePlatformProjectKey(),
      principalType: 'project_identity',
      principalKey: resolveHomePlatformPrincipalKey(),
      principalLabel: resolveHomePlatformPrincipalLabel(),
      deviceFingerprint: resolveHomePlatformDeviceFingerprint(),
      deviceName: env('HOME_PLATFORM_DEVICE_NAME', `AI Data Platform ${os.hostname()}`),
      osFamily: 'linux',
      osVersion: env('HOME_PLATFORM_OS_VERSION', os.release()),
      clientVersion: resolveBridgeClientVersion(),
      runtimeVersion: resolveBridgeRuntimeVersion(),
      openclawVersion: resolveBridgeRuntimeVersion(),
    }),
  });

  if (!response.ok || payload?.status !== 'ok' || !payload?.session?.token) {
    throw new Error(`home_platform_bootstrap_failed:${response.status}:${JSON.stringify(payload)}`);
  }

  cachedPlatformSession = {
    token: payload.session.token,
    expiresAt: payload.session.expiresAt || '',
    modelAccess: payload.modelAccess || null,
  };
  return cachedPlatformSession;
}

function json(reply, statusCode, payload) {
  reply.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  reply.end(JSON.stringify(payload));
}

function readBody(request) {
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

function resolveProvider(modelRef) {
  const normalized = String(modelRef || defaultModel).trim();
  // The API now talks to gateways with standard OpenClaw gateway ids
  // (`openclaw` / `openclaw/<agentId>`). The bridge running on the 120 server
  // must treat those ids as aliases for the real provider model configured in
  // OPENCLAW_MODEL, otherwise server deploys regress into
  // "Unsupported provider in bridge: openclaw".
  const isGatewayScopedModel = !normalized
    || normalized === 'openclaw'
    || normalized.startsWith('openclaw/')
    || normalized.startsWith('openclaw:');
  const effectiveModelRef = isGatewayScopedModel ? defaultModel : normalized;
  const [providerKey, ...rest] = effectiveModelRef.split('/');
  const model = rest.join('/') || 'deepseek-chat';

  if (providerKey === 'deepseek') {
    const apiKey = env('DEEPSEEK_API_KEY');
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY is missing');
    }

    return {
      providerKey,
      model,
      apiKey,
      baseUrl: env('DEEPSEEK_BASE_URL', 'https://api.deepseek.com'),
      chatPath: '/v1/chat/completions',
    };
  }

  if (providerKey === 'minimax' || providerKey === 'minimax-cn') {
    const useCn = providerKey === 'minimax-cn';
    const apiKey = useCn
      ? env('MINIMAX_CN_API_KEY', env('MINIMAX_API_KEY'))
      : env('MINIMAX_API_KEY', env('MINIMAX_CN_API_KEY'));
    if (!apiKey) {
      throw new Error(useCn ? 'MINIMAX_CN_API_KEY is missing' : 'MINIMAX_API_KEY is missing');
    }

    return {
      providerKey,
      model,
      apiKey,
      baseUrl: useCn
        ? env('MINIMAX_CN_BASE_URL', env('MINIMAX_BASE_URL', 'https://api.minimaxi.com/v1'))
        : env('MINIMAX_BASE_URL', env('MINIMAX_CN_BASE_URL', 'https://api.minimaxi.com/v1')),
      chatPath: '/chat/completions',
    };
  }

  throw new Error(`Unsupported provider in bridge: ${providerKey}`);
}

function hasDirectProviderFallback() {
  try {
    resolveProvider(defaultModel);
    return true;
  } catch {
    return false;
  }
}

async function requestHomePlatformChat(body, forceRefresh = false) {
  const session = await bootstrapHomePlatformSession(forceRefresh);
  const baseUrl = resolveHomePlatformBaseUrl();
  const model = resolveHomePlatformModel(body.model);
  const provider = resolveHomePlatformProvider(model);
  const requestBody = {
    ...body,
    projectKey: resolveHomePlatformProjectKey(),
    provider,
    model,
  };

  const { response, payload } = await requestJson(`${baseUrl}/model-proxy/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (response.status === 401 && !forceRefresh) {
    return requestHomePlatformChat(body, true);
  }

  if (!response.ok) {
    throw new Error(`home_platform_proxy_failed:${response.status}:${JSON.stringify(payload)}`);
  }

  return {
    response,
    payload,
  };
}

async function requestChatCompletion(provider, body) {
  const response = await fetch(`${provider.baseUrl.replace(/\/$/, '')}${provider.chatPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages: Array.isArray(body.messages) ? body.messages : [],
      temperature: body.temperature ?? 0.2,
      user: body.user,
      stream: false,
    }),
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = {
      id: `bridge-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: `${provider.providerKey}/${provider.model}`,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: text },
          finish_reason: 'stop',
        },
      ],
    };
  }

  if (payload && typeof payload === 'object' && !payload.model) {
    payload.model = `${provider.providerKey}/${provider.model}`;
  }

  return { response, payload };
}

function shouldFallback(response, payload) {
  if (response.ok) return false;
  const message = JSON.stringify(payload || {}).toLowerCase();
  return (
    response.status >= 400 &&
    response.status < 500 &&
    (
      message.includes('model') ||
      message.includes('not found') ||
      message.includes('unsupported') ||
      message.includes('does not exist') ||
      message.includes('invalid_request_error')
    )
  );
}

async function handleChat(request, reply) {
  try {
    const body = await readBody(request);
    if (hasPlatformProxyConfigured()) {
      try {
        const { response, payload } = await requestHomePlatformChat(body);
        return json(reply, response.status, payload);
      } catch (error) {
        if (!hasDirectProviderFallback()) {
          throw error;
        }
      }
    }

    const provider = resolveProvider(body.model);
    let { response, payload } = await requestChatCompletion(provider, body);

    if (fallbackModel && shouldFallback(response, payload)) {
      const fallbackProvider = resolveProvider(fallbackModel);
      const fallbackResult = await requestChatCompletion(fallbackProvider, body);
      response = fallbackResult.response;
      payload = fallbackResult.payload;
    }

    if (!response.ok) {
      return json(reply, response.status, payload);
    }

    return json(reply, response.status, payload);
  } catch (error) {
    return json(reply, 500, {
      error: 'model_bridge_error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

const server = http.createServer(async (request, reply) => {
  if (!request.url) {
    return json(reply, 404, { error: 'not_found' });
  }

  if (request.method === 'OPTIONS') {
    reply.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return reply.end();
  }

  if (request.method === 'GET' && request.url === '/health') {
    try {
      if (hasPlatformProxyConfigured()) {
        const session = await bootstrapHomePlatformSession();
        return json(reply, 200, {
          status: 'ok',
          service: 'http-model-bridge',
          mode: 'home-platform-preferred',
          projectKey: resolveHomePlatformProjectKey(),
          principalKey: resolveHomePlatformPrincipalKey(),
          model: resolveHomePlatformModel(''),
          provider: resolveHomePlatformProvider(''),
          sessionExpiresAt: session.expiresAt,
          fallback: hasDirectProviderFallback() ? resolveProviderKey(defaultModel) : '',
        });
      }

      const provider = resolveProvider(defaultModel);
      return json(reply, 200, {
        status: 'ok',
        service: 'http-model-bridge',
        mode: 'direct-provider',
        provider: provider.providerKey,
        model: `${provider.providerKey}/${provider.model}`,
      });
    } catch (error) {
      return json(reply, 500, {
        status: 'error',
        service: 'http-model-bridge',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (request.method === 'GET' && request.url === '/v1/models') {
    try {
      if (hasPlatformProxyConfigured()) {
        const model = resolveHomePlatformModel('');
        return json(reply, 200, {
          object: 'list',
          data: [
            {
              id: model,
              object: 'model',
              owned_by: resolveHomePlatformProvider(model) || 'home-platform',
            },
          ],
        });
      }

      const provider = resolveProvider(defaultModel);
      return json(reply, 200, {
        object: 'list',
        data: [
          {
            id: `${provider.providerKey}/${provider.model}`,
            object: 'model',
            owned_by: provider.providerKey,
          },
        ],
      });
    } catch (error) {
      return json(reply, 500, {
        error: 'model_bridge_error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (request.method === 'POST' && request.url === '/v1/chat/completions') {
    return handleChat(request, reply);
  }

  return json(reply, 404, { error: 'not_found' });
});

server.listen(port, host, () => {
  console.log(`HTTP model bridge listening on http://${host}:${port}`);
});
