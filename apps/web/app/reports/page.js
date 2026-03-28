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

function formatTemplateKind(type) {
  if (type === 'static-page') return '数据可视化静态页';
  if (type === 'ppt') return 'PPT';
  if (type === 'document') return '文档';
  return '表格';
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

function TemplateCard({ template, submittingKey, onSetDefault }) {
  const referenceFiles = Array.isArray(template.referenceImages) ? template.referenceImages : [];

  return (
    <details className="capture-result-item" open={Boolean(template.isDefault)}>
      <summary className="report-template-summary">
        <span>
          <strong>{template.label}</strong>
          <span className="report-template-kind">{formatTemplateKind(template.type)}</span>
        </span>
        <span className="report-template-meta">
          {template.isDefault ? '当前默认模板' : `参考文件 ${referenceFiles.length} 份`}
        </span>
      </summary>

      <div className="report-template-body">
        <div className="capture-task-note">{template.description || '暂未填写模板说明。'}</div>

        <div className="report-template-actions">
          <button
            className="ghost-btn"
            type="button"
            disabled={submittingKey === `default:${template.key}` || template.isDefault}
            onClick={() => onSetDefault(template.key)}
          >
            {template.isDefault ? '当前默认' : '设为默认'}
          </button>
        </div>

        <div className="capture-task-note">
          如需按自定义模板输出，请在提问时精确指定模板全名：<code>{template.label}</code>
        </div>

        {referenceFiles.length ? (
          <div className="capture-result-list">
            {referenceFiles.map((file) => (
              <div key={file.id} className="capture-result-item">
                <strong>{file.originalName}</strong>
                <div className="capture-task-meta">上传时间：{formatDateTime(file.uploadedAt)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="capture-task-note">当前还没有参考文件。</div>
        )}
      </div>
    </details>
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
    type: 'static-page',
    description: '',
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

  async function createTemplate() {
    const label = String(templateDraft.label || '').trim();
    if (!label) {
      setMessage('模板名称不能为空。');
      return;
    }

    try {
      setSubmittingKey('create-template');
      setMessage('');
      const response = await fetch(buildApiUrl('/api/reports/template'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateDraft),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'create template failed');

      const createdTemplate = json?.item || null;
      if (templateFile && createdTemplate?.key) {
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
      }

      await loadReports();
      setTemplateDraft({
        label: buildDefaultTemplateLabel((data?.templates || []).concat(createdTemplate ? [createdTemplate] : [])),
        type: 'static-page',
        description: '',
      });
      setTemplateFile(null);
      setMessage(templateFile ? '已新增模板并上传参考文件。' : json?.message || '已新增模板。');
    } catch (createError) {
      setMessage(createError instanceof Error ? createError.message : '新增模板失败。');
    } finally {
      setSubmittingKey('');
    }
  }

  async function setTemplateDefault(templateKey) {
    try {
      setSubmittingKey(`default:${templateKey}`);
      setMessage('');
      const response = await fetch(buildApiUrl(`/api/reports/template/${encodeURIComponent(templateKey)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'update template failed');
      setMessage(json?.message || '已更新默认模板。');
      await loadReports();
    } catch (updateError) {
      setMessage(updateError instanceof Error ? updateError.message : '更新默认模板失败。');
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
            <p>左侧管理共享输出模板，右侧统一查看已出报表。自然语言调整报表统一放在首页右侧当前报表区。</p>
          </div>
        </header>

        {error ? <p>{error}</p> : null}
        {message ? <div className="page-note">{message}</div> : null}

        {data ? (
          <section className="reports-workbench">
            <section className="card documents-card reports-templates-panel">
              <div className="panel-header">
                <div>
                  <h3>输出模板</h3>
                  <p>模板对所有知识库共享。默认输出形式是数据可视化静态页，也支持维护多份 PPT、表格和文档模板。</p>
                </div>
              </div>

              <section className="capture-task-card">
                <div className="capture-task-heading">
                  <div>
                    <h4>模板上传窗口</h4>
                    <p>新增模板时请先命名。默认命名会按当天日期自动生成，如 `260328a`。</p>
                  </div>
                </div>

                <div className="capture-task-note">
                  如果要按自定义模板输出，必须在提问时精确指定模板全名。
                </div>

                <div className="filter-row report-template-create-row">
                  <input
                    className="filter-input"
                    placeholder="模板名称"
                    value={templateDraft.label}
                    onChange={(event) => setTemplateDraft((prev) => ({ ...prev, label: event.target.value }))}
                  />
                  <select
                    className="filter-input"
                    value={templateDraft.type}
                    onChange={(event) => setTemplateDraft((prev) => ({ ...prev, type: event.target.value }))}
                  >
                    <option value="static-page">数据可视化静态页</option>
                    <option value="ppt">PPT</option>
                    <option value="table">表格</option>
                    <option value="document">文档</option>
                  </select>
                </div>

                <div className="filter-row report-template-create-row">
                  <input
                    className="filter-input"
                    placeholder="模板说明"
                    value={templateDraft.description}
                    onChange={(event) => setTemplateDraft((prev) => ({ ...prev, description: event.target.value }))}
                  />
                  <input
                    className="filter-input"
                    type="file"
                    accept="image/*,.pdf,.ppt,.pptx,.xlsx,.xls,.doc,.docx"
                    onChange={(event) => setTemplateFile(event.target.files?.[0] || null)}
                  />
                  <button
                    className="primary-btn"
                    type="button"
                    onClick={() => void createTemplate()}
                    disabled={submittingKey === 'create-template'}
                  >
                    {submittingKey === 'create-template' ? '上传中...' : '上传模板'}
                  </button>
                </div>

                <div className="capture-task-meta">
                  {templateFile ? `已选择参考文件：${templateFile.name}` : '可选上传参考文件，用于帮助系统贴合你的模板结构。'}
                </div>
              </section>

              <div className="capture-result-list reports-scroll-panel">
                {(data.templates || []).map((template) => (
                  <TemplateCard
                    key={template.key}
                    template={template}
                    submittingKey={submittingKey}
                    onSetDefault={setTemplateDefault}
                  />
                ))}
              </div>
            </section>

            <ReportResultsPanel
              title="已出报表"
              description="统一查看所有已出报表，并使用链接、表格、PPT 或纯文字方式继续分享。"
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
