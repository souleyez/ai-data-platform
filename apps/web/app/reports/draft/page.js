'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import DesktopRequiredNotice from '../../components/DesktopRequiredNotice';
import WorkspaceDesktopShell from '../../components/WorkspaceDesktopShell';
import { fetchDatasources, fetchReportsSnapshot } from '../../home-api';
import { buildApiUrl } from '../../lib/config';
import {
  buildDraftEditorPath,
  formatGeneratedReportTime,
  normalizeGeneratedReportRecord,
} from '../../lib/generated-reports';
import {
  formatReportViewportTargetLabel,
  resolveReportViewportTarget,
  sortGeneratedReportsForViewport,
} from '../../lib/report-viewport-target';
import useMobileViewport from '../../lib/use-mobile-viewport';
import { normalizeDocumentLibrariesResponse } from '../../lib/types';
import { sourceItems } from '../../lib/mock-data';
import { createDocumentLibrary } from '../../documents/api';

function getDraftReadinessMeta(readiness) {
  if (readiness === 'ready') return { label: '可终稿', className: 'is-ready' };
  if (readiness === 'blocked') return { label: '需先补齐', className: 'is-blocked' };
  if (readiness === 'needs_attention') return { label: '可继续优化', className: 'is-warning' };
  return null;
}

function StaticPageRecordList({ items = [], activeId = '', onSelect }) {
  return (
    <section className="card documents-card report-static-list-card">
      <div className="panel-header">
        <div>
          <h3>已有静态页</h3>
          <p>这里集中查看已经生成的静态页，并继续回到编辑确认。</p>
        </div>
      </div>

      {!items.length ? (
        <div className="report-empty-card">
          <h4>还没有静态页</h4>
          <p>请先在对话中选择“按数据集输出”，系统会直接进入静态页规划与编辑页面。</p>
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
                  <span className="report-list-chip">{formatReportViewportTargetLabel(resolveReportViewportTarget(item))}</span>
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
  const [outputRecords, setOutputRecords] = useState([]);
  const [selectedDraftId, setSelectedDraftId] = useState('');
  const [error, setError] = useState('');
  const [libraryCreateBusy, setLibraryCreateBusy] = useState(false);

  async function loadWorkspace() {
    try {
      const [reportPayload, datasourcePayload, librariesResponse] = await Promise.all([
        fetchReportsSnapshot(),
        fetchDatasources().catch(() => ({ items: sourceItems })),
        fetch(buildApiUrl('/api/documents/libraries'), { cache: 'no-store' }),
      ]);
      const librariesPayload = normalizeDocumentLibrariesResponse(await librariesResponse.json());
      const normalizedSources = Array.isArray(datasourcePayload?.items) && datasourcePayload.items.length
        ? datasourcePayload.items
        : sourceItems;
      const normalizedRecords = Array.isArray(reportPayload?.outputRecords)
        ? reportPayload.outputRecords.map(normalizeGeneratedReportRecord)
        : [];

      setSidebarSources(normalizedSources);
      setDocumentLibraries(Array.isArray(librariesPayload?.items) ? librariesPayload.items : []);
      setOutputRecords(normalizedRecords);
      setError('');
    } catch {
      setError('静态页编辑页暂时不可用。');
    }
  }

  useEffect(() => {
    if (mobileViewport) return undefined;
    void loadWorkspace();
    return undefined;
  }, [mobileViewport]);

  const staticPageItems = useMemo(() => {
    const filtered = outputRecords.filter((item) => item?.kind === 'page');
    const scoped = !selectedLibraryKeys.length ? filtered : filtered.filter((item) => {
      const groupKey = String(item?.groupKey || '').trim();
      if (groupKey && selectedLibraryKeys.includes(groupKey)) return true;
      const libraryKeys = Array.isArray(item?.libraries)
        ? item.libraries.map((entry) => String(entry?.key || '').trim()).filter(Boolean)
        : [];
      return libraryKeys.some((key) => selectedLibraryKeys.includes(key));
    });
    return sortGeneratedReportsForViewport(scoped, mobileViewport);
  }, [mobileViewport, outputRecords, selectedLibraryKeys]);

  useEffect(() => {
    if (!staticPageItems.length) {
      setSelectedDraftId('');
      return;
    }
    if (!selectedDraftId || !staticPageItems.some((item) => item.id === selectedDraftId)) {
      setSelectedDraftId(staticPageItems[0].id);
    }
  }, [selectedDraftId, staticPageItems]);

  const activeItem = useMemo(
    () => staticPageItems.find((item) => item.id === selectedDraftId) || staticPageItems[0] || null,
    [selectedDraftId, staticPageItems],
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

  const content = (
    <>
      {error ? <p>{error}</p> : null}

      <section className="card documents-card report-static-workspace-shell">
        <div className="panel-header">
          <div>
            <h3>静态页编辑中心</h3>
            <p>新建静态页请在对话中选择“按数据集输出”。这里仅用于查看已有静态页并继续编辑。</p>
          </div>
          <Link className="ghost-btn" href="/reports">返回报表中心</Link>
        </div>
      </section>

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
                  : '选择左侧一份静态页后查看规划与内容预览。'}
              </p>
            </div>
            {activeItem ? (
              <Link className="primary-btn" href={buildDraftEditorPath(activeItem)}>
                编辑静态页
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
              <span className="report-list-chip">{formatReportViewportTargetLabel(resolveReportViewportTarget(activeItem))}</span>
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
              <p>生成后的静态页会沉淀在这里，支持继续回到编辑页调整规划和内容。</p>
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
      title="静态页编辑请在 PC 端打开"
      description="移动端当前只保留对话交流。新建静态页请在对话中选择“按数据集输出”，已有静态页的编辑确认请切换到 PC 端继续。"
      primaryHref="/"
      primaryLabel="返回首页继续对话"
      secondaryHref="/reports"
      secondaryLabel="返回报表中心"
    />
  );
}
