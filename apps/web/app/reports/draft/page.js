'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import DesktopRequiredNotice from '../../components/DesktopRequiredNotice';
import WorkspaceDesktopShell from '../../components/WorkspaceDesktopShell';
import { fetchDatasources, fetchReportBenchmark, fetchReportsSnapshot } from '../../home-api';
import { buildApiUrl } from '../../lib/config';
import {
  buildDraftEditorPath,
  formatGeneratedReportTime,
  normalizeGeneratedReportRecord,
} from '../../lib/generated-reports';
import { getReportVisualStyleMeta, REPORT_VISUAL_STYLE_OPTIONS } from '../../lib/report-visual-styles';
import useMobileViewport from '../../lib/use-mobile-viewport';
import { normalizeDocumentLibrariesResponse } from '../../lib/types';
import { sourceItems } from '../../lib/mock-data';
import { createDocumentLibrary } from '../../documents/api';

const EMPTY_REPORT_BENCHMARK = {
  totals: {
    drafts: 0,
    ready: 0,
    needsAttention: 0,
    blocked: 0,
    readyRatio: 0,
  },
  scenarios: [],
};

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function getDraftReadinessMeta(readiness) {
  if (readiness === 'ready') return { label: '可终稿', className: 'is-ready' };
  if (readiness === 'blocked') return { label: '需先补齐', className: 'is-blocked' };
  if (readiness === 'needs_attention') return { label: '可继续优化', className: 'is-warning' };
  return null;
}

function ReportDraftBenchmarkPanel({ benchmark, selectedCount }) {
  return (
    <section className="card documents-card report-benchmark-panel">
      <div className="panel-header report-benchmark-header">
        <div>
          <h3>静态页草稿基准视图</h3>
          <p>{selectedCount ? `当前按左侧已选 ${selectedCount} 个数据集分组统计。` : '当前按全部数据集分组统计。'}</p>
        </div>
        <div className="report-benchmark-totals">
          <span className="report-benchmark-total-chip">草稿 {benchmark.totals.drafts}</span>
          <span className="report-benchmark-total-chip is-ready">可终稿 {benchmark.totals.ready}</span>
          <span className="report-benchmark-total-chip is-warning">待优化 {benchmark.totals.needsAttention}</span>
          <span className="report-benchmark-total-chip is-blocked">阻塞 {benchmark.totals.blocked}</span>
          <span className="report-benchmark-total-chip">通过率 {formatPercent(benchmark.totals.readyRatio)}</span>
        </div>
      </div>

      {!benchmark.scenarios.length ? (
        <div className="report-empty-card">
          <h4>还没有静态页草稿</h4>
          <p>先生成项目总览首页草稿，或者在对话里产出静态页后，这里会开始累计各场景的通过率。</p>
        </div>
      ) : (
        <div className="report-benchmark-grid">
          {benchmark.scenarios.map((scenario) => (
            <article key={scenario.key} className="report-benchmark-card">
              <div className="report-benchmark-card-header">
                <strong>{scenario.label}</strong>
                <span className="report-benchmark-card-ratio">{formatPercent(scenario.readyRatio)}</span>
              </div>
              <div className="report-benchmark-card-meta">
                <span>草稿 {scenario.total}</span>
                <span>证据覆盖 {formatPercent(scenario.averageEvidenceCoverage)}</span>
              </div>
              <div className="report-benchmark-card-bars">
                <span className="report-list-chip is-ready">可终稿 {scenario.ready}</span>
                <span className="report-list-chip is-warning">待优化 {scenario.needsAttention}</span>
                <span className="report-list-chip is-blocked">阻塞 {scenario.blocked}</span>
              </div>
              {scenario.latestTitle ? (
                <div className="report-benchmark-card-foot">
                  <span>最近草稿</span>
                  <strong>{scenario.latestTitle}</strong>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function StaticPageRecordList({ items = [], activeId = '', onSelect }) {
  return (
    <section className="card documents-card report-static-list-card">
      <div className="panel-header">
        <div>
          <h3>静态页草稿与终稿</h3>
          <p>这里集中查看首页总览、经营页、方案页等静态可视化输出。</p>
        </div>
      </div>

      {!items.length ? (
        <div className="report-empty-card">
          <h4>还没有静态页输出</h4>
          <p>先生成一份项目总览首页草稿，后续静态页都会沉淀在这里。</p>
        </div>
      ) : (
        <div className="report-static-list">
          {items.map((item) => {
            const readinessMeta = getDraftReadinessMeta(item?.draft?.readiness);
            const isActive = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                className={`report-static-list-item ${isActive ? 'is-active' : ''}`.trim()}
                onClick={() => onSelect?.(item.id)}
              >
                <div className="report-static-list-item-head">
                  <strong>{item.title}</strong>
                  <span>{formatGeneratedReportTime(item.createdAt)}</span>
                </div>
                <div className="report-static-list-item-meta">
                  <span>{item.templateLabel || item.groupLabel || item.kind || '静态页'}</span>
                  {readinessMeta ? (
                    <span className={`report-list-chip ${readinessMeta.className}`.trim()}>{readinessMeta.label}</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function ReportsDraftWorkspacePage() {
  const mobileViewport = useMobileViewport();
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [documentLibraries, setDocumentLibraries] = useState([]);
  const [selectedLibraryKeys, setSelectedLibraryKeys] = useState([]);
  const [data, setData] = useState(null);
  const [draftBenchmark, setDraftBenchmark] = useState(EMPTY_REPORT_BENCHMARK);
  const [workspaceOverviewStyle, setWorkspaceOverviewStyle] = useState('signal-board');
  const [selectedDraftId, setSelectedDraftId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submittingKey, setSubmittingKey] = useState('');
  const [libraryCreateBusy, setLibraryCreateBusy] = useState(false);

  async function loadWorkspace() {
    try {
      const [reportPayload, datasourcePayload, librariesResponse] = await Promise.all([
        fetchReportsSnapshot(),
        fetchDatasources().catch(() => ({ items: sourceItems })),
        fetch(buildApiUrl('/api/documents/libraries'), { cache: 'no-store' }),
      ]);
      const librariesPayload = normalizeDocumentLibrariesResponse(await librariesResponse.json());
      const normalizedReports = {
        outputRecords: Array.isArray(reportPayload?.outputRecords)
          ? reportPayload.outputRecords.map(normalizeGeneratedReportRecord)
          : [],
        benchmark: reportPayload?.benchmark || EMPTY_REPORT_BENCHMARK,
      };
      const normalizedSources = Array.isArray(datasourcePayload?.items) && datasourcePayload.items.length
        ? datasourcePayload.items
        : sourceItems;
      setSidebarSources(normalizedSources);
      setDocumentLibraries(Array.isArray(librariesPayload?.items) ? librariesPayload.items : []);
      setData(normalizedReports);
      setDraftBenchmark(normalizedReports.benchmark);
      setError('');
    } catch {
      setError('静态页工作区暂时不可用。');
    }
  }

  useEffect(() => {
    if (mobileViewport) return undefined;
    void loadWorkspace();
    return undefined;
  }, [mobileViewport]);

  const staticPageItems = useMemo(() => {
    const records = Array.isArray(data?.outputRecords) ? data.outputRecords : [];
    const filtered = records.filter((item) => item?.kind === 'page');
    if (!selectedLibraryKeys.length) return filtered;
    return filtered.filter((item) => {
      const groupKey = String(item?.groupKey || '').trim();
      if (groupKey && selectedLibraryKeys.includes(groupKey)) return true;
      const libraryKeys = Array.isArray(item?.libraries)
        ? item.libraries.map((entry) => String(entry?.key || '').trim()).filter(Boolean)
        : [];
      return libraryKeys.some((key) => selectedLibraryKeys.includes(key));
    });
  }, [data?.outputRecords, selectedLibraryKeys]);

  useEffect(() => {
    if (!staticPageItems.length) {
      setSelectedDraftId('');
      return;
    }
    if (!selectedDraftId || !staticPageItems.some((item) => item.id === selectedDraftId)) {
      setSelectedDraftId(staticPageItems[0].id);
    }
  }, [selectedDraftId, staticPageItems]);

  useEffect(() => {
    if (!selectedLibraryKeys.length) {
      setDraftBenchmark(data?.benchmark || EMPTY_REPORT_BENCHMARK);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchReportBenchmark(selectedLibraryKeys);
        if (!cancelled) setDraftBenchmark(response?.benchmark || EMPTY_REPORT_BENCHMARK);
      } catch {
        if (!cancelled) setDraftBenchmark(EMPTY_REPORT_BENCHMARK);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data?.benchmark, selectedLibraryKeys]);

  const activeItem = useMemo(
    () => staticPageItems.find((item) => item.id === selectedDraftId) || staticPageItems[0] || null,
    [selectedDraftId, staticPageItems],
  );
  const workspaceOverviewStyleMeta = useMemo(
    () => getReportVisualStyleMeta(workspaceOverviewStyle),
    [workspaceOverviewStyle],
  );

  async function handleCreateLibrary(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed || libraryCreateBusy) return false;
    try {
      setLibraryCreateBusy(true);
      const created = await createDocumentLibrary(trimmed, '');
      await loadWorkspace();
      const createdKey = String(created?.item?.key || '').trim();
      if (createdKey) {
        setSelectedLibraryKeys((current) => (current.includes(createdKey) ? current : [...current, createdKey]));
      }
      return true;
    } catch {
      return false;
    } finally {
      setLibraryCreateBusy(false);
    }
  }

  async function generateWorkspaceOverview() {
    try {
      setSubmittingKey('generate-workspace-overview');
      setMessage('');
      const response = await fetch(buildApiUrl('/api/reports/workspace-overview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupKey: selectedLibraryKeys.length === 1 ? selectedLibraryKeys[0] : undefined,
          visualStyle: workspaceOverviewStyle,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'generate workspace overview failed');
      await loadWorkspace();
      const nextId = String(json?.item?.id || '').trim();
      if (nextId) {
        window.location.href = buildDraftEditorPath(nextId);
        return;
      }
      setMessage(json?.message || '已生成项目总览首页草稿。');
    } catch (generationError) {
      setMessage(generationError instanceof Error ? generationError.message : '生成项目总览首页失败。');
    } finally {
      setSubmittingKey('');
    }
  }

  const content = (
    <>
      {error ? <p>{error}</p> : null}
      {message ? <div className="page-note">{message}</div> : null}

      <section className="card documents-card report-static-workspace-shell">
        <div className="panel-header">
          <div>
            <h3>静态可视化工作台</h3>
            <p>从这里统一生成首页、经营页、方案页等静态页面，再进入独立编辑页逐步确认。</p>
          </div>
          <Link className="ghost-btn" href="/reports">返回报表中心</Link>
        </div>

        <div className="reports-page-actions">
          <div className="reports-page-overview-style">
            <div className="report-visual-style-grid report-visual-style-grid-compact">
              {REPORT_VISUAL_STYLE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`report-visual-style-card ${option.previewClassName} ${workspaceOverviewStyle === option.value ? 'is-selected' : ''}`.trim()}
                  onClick={() => setWorkspaceOverviewStyle(option.value)}
                >
                  <span className="report-visual-style-card-preview" />
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
            <div className="report-draft-style-note">
              <strong>{workspaceOverviewStyleMeta.label}</strong>
              <span>{workspaceOverviewStyleMeta.description}</span>
            </div>
          </div>
          <button
            className="primary-btn"
            type="button"
            disabled={submittingKey === 'generate-workspace-overview'}
            onClick={() => void generateWorkspaceOverview()}
          >
            {submittingKey === 'generate-workspace-overview' ? '生成中...' : '生成项目总览首页草稿'}
          </button>
          <span className="report-template-create-hint">
            直接使用当前项目的文档、采集、报表与审计数据生成一个可视化首页，再进入草稿审改。
          </span>
        </div>
      </section>

      <ReportDraftBenchmarkPanel
        benchmark={draftBenchmark}
        selectedCount={selectedLibraryKeys.length}
      />

      <section className="report-static-workspace-grid">
        <StaticPageRecordList
          items={staticPageItems}
          activeId={activeItem?.id || ''}
          onSelect={setSelectedDraftId}
        />

        <section className="card documents-card report-static-preview-card">
          <div className="panel-header">
            <div>
              <h3>{activeItem?.title || '静态页预览'}</h3>
              <p>
                {activeItem
                  ? `${formatGeneratedReportTime(activeItem.createdAt)} · ${activeItem.groupLabel || activeItem.templateLabel || '静态页'}`
                  : '选择左侧一份静态页后查看详情。'}
              </p>
            </div>
            {activeItem ? (
              <Link className="primary-btn" href={buildDraftEditorPath(activeItem)}>
                进入编辑确认
              </Link>
            ) : null}
          </div>

          {activeItem ? (
            <div className="report-static-preview-meta">
              {getDraftReadinessMeta(activeItem?.draft?.readiness) ? (
                <span className={`report-list-chip ${getDraftReadinessMeta(activeItem.draft.readiness).className}`.trim()}>
                  {getDraftReadinessMeta(activeItem.draft.readiness).label}
                </span>
              ) : null}
              <span className="report-list-chip">
                模块 {Array.isArray(activeItem?.draft?.modules) ? activeItem.draft.modules.length : 0}
              </span>
            </div>
          ) : null}

          {activeItem ? (
            <div className="report-static-preview-body">
              <div className="report-static-preview-summary">
                <p>{activeItem.page?.summary || activeItem.summary || activeItem.content || '当前静态页暂无摘要。'}</p>
              </div>
              <div className="report-static-preview-section-list">
                {(activeItem.page?.sections || []).slice(0, 4).map((section) => (
                  <article key={`${activeItem.id}-${section.title}`} className="report-static-preview-section">
                    <strong>{section.title || '未命名模块'}</strong>
                    <span>{section.body || (section.bullets || []).join('；') || '暂无内容'}</span>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="report-empty-card">
              <h4>还没有静态页</h4>
              <p>先生成一份项目总览首页草稿，后续静态页都会集中到这里。</p>
            </div>
          )}
        </section>
      </section>
    </>
  );

  if (!mobileViewport) {
    return (
      <WorkspaceDesktopShell
        currentPath="/reports"
        sourceItems={sidebarSources}
        libraries={documentLibraries}
        totalDocuments={documentLibraries.reduce((total, item) => total + Number(item?.documentCount || 0), 0)}
        selectedKeys={selectedLibraryKeys}
        onToggleLibrary={(libraryKey) => {
          setSelectedLibraryKeys((current) => (
            current.includes(libraryKey)
              ? current.filter((item) => item !== libraryKey)
              : [...current, libraryKey]
          ));
        }}
        onClearSelection={() => setSelectedLibraryKeys([])}
        onCreateLibrary={handleCreateLibrary}
        creating={libraryCreateBusy}
      >
        {content}
      </WorkspaceDesktopShell>
    );
  }

  return (
    <DesktopRequiredNotice
      title="静态页工作台请在 PC 端打开"
      description="移动端当前只保留对话交流。静态页工作台的生成、预览和编辑确认，请切换到 PC 端继续操作。"
      primaryHref="/"
      primaryLabel="返回首页继续对话"
      secondaryHref="/reports"
      secondaryLabel="返回报表中心"
    />
  );
}
