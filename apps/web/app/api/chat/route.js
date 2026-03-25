import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { buildBackendApiUrl } from '../../lib/config';

const SESSION_COOKIE_NAME = 'aidp_cloud_session_v2';

function buildSessionUserId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `aidp-web-${crypto.randomUUID()}`;
  }
  return `aidp-web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function looksLikeOnboardingDrift(content) {
  const text = String(content || '');
  return /(刚上线|不知道自己叫什么|给我起名|怎么称呼你|记忆是空的|第一次对话|初始化流程)/.test(text);
}

function shouldRetryWithFreshSession(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const mode = String(payload.mode || '');
  const meta = String(payload?.message?.meta || '');
  const content = String(payload?.message?.content || payload?.output?.content || '');
  return (
    mode === 'fallback' ||
    /暂不可用/.test(meta) ||
    /暂时不可用/.test(content) ||
    looksLikeOnboardingDrift(content)
  );
}

async function forwardChatRequest(parsed, sessionUser) {
  const response = await fetch(buildBackendApiUrl('/api/chat'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      ...parsed,
      sessionUser,
    }),
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }

  return { response, text, payload };
}

export async function POST(request) {
  try {
    const raw = await request.text();
    const parsed = raw ? JSON.parse(raw) : {};
    const cookieStore = await cookies();
    const existingSessionUser = cookieStore.get(SESSION_COOKIE_NAME)?.value?.trim();
    let sessionUser = existingSessionUser || buildSessionUserId();
    let retryWithFreshSession = false;
    let { response, text, payload } = await forwardChatRequest(parsed, sessionUser);

    if (shouldRetryWithFreshSession(payload)) {
      sessionUser = buildSessionUserId();
      retryWithFreshSession = true;
      ({ response, text, payload } = await forwardChatRequest(parsed, sessionUser));
    }

    const nextResponse = new NextResponse(text, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
      },
    });

    if (!existingSessionUser || retryWithFreshSession) {
      nextResponse.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: sessionUser,
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return nextResponse;
  } catch (error) {
    return NextResponse.json(
      {
        error: 'proxy_request_failed',
        path: '/api/chat',
        backendUrl: buildBackendApiUrl('/api/chat'),
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
