import { NextResponse } from 'next/server';
import { buildReportPptxBuffer, buildReportPptxFilename } from '../../../../lib/report-pptx';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const json = await request.json();
    const item = json?.item || null;
    if (!item || !item.title) {
      return NextResponse.json(
        {
          error: 'invalid_report_payload',
          message: '缺少可导出的报表内容。',
        },
        { status: 400 },
      );
    }

    const buffer = await buildReportPptxBuffer(item);
    const filename = buildReportPptxFilename(item);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'pptx_export_failed',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
