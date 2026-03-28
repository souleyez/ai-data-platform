'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import GeneratedReportDetail from '../components/GeneratedReportDetail';
import ReportResultsPanel from '../components/ReportResultsPanel';
import Sidebar from '../components/Sidebar';
import { buildApiUrl } from '../lib/config';
import {
  copyGeneratedReportLink,
  downloadGeneratedReportAs,
  formatGeneratedReportTime,
  normalizeGeneratedReportRecord,
} from '../lib/generated-reports';
import { normalizeDatasourceResponse, normalizeReportsResponse } from '../lib/types';
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

function indexToLetters(index) {
  let value = index;
  let result = '';
  do {
    result = String.fromCharCode(97 + (value % 26)) + result;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return result;
}

function buildDefaultTemplateLabel(templates = []) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const prefix = `${yy}${mm}${dd}`;

  const usedLabels = new Set(
    (templates || [])
      .map((template) => String(template?.label || '').trim().toLowerCase())
      .filter(Boolean),
  );

  let index = 0;
  while (usedLabels.has(`${prefix}${indexToLetters(index)}`)) {
    index += 1;
  }
  return `${prefix}${indexToLetters(index)}`;
}

function isUserUploadedTemplate(template) {
  const origin = String(template?.origin || '').trim().toLowerCase();
  if (origin) return origin === 'user';
  return !String(template?.key || '').startsWith('shared-');
}

function inferSourceTypeFromFile(file) {
  const fileName = String(file?.name || '').toLowerCase();
  if (/\.(doc|docx|rtf|odt)$/.test(fileName)) return 'word';
  if (/\.(ppt|pptx|pptm|key)$/.test(fileName)) return 'ppt';
  if (/\.(xls|xlsx|csv|tsv|ods)$/.test(fileName)) return 'spreadsheet';
  if (file?.type?.startsWith('image/') || /\.(png|jpg|jpeg|gif|bmp|webp|svg)$/.test(fileName)) return 'image';
  return 'other';
}

function inferSourceTypeFromReference(reference = {}) {
  const sourceType = String(reference?.sourceType || '').trim();
  if (sourceType) return sourceType;

  if (reference?.url) return 'web-link';

  const fileName = String(reference?.originalName || reference?.fileName || '').toLowerCase();
  if (/\.(doc|docx|rtf|odt)$/.test(fileName)) return 'word';
  if (/\.(ppt|pptx|pptm|key)$/.test(fileName)) return 'ppt';
  if (/\.(xls|xlsx|csv|tsv|ods)$/.test(fileName)) return 'spreadsheet';
  if (/\.(png|jpg|jpeg|gif|bmp|webp|svg)$/.test(fileName)) return 'image';
  return 'other';
}

function formatSourceTypeLabel(sourceType) {
  if (sourceType === 'word') return 'WORD';
  if (sourceType === 'ppt') return 'PPT';
  if (sourceType === 'spreadsheet') return '表格';
  if (sourceType === 'image') return '图片';
  if (sourceType === 'web-link') return '网页链接';
  return '其他';
}

function buildUploadedTemplateItems(templates = []) {
  return templates
    .filter(isUserUploadedTemplate)
    .flatMap((template) => {
      const references = Array.isArray(template.referenceImages) ? template.referenceImages : [];
      if (!references.length) {
        return [{
          id: `placeholder:${template.key}`,
          templateKey: template.key,
          templateLabel: template.label,
          description: template.description || '',
          createdAt: template.createdAt || '',
          uploadedAt: template.createdAt || '',
          sourceType: 'other',
          sourceLabel: '待补充',
          uploadName: '仅创建模板记录，尚未附文件或链接',
          relativePath: '',
          url: '',
          mimeType: '',
          size: 0,
        }];
      }

      return references.map((reference, index) => {
        const sourceType = inferSourceTypeFromReference(reference);
        return {
          id: reference?.id || `${template.key}:${index}`,
          templateKey: template.key,
          templateLabel: template.label,
          description: template.description || '',
          createdAt: template.createdAt || '',
          uploadedAt: reference?.uploadedAt || template.createdAt || '',
          sourceType,
          sourceLabel: formatSourceTypeLabel(sourceType),
          uploadName: reference?.url || reference?.originalName || reference?.fileName || template.label,
          relativePath: reference?.relativePath || '',
          url: reference?.url || '',
          mimeType: reference?.mimeType || '',
          size: Number(reference?.size || 0),
        };
      });
    })
    .sort((a, b) => {
      const left = new Date(b.uploadedAt || b.createdAt || 0).getTime();
      const right = new Date(a.uploadedAt || a.createdAt || 0).getTime();
      return left - right;
    });
}

function UploadedTemplateItem({ item }) {
  return (
    <article className="capture-result-item report-upload-item">
      <div className="report-upload-header">
        <div>
          <strong>{item.templateLabel}</strong>
          <div className="report-upload-meta">
            上传时间：{formatDateTime(item.uploadedAt || item.createdAt)}
          </div>
        </div>
        <span className="report-upload-tag">{item.sourceLabel}</span>
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
          <span>模板名</span>
          <strong>{item.templateLabel}</strong>
        </div>
        <div className="report-upload-cell">
          <span>来源类型</span>
          <strong>{item.sourceLabel}</strong>
        </div>
        <div className="report-upload-cell">
          <span>文件大小</span>
          <strong>{formatFileSize(item.size)}</strong>
        </div>
        <div className="report-upload-cell">
          <span>MIME</span>
          <strong>{item.mimeType || '-'}</strong>
        </div>
        <div className="report-upload-cell">
          <span>存储路径</span>
          <strong>{item.relativePath || '-'}</strong>
        </div>
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
        按PPT下载
      </button>
      <button className="ghost-btn" type="button" onClick={() => void downloadGeneratedReportAs(item, 'text')}>
        按纯文字下载
      </button>
    </div>
  );
}

function ReportsPageContent() {
  const searchParams = useSearchParams();
  const generatedId = searchParams.get('generated') || '';
  const fileInputRef = useRef(null);
  const hasAutoSelectedReportRef = useRef(false);
  const [data, setData] = useState(null);
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submittingKey, setSubmittingKey] = useState('');
  const [generatedReport, setGeneratedReport] = useState(null);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [templateDraft, setTemplateDraft] = useState({
    label: '',
    description: '',
    link: '',
  });
  const [templateFile, setTemplateFile] = useState(null);

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

  useEffect(() => {
    void loadReports();

    async function loadDatasources() {
      try {
        const response = await fetch(buildApiUrl('/api/datasources'), { cache: 'no-store' });
        if (!response.ok) throw new Error('load datasources failed');
        const json = await response.json();
        const normalized = normalizeDatasourceResponse(json);
        if (normalized.items.length) setSidebarSources(normalized.items);
      } catch {
        // keep fallback sidebar sources
      }
    }

    void loadDatasources();
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

  async function uploadTemplate() {
    const label = String(templateDraft.label || '').trim();
    const description = String(templateDraft.description || '').trim();
    const link = String(templateDraft.link || '').trim();
    const hasFile = Boolean(templateFile);
    const hasLink = Boolean(link);

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

      const sourceType = hasFile ? inferSourceTypeFromFile(templateFile) : 'web-link';
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

      const createdTemplate = json?.item || null;
      if (!createdTemplate?.key) throw new Error('template create failed');

      if (hasFile) {
        const formData = new FormData();
        formData.append('file', templateFile);
        const uploadResponse = await fetch(
          `${buildApiUrl('/api/reports/template-reference')}?templateKey=${encodeURIComponent(createdTemplate.key)}`,
          {
            method: 'POST',
            body: formData,
          },
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
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/reports" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>报表中心</h2>
            <p>这里只保留两个模块：用户上传的模板、已生成的报表。模板上传不再手动分类，系统会按文件或链接自动识别。</p>
          </div>
        </header>

        {error ? <p>{error}</p> : null}
        {message ? <div className="page-note">{message}</div> : null}

        {data ? (
          <section className="reports-workbench">
            <section className="card documents-card reports-templates-panel">
              <div className="panel-header">
                <div>
                  <h3>用户上传的模板</h3>
                  <p>支持 Word、PPT、表格、图片和网页链接。上传后统一沉淀为模板参考，不再手动分类。</p>
                </div>
              </div>

              <section className="capture-task-card">
                <div className="capture-task-heading">
                  <div>
                    <h4>上传模板</h4>
                    <p>保留模板名和说明即可，文件与网页链接二选一。</p>
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
                    placeholder="或填写网页链接，如 https://example.com/template"
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
                      : '支持上传 Word、PPT、表格、图片，或直接填网页链接。'}
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
                    <UploadedTemplateItem key={item.id} item={item} />
                  ))}
                </div>
              )}
            </section>

            <ReportResultsPanel
              title="已生成的报表"
              description="统一查看所有已生成报表，并继续分享、下载或查看详情。"
              items={outputRecords}
              selectedReportId={selectedReportId}
              onSelectReport={setSelectedReportId}
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
