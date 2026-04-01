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

    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': response.headers.get('content-disposition')?.replace(/^attachment;/i, 'inline;') || 'inline',
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
