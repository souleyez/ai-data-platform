'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import GeneratedReportDetail from '../../components/GeneratedReportDetail';
import { parseSharedReportPayload } from '../../lib/shared-report-link';

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function SharedReportContent() {
  const searchParams = useSearchParams();
  const payload = searchParams.get('payload') || '';
  const report = useMemo(() => parseSharedReportPayload(payload), [payload]);

  if (!report) {
    return (
      <main className="shared-report-shell">
        <section className="shared-report-card">
          <h1>静态页链接无效</h1>
          <p>当前链接未携带有效的报表静态页数据，请重新复制新的链接。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shared-report-shell">
      <section className="shared-report-card">
        <header className="shared-report-header">
          <h1>{report.title}</h1>
          {report.createdAt ? <p>{formatDateTime(report.createdAt)}</p> : null}
        </header>
        <GeneratedReportDetail item={{ kind: 'page', title: report.title, content: report.content, page: report.page }} />
      </section>
    </main>
  );
}

export default function SharedReportPage() {
  return (
    <Suspense fallback={<main className="shared-report-shell"><section className="shared-report-card"><p>加载静态页中...</p></section></main>}>
      <SharedReportContent />
    </Suspense>
  );
}
