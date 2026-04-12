'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ConnectedBotAccessEditor from '../components/ConnectedBotAccessEditor';
import GeneratedReportDetail from '../components/GeneratedReportDetail';
import Sidebar from '../components/Sidebar';
import WorkspaceDesktopShell from '../components/WorkspaceDesktopShell';
import {
  createBot,
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
import { createDocumentLibrary } from '../documents/api';

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

function buildTemplateLabelFromFileName(fileName, fallbackLabel) {
  const trimmed = String(fileName || '').trim();
  if (!trimmed) return fallbackLabel;
  const normalized = trimmed.replace(/\.[^.]+$/, '').trim();
  return normalized || fallbackLabel;
}

const REPORT_LAYOUT_VARIANTS = [
  { value: '', label: '默认推断' },
  { value: 'insight-brief', label: 'Insight Brief' },
  { value: 'risk-brief', label: 'Risk Brief' },
  { value: 'operations-cockpit', label: 'Operations Cockpit' },
  { value: 'talent-showcase', label: 'Talent Showcase' },
  { value: 'research-brief', label: 'Research Brief' },
  { value: 'solution-overview', label: 'Solution Overview' },
];

function UploadedTemplateItem({
  item,
  submittingKey,
  editingTemplateId,
  editingTemplateDraft,
  onEditTemplate,
  onChangeTemplateDraft,
  onCancelTemplateEdit,
  onSaveTemplateEdit,
  buildDownloadUrl,
  onDeleteTemplate,
  onDeleteReference,
}) {
  const isPlaceholder = String(item.id || '').startsWith('placeholder:');
  const deletingTemplate = submittingKey === `delete-template:${item.templateKey}`;
  const deletingReference = submittingKey === `delete-reference:${item.id}`;
  const savingTemplate = submittingKey === `update-template:${item.templateKey}`;
  const isEditing = editingTemplateId === item.id;

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

      {isEditing ? (
        <div className="report-template-inline-editor">
          <div className="filter-row report-template-create-row">
            <input
              className="filter-input"
              placeholder="模板名称"
              value={editingTemplateDraft.label}
              onChange={(event) => onChangeTemplateDraft('label', event.target.value)}
            />
            <input
              className="filter-input"
              placeholder="模板说明（可选）"
              value={editingTemplateDraft.description}
              onChange={(event) => onChangeTemplateDraft('description', event.target.value)}
            />
            <select
              className="filter-input"
              value={editingTemplateDraft.preferredLayoutVariant}
              onChange={(event) => onChangeTemplateDraft('preferredLayoutVariant', event.target.value)}
            >
              {REPORT_LAYOUT_VARIANTS.map((option) => (
                <option key={option.value || 'default'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="report-template-actions">
            <button
              className="primary-btn"
              type="button"
              disabled={savingTemplate}
              onClick={() => onSaveTemplateEdit(item)}
            >
              {savingTemplate ? '保存中...' : '保存模板'}
            </button>
            <button
              className="ghost-btn"
              type="button"
              disabled={savingTemplate}
              onClick={onCancelTemplateEdit}
            >
              取消编辑
            </button>
          </div>
        </div>
      ) : null}

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
          <span>页面布局</span>
          <strong>{item.preferredLayoutVariant || '默认推断'}</strong>
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
          disabled={deletingTemplate || deletingReference || savingTemplate}
          onClick={() => onEditTemplate(item)}
        >
          {isEditing ? '编辑中...' : '编辑模板'}
        </button>

        <button
          className="ghost-btn"
          type="button"
          disabled={deletingTemplate || deletingReference || savingTemplate}
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
  const [editingTemplateId, setEditingTemplateId] = useState('');
  const [editingTemplateDraft, setEditingTemplateDraft] = useState({
    label: '',
    description: '',
    preferredLayoutVariant: '',
  });
  const [templateDraft, setTemplateDraft] = useState({
    label: '',
    description: '',
    link: '',
    preferredLayoutVariant: '',
  });
  const [templateFile, setTemplateFile] = useState(null);
  const [botItems, setBotItems] = useState([]);
  const [botManageEnabled, setBotManageEnabled] = useState(false);
  const [documentLibraries, setDocumentLibraries] = useState([]);
  const [selectedLibraryKeys, setSelectedLibraryKeys] = useState([]);

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

  async function handleCreateLibrary(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return false;
    try {
      const created = await createDocumentLibrary(trimmed, '');
      await loadBotContext();
      const createdKey = String(created?.item?.key || '').trim();
      if (createdKey) {
        setSelectedLibraryKeys((current) => (
          current.includes(createdKey) ? current : [...current, createdKey]
        ));
      }
      setMessage(`已新建数据集：${trimmed}`);
      return true;
    } catch {
      setMessage('新建数据集失败。');
      return false;
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

  const scopedLibraries = useMemo(
    () => (selectedLibraryKeys.length
      ? documentLibraries.filter((item) => selectedLibraryKeys.includes(item.key))
      : documentLibraries),
    [documentLibraries, selectedLibraryKeys],
  );

  const selectedReportGroup = useMemo(
    () => (selectedLibraryKeys.length === 1
      ? (data?.groups || []).find((item) => item.key === selectedLibraryKeys[0]) || null
      : null),
    [data, selectedLibraryKeys],
  );

  const selectedGroupTemplateKeys = useMemo(() => {
    if (!selectedLibraryKeys.length) return null;
    const keys = new Set();
    for (const group of data?.groups || []) {
      if (!selectedLibraryKeys.includes(group.key)) continue;
      for (const template of Array.isArray(group.templates) ? group.templates : []) {
        if (template?.key) keys.add(template.key);
      }
      if (group.defaultTemplateKey) keys.add(group.defaultTemplateKey);
    }
    return keys;
  }, [data, selectedLibraryKeys]);

  const uploadedTemplateItems = useMemo(() => {
    const items = buildUploadedTemplateItems(data?.templates || []);
    if (!selectedGroupTemplateKeys) return items;
    return items.filter((item) => selectedGroupTemplateKeys.has(item.templateKey));
  }, [data, selectedGroupTemplateKeys]);

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

  function buildTemplateReferenceDownloadUrl(item) {
    return `${buildApiUrl(`/api/reports/template-reference/${encodeURIComponent(item.id)}/download`)}?templateKey=${encodeURIComponent(item.templateKey)}`;
  }

  async function saveConnectedBot(botId, payload) {
    await updateBot(botId, payload);
    await loadBotContext();
  }

  async function createConnectedBot(payload) {
    const created = await createBot(payload);
    await loadBotContext();
    return created;
  }

  function startEditingTemplate(item) {
    setEditingTemplateId(item.id);
    setEditingTemplateDraft({
      label: String(item.templateLabel || '').trim(),
      description: String(item.description || '').trim(),
      preferredLayoutVariant: String(item.preferredLayoutVariant || '').trim(),
    });
  }

  function cancelEditingTemplate() {
    setEditingTemplateId('');
    setEditingTemplateDraft({
      label: '',
      description: '',
      preferredLayoutVariant: '',
    });
  }

  function updateEditingTemplateDraft(field, value) {
    setEditingTemplateDraft((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function saveTemplateEdit(item) {
    const label = String(editingTemplateDraft.label || '').trim();
    const description = String(editingTemplateDraft.description || '').trim();
    const preferredLayoutVariant = String(editingTemplateDraft.preferredLayoutVariant || '').trim();

    if (!label) {
      setMessage('模板名称不能为空。');
      return;
    }

    try {
      setSubmittingKey(`update-template:${item.templateKey}`);
      setMessage('');
      const response = await fetch(buildApiUrl(`/api/reports/template/${encodeURIComponent(item.templateKey)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          description,
          preferredLayoutVariant: preferredLayoutVariant || undefined,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'update template failed');
      await loadReports();
      cancelEditingTemplate();
      setMessage(json?.message || '模板已更新。');
    } catch (updateError) {
      setMessage(updateError instanceof Error ? updateError.message : '更新模板失败。');
    } finally {
      setSubmittingKey('');
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
    const label = buildTemplateLabelFromFileName(
      templateFile?.name,
      String(templateDraft.label || '').trim() || buildDefaultTemplateLabel(data?.templates || []),
    );
    const description = '';
    const link = '';
    const preferredLayoutVariant = '';
    const hasFile = Boolean(templateFile);
    let createdTemplate = null;

    if (!selectedReportGroup?.key) {
      setMessage('请先在左侧只选中一个数据集分组。');
      return;
    }
    if (!hasFile) {
      setMessage('请先选择模板文件。');
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
        url: link || '',
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
          preferredLayoutVariant: preferredLayoutVariant || undefined,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'create template failed');

      createdTemplate = json?.item || null;
      if (!createdTemplate?.key) throw new Error('template create failed');

      const formData = new FormData();
      formData.append('file', templateFile);
      const uploadResponse = await fetch(
        `${buildApiUrl('/api/reports/template-reference')}?templateKey=${encodeURIComponent(createdTemplate.key)}`,
        { method: 'POST', body: formData },
      );
      const uploadJson = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(uploadJson?.error || 'upload template reference failed');

      const groupResponse = await fetch(buildApiUrl('/api/reports/group-template'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupKey: selectedReportGroup.key,
          templateKey: createdTemplate.key,
        }),
      });
      const groupJson = await groupResponse.json();
      if (!groupResponse.ok) throw new Error(groupJson?.error || 'set group template failed');

      await loadReports();
      setTemplateDraft({
        label: buildDefaultTemplateLabel((data?.templates || []).concat(createdTemplate ? [createdTemplate] : [])),
        description: '',
        link: '',
        preferredLayoutVariant: '',
      });
      setTemplateFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setMessage(`模板已上传，并已设为“${selectedReportGroup.label}”默认模板。`);
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
    if (!mobileViewport) {
      return (
        <WorkspaceDesktopShell
          currentPath="/reports"
          sourceItems={sidebarSources}
          libraries={documentLibraries}
          totalDocuments={documentLibraries.reduce((total, item) => total + Number(item?.documentCount || 0), 0)}
          selectedKeys={generatedReport?.groupKey ? [generatedReport.groupKey] : selectedLibraryKeys}
          onToggleLibrary={(libraryKey) => {
            setSelectedLibraryKeys((current) => (
              current.includes(libraryKey)
                ? current.filter((item) => item !== libraryKey)
                : [...current, libraryKey]
            ));
          }}
          onClearSelection={() => setSelectedLibraryKeys([])}
          onCreateLibrary={handleCreateLibrary}
          railSelectionSummaryLabel={`已选 ${(generatedReport?.groupKey ? 1 : selectedLibraryKeys.length)}`}
        >
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
        </WorkspaceDesktopShell>
      );
    }

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

  const reportsContent = (
    <>
      {error ? <p>{error}</p> : null}
      {message ? <div className="page-note">{message}</div> : null}

      {data ? (
        <>
          <section className={`reports-workbench reports-workbench-single ${mobileViewport ? 'reports-workbench-simple' : ''}`.trim()}>
            <div className={`reports-management-grid ${mobileViewport ? 'reports-management-grid-simple' : ''}`.trim()}>
              <section className="card documents-card reports-templates-panel">
                <div className="panel-header">
                  <div>
                      <h3>报表模板上传</h3>
                      <p>{selectedReportGroup ? `当前数据集：${selectedReportGroup.label}` : '左侧只选中一个数据集分组后上传模板。'}</p>
                    </div>
                  </div>

                  <section className="capture-task-card">
                    <div className="capture-task-heading">
                      <div>
                        <h4>上传模板</h4>
                        <p>模板会直接挂到当前选中的数据集分组。</p>
                      </div>
                    </div>

                    <div className="filter-row report-template-create-row">
                      <div className="report-template-group-pill">
                        {selectedReportGroup ? selectedReportGroup.label : '未锁定数据集分组'}
                      </div>
                      <input
                        ref={fileInputRef}
                        className="filter-input"
                        type="file"
                        accept="image/*,.doc,.docx,.rtf,.odt,.ppt,.pptx,.pptm,.xls,.xlsx,.csv,.tsv,.ods"
                        onChange={(event) => setTemplateFile(event.target.files?.[0] || null)}
                      />
                      <button
                        className="primary-btn"
                        type="button"
                        onClick={() => void uploadTemplate()}
                        disabled={submittingKey === 'upload-template' || !selectedReportGroup}
                      >
                        {submittingKey === 'upload-template' ? '上传中...' : '上传模板'}
                      </button>
                    </div>

                    <div className="capture-task-meta">
                      {templateFile
                        ? `已选择文件：${templateFile.name}`
                        : '支持 Word、PPT、表格、图片模板。'}
                    </div>
                  </section>

                {!uploadedTemplateItems.length ? (
                  <section className="report-empty-card">
                    <h4>{selectedLibraryKeys.length ? '当前分组还没有模板' : '还没有上传模板'}</h4>
                    <p>{selectedLibraryKeys.length ? '左侧切换分组后，这里的模板列表会跟着变化。' : '上传完成后，这里会列出模板文件。'}</p>
                  </section>
                ) : (
                  <div className="capture-result-list reports-scroll-panel report-upload-list">
                    {uploadedTemplateItems.map((item) => (
                      <UploadedTemplateItem
                        key={item.id}
                        item={item}
                        submittingKey={submittingKey}
                        editingTemplateId={editingTemplateId}
                        editingTemplateDraft={editingTemplateDraft}
                        onEditTemplate={startEditingTemplate}
                        onChangeTemplateDraft={updateEditingTemplateDraft}
                        onCancelTemplateEdit={cancelEditingTemplate}
                        onSaveTemplateEdit={saveTemplateEdit}
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
                    <p>{selectedLibraryKeys.length ? `当前按左侧已选 ${selectedLibraryKeys.length} 个数据集分组收口权限编辑。` : '左侧选择数据集分组后，这里的权限编辑会自动收口。'}</p>
                  </div>
                </div>

                <ConnectedBotAccessEditor
                  items={botItems}
                  libraries={scopedLibraries}
                  manageEnabled={botManageEnabled}
                  onSave={saveConnectedBot}
                  onCreate={createConnectedBot}
                />
              </section>
            </div>
          </section>
        </>
      ) : null}
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
      >
        {reportsContent}
      </WorkspaceDesktopShell>
    );
  }

  return (
    <div className="app-shell app-shell-reports-simple">
      <Sidebar sourceItems={sidebarSources} currentPath="/reports" />
      <main className="main-panel">
        {reportsContent}
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
