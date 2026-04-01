import { NextResponse } from 'next/server';
import { buildBackendApiUrl } from '../../../lib/config';

const PREVIEW_CONTENT_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.csv': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildFallbackPreviewHtml(detail) {
  const item = detail?.item || {};
  const title = escapeHtml(item.title || item.name || '文档预览');
  const summary = escapeHtml(item.summary || item.excerpt || '');
  const fullText = escapeHtml(
    item.fullText || item.excerpt || item.summary || '当前服务器未保存原始文件，仅保留了解析后的文本内容。',
  );
  const ext = escapeHtml(item.ext || '-');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { margin: 0; font-family: "Microsoft YaHei", "PingFang SC", sans-serif; background: #f8fafc; color: #0f172a; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 24px; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06); }
    .chip { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; font-size: 12px; margin-bottom: 12px; }
    h1 { margin: 0 0 12px; font-size: 22px; }
    p { margin: 0 0 12px; line-height: 1.7; color: #334155; }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; font: 14px/1.7 Consolas, "SFMono-Regular", monospace; color: #0f172a; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="chip">原文件未同步，当前展示解析内容</div>
      <h1>${title}</h1>
      <p>文件类型：${ext}</p>
      ${summary ? `<p>${summary}</p>` : ''}
      <pre>${fullText}</pre>
    </div>
  </div>
</body>
</html>`;
}

export async function GET(request) {
  const id = encodeURIComponent(request.nextUrl.searchParams.get('id') || '');

  try {
    const detailResponse = await fetch(buildBackendApiUrl(`/api/documents/detail?id=${id}`), {
      method: 'GET',
      cache: 'no-store',
    });

    if (!detailResponse.ok) {
      return new NextResponse(detailResponse.body, {
        status: detailResponse.status,
        headers: {
          'Content-Type': detailResponse.headers.get('content-type') || 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    }

    const detail = await detailResponse.json();
    if (detail?.item?.sourceAvailable === false) {
      return new NextResponse(buildFallbackPreviewHtml(detail), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    const ext = String(detail?.item?.ext || '').toLowerCase();
    const contentType = PREVIEW_CONTENT_TYPES[ext];
    if (!contentType) {
      return NextResponse.json(
        {
          error: 'inline_preview_not_supported',
          message: '当前文件类型暂不支持浏览器内预览。',
        },
        { status: 400 },
      );
    }

    const response = await fetch(buildBackendApiUrl(`/api/documents/download?id=${id}`), {
      method: 'GET',
      cache: 'no-store',
    });

    if (!response.ok) {
      return new NextResponse(buildFallbackPreviewHtml(detail), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition':
          response.headers.get('content-disposition')?.replace(/^attachment;/i, 'inline;') || 'inline',
        'Cache-Control': response.headers.get('cache-control') || 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'proxy_request_failed',
        path: '/api/documents/preview',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
