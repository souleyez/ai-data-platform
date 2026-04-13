import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-web-session-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const webCapture = await importFresh<typeof import('../src/lib/web-capture.js')>(
  '../src/lib/web-capture.js',
);
const webCaptureCredentials = await importFresh<typeof import('../src/lib/web-capture-credentials.js')>(
  '../src/lib/web-capture-credentials.js',
);
const datasourceCredentials = await importFresh<typeof import('../src/lib/datasource-credentials.js')>(
  '../src/lib/datasource-credentials.js',
);
const datasourceDefinitions = await importFresh<typeof import('../src/lib/datasource-definitions.js')>(
  '../src/lib/datasource-definitions.js',
);
const datasourceExecution = await importFresh<typeof import('../src/lib/datasource-execution.js')>(
  '../src/lib/datasource-execution.js',
);
const documentLibraries = await importFresh<typeof import('../src/lib/document-libraries.js')>(
  '../src/lib/document-libraries.js',
);

function parseCookies(header: string | undefined) {
  return Object.fromEntries(
    String(header || '')
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separatorIndex = item.indexOf('=');
        if (separatorIndex <= 0) return ['', ''] as const;
        return [item.slice(0, separatorIndex).trim(), item.slice(separatorIndex + 1).trim()] as const;
      })
      .filter(([name, value]) => Boolean(name && value)),
  );
}

async function readBody(request: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function startSessionServer() {
  let secureRequests = 0;
  let loginPosts = 0;

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const cookies = parseCookies(request.headers.cookie);

    if (request.method === 'GET' && url.pathname === '/secure') {
      secureRequests += 1;
      if (cookies.session === 'valid-session') {
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(`
          <html>
            <head><title>订单中心</title></head>
            <body>
              <article>
                <h1>订单中心</h1>
                <p>订单分析资料正文，说明当前登录态已有效复用。</p>
              </article>
            </body>
          </html>
        `);
        return;
      }

      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`
        <html>
          <head><title>登录</title></head>
          <body>
            <form action="/login" method="post">
              <input type="text" name="username" value="">
              <input type="password" name="password" value="">
              <button type="submit">Login</button>
            </form>
          </body>
        </html>
      `);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/login') {
      loginPosts += 1;
      const body = await readBody(request);
      const params = new URLSearchParams(body);
      if (params.get('username') !== 'tester' || params.get('password') !== 'secret') {
        response.statusCode = 401;
        response.end('invalid');
        return;
      }
      response.statusCode = 200;
      response.setHeader('Set-Cookie', 'session=valid-session; Path=/; HttpOnly');
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`
        <html>
          <head><title>订单中心</title></head>
          <body>
            <article>
              <h1>订单中心</h1>
              <p>订单分析资料正文，说明当前登录态已有效复用。</p>
            </article>
          </body>
        </html>
      `);
      return;
    }

    response.statusCode = 404;
    response.end('not found');
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to start session server');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    getStats() {
      return { secureRequests, loginPosts };
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

test.after(async () => {
  delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
  delete process.env.WEB_CAPTURE_SESSION_TTL_HOURS;
  await fs.rm(storageRoot, { recursive: true, force: true });
});

test('remembered authenticated capture should persist and reuse session cookies across runs', async () => {
  const server = await startSessionServer();
  const secureUrl = `${server.baseUrl}/secure`;
  try {
    const saved = await webCaptureCredentials.saveWebCaptureCredential({
      url: secureUrl,
      username: 'tester',
      password: 'secret',
    });

    const first = await webCapture.createAndRunWebCaptureTask({
      url: secureUrl,
      focus: '订单分析',
      frequency: 'manual',
      credentialRef: saved.id,
      credentialLabel: saved.maskedUsername,
      loginMode: 'credential',
    });
    assert.equal(first.lastStatus, 'success');
    assert.equal(server.getStats().loginPosts, 1);

    const storedAfterFirst = await webCaptureCredentials.loadWebCaptureCredential(secureUrl);
    assert.equal(Boolean(storedAfterFirst?.sessionUpdatedAt), true);
    assert.equal(
      Object.keys(storedAfterFirst?.sessionCookies || {}).length > 0,
      true,
    );

    const second = await webCapture.createAndRunWebCaptureTask({
      url: secureUrl,
      focus: '订单分析',
      frequency: 'manual',
      credentialRef: saved.id,
      credentialLabel: saved.maskedUsername,
      loginMode: 'credential',
    });
    assert.equal(second.lastStatus, 'success');
    assert.equal(server.getStats().loginPosts, 1);
  } finally {
    await server.close();
  }
});

test('manual_session datasource credentials should bypass login form for web datasource runs', async () => {
  const server = await startSessionServer();
  const secureUrl = `${server.baseUrl}/secure`;
  try {
    await documentLibraries.createDocumentLibrary({
      name: 'orders',
      description: 'orders',
      permissionLevel: 0,
    }).catch(() => undefined);

    await datasourceCredentials.upsertDatasourceCredential({
      id: 'cred-manual-session',
      kind: 'manual_session',
      label: '订单分析会话',
      origin: server.baseUrl,
      secret: {
        cookies: 'session=valid-session',
      },
    });

    await datasourceDefinitions.upsertDatasourceDefinition({
      id: 'ds-manual-session-web',
      name: '订单分析登录站点',
      kind: 'web_login',
      status: 'active',
      targetLibraries: [{ key: 'orders', label: 'orders', mode: 'primary' }],
      schedule: { kind: 'manual' },
      authMode: 'manual_session',
      credentialRef: {
        id: 'cred-manual-session',
        kind: 'manual_session',
        label: '订单分析会话',
        origin: server.baseUrl,
        updatedAt: new Date().toISOString(),
      },
      config: {
        url: secureUrl,
        focus: '订单分析',
      },
    });

    const result = await datasourceExecution.runDatasourceDefinition('ds-manual-session-web');
    assert.equal(result.run?.status, 'success');
    assert.equal(server.getStats().loginPosts, 0);
    assert.ok((result.run?.summary || '').length > 0);
  } finally {
    await server.close();
  }
});
