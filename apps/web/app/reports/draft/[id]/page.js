'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import HomeWorkspaceToolbar from '../../../components/HomeWorkspaceToolbar';
import Sidebar from '../../../components/Sidebar';
import { fetchDatasources, fetchReportOutput } from '../../../home-api';
import { normalizeDatasourceResponse } from '../../../lib/types';
import {
  formatGeneratedReportTime,
  isDraftGeneratedReport,
  normalizeGeneratedReportRecord,
} from '../../../lib/generated-reports';
import useMobileViewport from '../../../lib/use-mobile-viewport';
import { sourceItems } from '../../../lib/mock-data';

const ReportDraftEditor = dynamic(() => import('../../../components/ReportDraftEditor'));
const GeneratedReportDetail = dynamic(() => import('../../../components/GeneratedReportDetail'));

function getReadinessMeta(readiness) {
  if (readiness === 'ready') return { label: '可终稿', className: 'is-ready' };
  if (readiness === 'blocked') return { label: '需先补齐', className: 'is-blocked' };
  return { label: '继续审改', className: 'is-warning' };
}

const DRAFT_STEPS = [
  {
    key: 'structure',
    title: '1. 确认结构',
    description: '先看模块顺序、类型和重点是否对。',
  },
  {
    key: 'copy',
    title: '2. 调整内容',
    description: '再改文案、图表、风险和结论表达。',
  },
  {
    key: 'finalize',
    title: '3. 选择风格并终稿',
    description: '最后确认视觉风格，再进入终稿生成。',
  },
];

export default function ReportDraftPage() {
  const mobileViewport = useMobileViewport();
  const params = useParams();
  const reportId = String(params?.id || '').trim();
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [reportItem, setReportItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadPageData() {
      if (!reportId) {
        setReportItem(null);
        setError('草稿不存在。');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const [datasourcePayload, reportPayload] = await Promise.all([
          fetchDatasources().catch(() => ({ items: sourceItems })),
          fetchReportOutput(reportId),
        ]);
        if (cancelled) return;

        const normalizedSources = normalizeDatasourceResponse(datasourcePayload);
        setSidebarSources(Array.isArray(normalizedSources.items) && normalizedSources.items.length
          ? normalizedSources.items
          : sourceItems);
        setReportItem(normalizeGeneratedReportRecord(reportPayload?.item || null));
      } catch (loadError) {
        if (cancelled) return;
        setReportItem(null);
        setError(loadError instanceof Error ? loadError.message : '草稿加载失败。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPageData();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const readinessMeta = useMemo(
    () => getReadinessMeta(reportItem?.draft?.readiness),
    [reportItem?.draft?.readiness],
  );
  const scopeLabel = useMemo(() => {
    const labels = Array.isArray(reportItem?.libraries)
      ? reportItem.libraries.map((item) => String(item?.label || item?.key || '').trim()).filter(Boolean)
      : [];
    if (!labels.length) return '未限定数据集';
    if (labels.length === 1) return labels[0];
    return `${labels[0]} 等 ${labels.length} 个数据集`;
  }, [reportItem?.libraries]);

  const content = (
    <main className="report-draft-page-main">
      <section className="card report-draft-page-shell">
        <div className="report-draft-page-header">
          <div className="report-draft-page-copy">
            <span className="report-draft-page-kicker">静态可视化草稿工作区</span>
            <h1>{reportItem?.title || '草稿编辑'}</h1>
            <p>
              {reportItem
                ? `${formatGeneratedReportTime(reportItem.createdAt)} · ${scopeLabel}`
                : '按步骤调整结构、内容和风格，然后再确认终稿。'}
            </p>
          </div>
          <div className="report-draft-page-actions">
            <span className={`report-list-chip ${readinessMeta.className}`.trim()}>{readinessMeta.label}</span>
            <Link className="ghost-btn" href="/reports/draft">返回静态工作台</Link>
            <Link className="ghost-btn" href="/reports">报表中心</Link>
          </div>
        </div>

        <div className="report-draft-page-steps">
          {DRAFT_STEPS.map((step) => (
            <article key={step.key} className="report-draft-page-step">
              <strong>{step.title}</strong>
              <span>{step.description}</span>
            </article>
          ))}
        </div>

        {loading ? (
          <section className="report-empty-card">
            <h4>正在加载草稿</h4>
            <p>正在准备静态可视化编辑页。</p>
          </section>
        ) : error ? (
          <section className="report-empty-card">
            <h4>草稿加载失败</h4>
            <p>{error}</p>
          </section>
        ) : reportItem ? (
          isDraftGeneratedReport(reportItem) ? (
            <ReportDraftEditor item={reportItem} onItemChange={setReportItem} />
          ) : (
            <section className="report-draft-page-preview">
              <div className="report-empty-card">
                <h4>这份报表已不是草稿态</h4>
                <p>当前记录已经进入终稿或不支持模块编辑，这里展示最终预览。</p>
              </div>
              <GeneratedReportDetail item={reportItem} />
            </section>
          )
        ) : null}
      </section>
    </main>
  );

  if (mobileViewport) {
    return (
      <div className="app-shell app-shell-reports-simple">
        <Sidebar sourceItems={sidebarSources} currentPath="/reports" />
        {content}
      </div>
    );
  }

  return (
    <div className="home-shell">
      <main className="home-main-panel">
        <HomeWorkspaceToolbar currentPath="/reports" sourceItems={sidebarSources} />
        {content}
      </main>
    </div>
  );
}
