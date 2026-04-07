import { proxyJson } from '../../../../_proxy';

function buildPath(params, requestUrl) {
  const resolvedParams = params || {};
  const slug = Array.isArray(resolvedParams.slug) ? resolvedParams.slug : [];
  const pathname = [
    '/api/bots',
    encodeURIComponent(String(resolvedParams.id || '')),
    'channel-directory-sources',
    ...slug.map((item) => encodeURIComponent(String(item || ''))),
  ].join('/');
  const url = requestUrl ? new URL(requestUrl) : null;
  return `${pathname}${url?.search || ''}`;
}

export async function GET(request, { params }) {
  const resolvedParams = await params;
  return proxyJson(buildPath(resolvedParams, request.url), {}, { forwardFullAccessKey: true });
}

export async function POST(request, { params }) {
  const body = await request.text();
  const resolvedParams = await params;
  return proxyJson(buildPath(resolvedParams, request.url), {
    method: 'POST',
    body,
  }, { forwardFullAccessKey: true });
}

export async function PATCH(request, { params }) {
  const body = await request.text();
  const resolvedParams = await params;
  return proxyJson(buildPath(resolvedParams, request.url), {
    method: 'PATCH',
    body,
  }, { forwardFullAccessKey: true });
}
