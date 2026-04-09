'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ConnectedBotAccessEditor from '../components/ConnectedBotAccessEditor';
import ConnectedBotsSummary from '../components/ConnectedBotsSummary';
import GeneratedReportDetail from '../components/GeneratedReportDetail';
import ReportResultsPanel from '../components/ReportResultsPanel';
import Sidebar from '../components/Sidebar';
import {
  deleteReportOutput,
  fetchBots,
  fetchDatasources,
  updateBot,
} from '../home-api';
import { buildApiUrl } from '../lib/config';
import {
  copyGeneratedReportLink,
  downloadGeneratedReportAs,
  formatGeneratedReportTime,
  normalizeGeneratedReportRecord,
} from '../lib/generated-reports';
import {
  buildDefaultTemplateLabel,
  buildUploadedTemplateItems,
  findDuplicateTemplateUpload,
  formatTemplateUploadSourceTypeLabel,
  inferTemplateUploadSourceType,
} from '../lib/report-template-uploads.mjs';
import useMobileViewport from '../lib/use-mobile-viewport';
import {
  normalizeDocumentLibrariesResponse,
  normalizeReportsResponse,
} from '../lib/types';
import { sourceItems } from '../lib/mock-data';

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatFileSize(size) {
  const value = Number(size || 0);
  if (!value) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadedTemplateItem({ item, submittingKey, onDeleteTemplate, onDeleteReference, buildDownloadUrl }) {
  const isPlaceholder = String(item.id || '').startsWith('placeholder:');
  const deletingTemplate = submittingKey === `delete-template:${item.templateKey}`;
  const deletingReference = submittingKey === `delete-reference:${item.id}`;

  return (
    <article className="capture-result-item report-upload-item">
      <div className="report-upload-header">
        <div>
          <strong>{item.templateLabel}</strong>
          <div className="report-upload-meta">
            上传时间：{formatDateTime(item.uploadedAt || item.createdAt)}
          </div>
        </div>
        <span className="report-upload-tag">{formatTemplateUploadSourceTypeLabel(item.sourceType)}</span>
      </div>

      {item.description ? <div className="capture-task-note">{item.description}</div> : null}

      <div className="report-upload-grid">
        <div className="report-upload-cell">
          <span>上传内容</span>
          {item.url ? (
            <a className="report-upload-link" href={item.url} target="_blank" rel="noreferrer">
              {item.uploadName}
            </a>
          ) : (
            <strong>{item.uploadName}</strong>
          )}
        </div>
        <div className="report-upload-cell">
          <span>模板名称</span>
          <strong>{item.templateLabel}</strong>
        </div>
        <div className="report-upload-cell">
          <span>来源类型</span>
          <strong>{formatTemplateUploadSourceTypeLabel(item.sourceType)}</strong>
        </div>
        <div className="report-upload-cell">
          <span>文件大小</span>
          <strong>{formatFileSize(item.size)}</strong>
        </div>
      </div>

      <div className="report-template-actions">
        {item.url ? (
          <a className="ghost-btn report-upload-action" href={item.url} target="_blank" rel="noreferrer">
            打开链接
          </a>
        ) : !isPlaceholder ? (
          <a className="ghost-btn report-upload-action" href={buildDownloadUrl(item)}>
            下载原文件
          </a>
        ) : null}

        {!isPlaceholder ? (
          <button
            className="ghost-btn"
            type="button"
            disabled={deletingReference || deletingTemplate}
            onClick={() => onDeleteReference(item)}
          >
            {deletingReference ? '删除中...' : '删除当前条目'}
          </button>
        ) : null}

        <button
          className="ghost-btn"
          type="button"
          disabled={deletingTemplate || deletingReference}
          onClick={() => onDeleteTemplate(item)}
        >
          {deletingTemplate ? '删除中...' : '删除整个模板'}
        </button>
      </div>
    </article>
  );
}

function SingleReportActions({ item }) {
  return (
    <div className="report-list-actions">
      <button className="ghost-btn" type="button" onClick={() => void copyGeneratedReportLink(item)}>
        复制链接
      </button>
      <button className="ghost-btn" type="button" onClick={() => void downloadGeneratedReportAs(item, 'table')}>
        按表格下载
      </button>
      <button className="ghost-btn" type="button" onClick={() => void downloadGeneratedReportAs(item, 'ppt')}>
        按 PPT 下载
      </button>
      <button className="ghost-btn" type="button" onClick={() => void downloadGeneratedReportAs(item, 'text')}>
        按纯文字下载
      </button>
    </div>
  );
}

function ReportsPageContent() {
  const mobileViewport = useMobileViewport();
  const searchParams = useSearchParams();
  const generatedId = searchParams.get('generated') || '';
  const fileInputRef = useRef(null);
  const [data, setData] = useState(null);
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submittingKey, setSubmittingKey] = useState('');
  const [generatedReport, setGeneratedReport] = useState(null);
  const [selectedReportId, setSelectedReportId] = useState('');
  const hasAutoSelectedReportRef = useRef(false);
  const [templateDraft, setTemplateDraft] = useState({
    label: '',
    description: '',
    link: '',
  });
  const [templateFile, setTemplateFile] = useState(null);
  const [botItems, setBotItems] = useState([]);
  const [botManageEnabled, setBotManageEnabled] = useState(false);
  const [documentLibraries, setDocumentLibraries] = useState([]);

  async function loadReports() {
    try {
      const response = await fetch(buildApiUrl('/api/reports'), { cache: 'no-store' });
      if (!response.ok) throw new Error('load reports failed');
      const json = await response.json();
      const normalized = normalizeReportsResponse(json);
      setData(normalized);
      setError('');
      setTemplateDraft((prev) => ({
        ...prev,
        label: prev.label || buildDefaultTemplateLabel(normalized.templates || []),
      }));
    } catch {
      setError('报表中心暂时不可用。');
    }
  }

  async function loadSidebarSources() {
    try {
      const normalized = await fetchDatasources();
      if (normalized.items.length) {
        setSidebarSources(normalized.items);
      }
    } catch {
      setSidebarSources(sourceItems);
    }
  }

  async function loadBotContext() {
    try {
      const [botsPayload, librariesResponse] = await Promise.all([
        fetchBots(),
        fetch(buildApiUrl('/api/documents/libraries'), { cache: 'no-store' }),
      ]);
      const librariesPayload = normalizeDocumentLibrariesResponse(await librariesResponse.json());
      setBotItems(Array.isArray(botsPayload?.items) ? botsPayload.items : []);
      setBotManageEnabled(Boolean(botsPayload?.manageEnabled));
      setDocumentLibraries(Array.isArray(librariesPayload?.items) ? librariesPayload.items : []);
    } catch {
      setBotItems([]);
      setBotManageEnabled(false);
      setDocumentLibraries([]);
    }
  }

  useEffect(() => {
    void loadReports();
    void loadSidebarSources();
    void loadBotContext();
  }, []);

  const outputRecords = useMemo(
    () => (data?.outputRecords || []).map(normalizeGeneratedReportRecord),
    [data],
  );

  const uploadedTemplateItems = useMemo(
    () => buildUploadedTemplateItems(data?.templates || []),
    [data],
  );

  useEffect(() => {
    if (!outputRecords.some((item) => item?.status === 'processing')) return undefined;
    const timer = setInterval(() => {
      void loadReports();
    }, 6000);
    return () => clearInterval(timer);
  }, [outputRecords]);

  useEffect(() => {
    if (!generatedId) {
      setGeneratedReport(null);
      return;
    }
    setGeneratedReport(outputRecords.find((item) => item.id === generatedId) || null);
  }, [generatedId, outputRecords]);

  useEffect(() => {
    if (generatedId) return;

    if (!outputRecords.length) {
      hasAutoSelectedReportRef.current = false;
      setSelectedReportId('');
      return;
    }

    if (selectedReportId) {
      if (!outputRecords.some((item) => item.id === selectedReportId)) {
        setSelectedReportId(outputRecords[0].id);
      }
      hasAutoSelectedReportRef.current = true;
      return;
    }

    if (!hasAutoSelectedReportRef.current) {
      setSelectedReportId(outputRecords[0].id);
      hasAutoSelectedReportRef.current = true;
    }
  }, [generatedId, outputRecords, selectedReportId]);

  function buildTemplateReferenceDownloadUrl(item) {
    return `${buildApiUrl(`/api/reports/template-reference/${encodeURIComponent(item.id)}/download`)}?templateKey=${encodeURIComponent(item.templateKey)}`;
  }

  async function saveConnectedBot(botId, payload) {
    await updateBot(botId, payload);
    await loadBotContext();
  }

  async function deleteReport(reportId) {
    if (!reportId) return;
    try {
      await deleteReportOutput(reportId);
      await loadReports();
    } catch (deleteError) {
      setMessage(deleteError instanceof Error ? deleteError.message : '删除报表失败。');
    }
  }

  async function deleteTemplate(item) {
    if (!window.confirm(`确认删除模板“${item.templateLabel}”吗？这会移除它的所有上传记录。`)) {
      return;
    }

    try {
      setSubmittingKey(`delete-template:${item.templateKey}`);
      setMessage('');
      const response = await fetch(buildApiUrl(`/api/reports/template/${encodeURIComponent(item.templateKey)}`), {
        method: 'DELETE',
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'delete template failed');
      await loadReports();
      setMessage(json?.message || '模板已删除。');
    } catch (deleteError) {
      setMessage(deleteError instanceof Error ? deleteError.message : '删除模板失败。');
    } finally {
      setSubmittingKey('');
    }
  }

  async function deleteTemplateReference(item) {
    if (!window.confirm(`确认删除“${item.uploadName}”吗？`)) {
      return;
    }

    try {
      setSubmittingKey(`delete-reference:${item.id}`);
      setMessage('');
      const response = await fetch(
        `${buildApiUrl(`/api/reports/template-reference/${encodeURIComponent(item.id)}`)}?templateKey=${encodeURIComponent(item.templateKey)}`,
        { method: 'DELETE' },
      );
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'delete template reference failed');
      await loadReports();
      setMessage(json?.message || '上传记录已删除。');
    } catch (deleteError) {
      setMessage(deleteError instanceof Error ? deleteError.message : '删除上传记录失败。');
    } finally {
      setSubmittingKey('');
    }
  }

  async function uploadTemplate() {
    const label = String(templateDraft.label || '').trim();
    const description = String(templateDraft.description || '').trim();
    const link = String(templateDraft.link || '').trim();
    const hasFile = Boolean(templateFile);
    const hasLink = Boolean(link);
    let createdTemplate = null;

    if (!label) {
      setMessage('模板名称不能为空。');
      return;
    }
    if (hasFile && hasLink) {
      setMessage('文件和网页链接二选一即可。');
      return;
    }
    if (!hasFile && !hasLink) {
      setMessage('请上传文件或填写网页链接。');
      return;
    }

    try {
      setSubmittingKey('upload-template');
      setMessage('');

      const sourceType = hasFile
        ? inferTemplateUploadSourceType({ fileName: templateFile?.name, mimeType: templateFile?.type })
        : 'web-link';
      const duplicate = findDuplicateTemplateUpload(data?.templates || [], {
        fileName: hasFile ? templateFile?.name : '',
        url: hasLink ? link : '',
      });
      if (duplicate) {
        throw new Error(`相同内容已存在于模板“${duplicate.templateLabel}”中，请不要重复上传。`);
      }

      const response = await fetch(buildApiUrl('/api/reports/template'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          description,
          sourceType,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'create template failed');

      createdTemplate = json?.item || null;
      if (!createdTemplate?.key) throw new Error('template create failed');

      if (hasFile) {
        const formData = new FormData();
        formData.append('file', templateFile);
        const uploadResponse = await fetch(
          `${buildApiUrl('/api/reports/template-reference')}?templateKey=${encodeURIComponent(createdTemplate.key)}`,
          { method: 'POST', body: formData },
        );
        const uploadJson = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(uploadJson?.error || 'upload template reference failed');
      } else {
        const uploadResponse = await fetch(buildApiUrl('/api/reports/template-reference-link'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateKey: createdTemplate.key,
            url: link,
            label,
          }),
        });
        const uploadJson = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(uploadJson?.error || 'upload template link failed');
      }

      await loadReports();
      setTemplateDraft({
        label: buildDefaultTemplateLabel((data?.templates || []).concat(createdTemplate ? [createdTemplate] : [])),
        description: '',
        link: '',
      });
      setTemplateFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setMessage('模板已上传并加入列表。');
    } catch (uploadError) {
      const shouldCleanup = typeof createdTemplate?.key === 'string' && createdTemplate.key;
      if (shouldCleanup) {
        try {
          await fetch(buildApiUrl(`/api/reports/template/${encodeURIComponent(createdTemplate.key)}`), {
            method: 'DELETE',
          });
        } catch {
          // keep original upload error
        }
      }
      setMessage(uploadError instanceof Error ? uploadError.message : '上传模板失败。');
    } finally {
      setSubmittingKey('');
    }
  }

  if (generatedId) {
    return (
      <div className="app-shell">
        <Sidebar sourceItems={sidebarSources} currentPath="/reports" />
        <main className="main-panel">
          <header className="topbar">
            <div>
              <h2>报表中心</h2>
              <p>查看单份报表详情，并继续分享或下载结果。</p>
            </div>
          </header>

          {!generatedReport ? (
            <section className="card report-empty-card">
              <h4>报表不存在</h4>
              <p>当前链接对应的报表记录不存在，可能已经被删除。</p>
            </section>
          ) : (
            <section className="card documents-card report-single-view">
              <div className="panel-header">
                <div>
                  <h3>{generatedReport.title}</h3>
                  <p>生成时间：{formatGeneratedReportTime(generatedReport.createdAt)}</p>
                </div>
                <SingleReportActions item={generatedReport} />
              </div>
              <GeneratedReportDetail item={generatedReport} />
            </section>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className={`app-shell ${mobileViewport ? 'app-shell-reports-simple' : ''}`.trim()}>
      <Sidebar sourceItems={sidebarSources} currentPath="/reports" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>报表中心</h2>
            <p>
              {mobileViewport
                ? '移动端按单栏浏览模板、机器人和报表结果。'
                : 'PC 端恢复完整报表工作台，左侧管理模板与机器人，右侧查看已出报表。'}
            </p>
          </div>
        </header>

        {error ? <p>{error}</p> : null}
        <div className="page-note">
          本系统是基于 PC 的本地助手，推荐使用 PC 大屏幕打开；移动端更适合查看报表和做轻量配置。
        </div>
        {message ? <div className="page-note">{message}</div> : null}

        {data ? (
          <section className={`reports-workbench ${mobileViewport ? 'reports-workbench-simple' : ''}`.trim()}>
            <div style={{ display: 'grid', gap: 20, minWidth: 0 }}>
              <section className="card documents-card reports-templates-panel">
                <div className="panel-header">
                  <div>
                    <h3>报表模板上传</h3>
                    <p>支持 Word、PPT、表格、图片和网页链接。上传后统一沉淀为模板参考。</p>
                  </div>
                </div>

                <section className="capture-task-card">
                  <div className="capture-task-heading">
                    <div>
                      <h4>上传模板</h4>
                      <p>保留模板名称和说明即可，文件与网页链接二选一。</p>
                    </div>
                  </div>

                  <div className="filter-row report-template-create-row">
                    <input
                      className="filter-input"
                      placeholder="模板名称"
                      value={templateDraft.label}
                      onChange={(event) => setTemplateDraft((prev) => ({ ...prev, label: event.target.value }))}
                    />
                    <input
                      className="filter-input"
                      placeholder="模板说明（可选）"
                      value={templateDraft.description}
                      onChange={(event) => setTemplateDraft((prev) => ({ ...prev, description: event.target.value }))}
                    />
                  </div>

                  <div className="filter-row report-template-create-row">
                    <input
                      ref={fileInputRef}
                      className="filter-input"
                      type="file"
                      accept="image/*,.doc,.docx,.rtf,.odt,.ppt,.pptx,.pptm,.xls,.xlsx,.csv,.tsv,.ods"
                      onChange={(event) => setTemplateFile(event.target.files?.[0] || null)}
                    />
                    <input
                      className="filter-input"
                      placeholder="或填写网页链接，例如 https://example.com/template"
                      value={templateDraft.link}
                      onChange={(event) => setTemplateDraft((prev) => ({ ...prev, link: event.target.value }))}
                    />
                    <button
                      className="primary-btn"
                      type="button"
                      onClick={() => void uploadTemplate()}
                      disabled={submittingKey === 'upload-template'}
                    >
                      {submittingKey === 'upload-template' ? '上传中...' : '上传模板'}
                    </button>
                  </div>

                  <div className="capture-task-meta">
                    {templateFile
                      ? `已选择文件：${templateFile.name}`
                      : templateDraft.link
                        ? `已填写链接：${templateDraft.link}`
                        : '支持上传 Word、PPT、表格、图片，或直接填写网页链接。'}
                  </div>
                </section>

                {!uploadedTemplateItems.length ? (
                  <section className="report-empty-card">
                    <h4>还没有上传模板</h4>
                    <p>上传完成后，这里会列出所有模板文件和网页链接的详细信息。</p>
                  </section>
                ) : (
                  <div className="capture-result-list reports-scroll-panel report-upload-list">
                    {uploadedTemplateItems.map((item) => (
                      <UploadedTemplateItem
                        key={item.id}
                        item={item}
                        submittingKey={submittingKey}
                        onDeleteTemplate={deleteTemplate}
                        onDeleteReference={deleteTemplateReference}
                        buildDownloadUrl={buildTemplateReferenceDownloadUrl}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section className="card documents-card reports-bot-panel">
                <div className="panel-header">
                  <div>
                    <h3>输出机器人</h3>
                    <p>
                      {mobileViewport
                        ? '移动端保留机器人概览。'
                        : 'PC 端恢复机器人可见库和权限编辑，移动端仍保持概览优先。'}
                    </p>
                  </div>
                </div>

                <ConnectedBotsSummary
                  items={botItems}
                  libraries={documentLibraries}
                  compact={mobileViewport}
                  emptyTitle="当前还没有可用输出机器人"
                  emptyText="机器人接通后会自动出现在这里。"
                />

                {!mobileViewport && botManageEnabled ? (
                  <ConnectedBotAccessEditor
                    items={botItems}
                    libraries={documentLibraries}
                    manageEnabled={botManageEnabled}
                    onSave={saveConnectedBot}
                  />
                ) : null}
              </section>
            </div>

            <ReportResultsPanel
              title="已出报表"
              description={mobileViewport ? '移动端按单栏查看报表结果。' : 'PC 端右侧固定查看已出报表、下载和删除。'}
              items={outputRecords}
              selectedReportId={selectedReportId}
              onSelectReport={setSelectedReportId}
              onDeleteReport={deleteReport}
              mobileViewport={mobileViewport}
              className="reports-results-panel"
            />
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="app-shell"><main className="main-panel"><p>加载报表中...</p></main></div>}>
      <ReportsPageContent />
    </Suspense>
  );
}
