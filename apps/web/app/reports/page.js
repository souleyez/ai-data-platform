'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import GeneratedReportDetail from '../components/GeneratedReportDetail';
import Sidebar from '../components/Sidebar';
import { buildApiUrl } from '../lib/config';
import {
  copyGeneratedReportLink,
  downloadGeneratedReport,
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

function TemplateCard({ template, submittingKey, onSetDefault, onUploadReference }) {
  return (
    <details className="capture-result-item" open={Boolean(template.isDefault)}>
      <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span>
          <strong>{template.label}</strong>
          <span style={{ marginLeft: 8, color: '#64748b' }}>{formatTemplateKind(template.type)}</span>
        </span>
        <span style={{ color: '#64748b' }}>
          {template.isDefault ? '当前默认模板' : `参考文件 ${template.referenceImages?.length || 0} 份`}
        </span>
      </summary>

      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        <div className="capture-task-note">{template.description}</div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="ghost-btn"
            type="button"
            disabled={submittingKey === `default:${template.key}` || template.isDefault}
            onClick={() => onSetDefault(template.key)}
          >
            {template.isDefault ? '当前默认' : '设为默认'}
          </button>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontWeight: 700 }}>上传模板参考文件</div>
          <input
            type="file"
            accept="image/*,.pdf,.ppt,.pptx,.xlsx,.xls,.doc,.docx"
            onChange={(event) => onUploadReference(template.key, event.target.files?.[0])}
            disabled={submittingKey === `upload:${template.key}`}
          />
          {template.referenceImages?.length ? (
            <div className="capture-result-list">
              {template.referenceImages.map((file) => (
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
      </div>
    </details>
  );
}

function OutputCard({ item }) {
  return (
    <details className="capture-result-item">
      <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span>
          <strong>{item.title}</strong>
          <span style={{ marginLeft: 8, color: '#64748b' }}>{item.templateLabel || item.outputType}</span>
        </span>
        <span style={{ color: '#64748b' }}>{formatDateTime(item.createdAt)}</span>
      </summary>

      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        <div className="capture-task-meta">
          知识库：{item.groupLabel || '-'} · 输出形式：{item.outputType} · 来源：{item.source === 'chat' ? '聊天输出' : '报表中心'}
        </div>
        <GeneratedReportDetail item={item} />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="ghost-btn" type="button" onClick={() => void copyGeneratedReportLink(item)}>
            复制链接
          </button>
          <button className="primary-btn" type="button" onClick={() => downloadGeneratedReport(item)}>
            下载报表
          </button>
        </div>
      </div>
    </details>
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
  const [templateDraft, setTemplateDraft] = useState({
    label: '',
    type: 'table',
    description: '',
  });

  async function loadReports() {
    try {
      const response = await fetch(buildApiUrl('/api/reports'), { cache: 'no-store' });
      if (!response.ok) throw new Error('load reports failed');
      const json = await response.json();
      setData(normalizeReportsResponse(json));
      setError('');
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
        // keep fallback
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
      setTemplateDraft({ label: '', type: 'table', description: '' });
      setMessage(json?.message || '已新增模板。');
      await loadReports();
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

  async function uploadTemplateReference(templateKey, file) {
    if (!file) return;
    try {
      setSubmittingKey(`upload:${templateKey}`);
      setMessage('');
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(
        `${buildApiUrl('/api/reports/template-reference')}?templateKey=${encodeURIComponent(templateKey)}`,
        {
          method: 'POST',
          body: formData,
        },
      );
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'upload template reference failed');
      setMessage(json?.message || '已上传模板参考文件。');
      await loadReports();
    } catch (uploadError) {
      setMessage(uploadError instanceof Error ? uploadError.message : '上传模板参考文件失败。');
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
              <p>查看已出报表详情，并继续下载或转发。后续如需调整，请回到首页右侧当前报表工作区。</p>
            </div>
          </header>

          {!generatedReport ? (
            <section className="card report-empty-card">
              <h4>报表不存在</h4>
              <p>当前链接对应的报表记录不存在，可能已被删除。</p>
            </section>
          ) : (
            <section className="card documents-card" style={{ display: 'grid', gap: 16 }}>
              <div className="panel-header">
                <div>
                  <h3>{generatedReport.title}</h3>
                  <p>生成时间：{formatGeneratedReportTime(generatedReport.createdAt)}</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="ghost-btn" type="button" onClick={() => void copyGeneratedReportLink(generatedReport)}>
                    复制链接
                  </button>
                  <button className="primary-btn" type="button" onClick={() => downloadGeneratedReport(generatedReport)}>
                    下载报表
                  </button>
                </div>
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
            <p>统一管理共享输出模板和已出报表。报表调整统一放在首页右侧当前报表工作区。</p>
          </div>
        </header>

        {error ? <p>{error}</p> : null}
        {message ? <div className="page-note">{message}</div> : null}

        {data ? (
          <section className="documents-layout">
            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>输出模板</h3>
                  <p>模板对所有知识库共享。可同时维护多份静态页、PPT、表格和文档模板，并上传参考文件辅助约束输出形式。</p>
                </div>
              </div>

              <div className="filter-row" style={{ marginBottom: 16 }}>
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
                <input
                  className="filter-input"
                  placeholder="模板说明"
                  value={templateDraft.description}
                  onChange={(event) => setTemplateDraft((prev) => ({ ...prev, description: event.target.value }))}
                />
                <button className="primary-btn" type="button" onClick={createTemplate} disabled={submittingKey === 'create-template'}>
                  {submittingKey === 'create-template' ? '创建中...' : '新增模板'}
                </button>
              </div>

              <div className="capture-result-list">
                {(data.templates || []).map((template) => (
                  <TemplateCard
                    key={template.key}
                    template={template}
                    submittingKey={submittingKey}
                    onSetDefault={setTemplateDefault}
                    onUploadReference={uploadTemplateReference}
                  />
                ))}
              </div>
            </section>

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>已出报表</h3>
                  <p>统一查看所有已出报表。需要继续调整时，请回到首页右侧当前报表工作区直接对话修改。</p>
                </div>
              </div>

              <div className="capture-result-list">
                {outputRecords.map((item) => <OutputCard key={item.id} item={item} />)}
                {!outputRecords.length ? <div className="capture-task-note">当前还没有已出报表。</div> : null}
              </div>
            </section>
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
