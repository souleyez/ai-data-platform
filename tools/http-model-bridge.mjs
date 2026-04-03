import http from 'node:http';

const host = process.env.MODEL_BRIDGE_HOST || '127.0.0.1';
const port = Number(process.env.MODEL_BRIDGE_PORT || 18790);
const defaultModel = process.env.OPENCLAW_MODEL || 'deepseek/deepseek-chat';
const fallbackModel = process.env.OPENCLAW_FALLBACK_MODEL || '';

function env(name, fallback = '') {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
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
      const provider = resolveProvider(defaultModel);
      return json(reply, 200, {
        status: 'ok',
        service: 'http-model-bridge',
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
