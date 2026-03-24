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
  loadGeneratedReports,
} from '../lib/generated-reports';
import { normalizeDatasourceResponse, normalizeReportsResponse } from '../lib/types';
import { sourceItems } from '../lib/mock-data';

function StatCard({ label, value, subtle }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {subtle ? <div className="stat-trend neutral">{subtle}</div> : null}
    </div>
  );
}

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

function ReportsPageContent() {
  const searchParams = useSearchParams();
  const generatedId = searchParams.get('generated') || '';
  const [data, setData] = useState(null);
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submittingKey, setSubmittingKey] = useState('');
  const [selectedTemplates, setSelectedTemplates] = useState({});
  const [generatedReport, setGeneratedReport] = useState(null);

  useEffect(() => {
    if (!generatedId) {
      setGeneratedReport(null);
      return;
    }
    const items = loadGeneratedReports();
    setGeneratedReport(items.find((item) => item.id === generatedId) || null);
  }, [generatedId]);

  async function loadReports() {
    try {
      const response = await fetch(buildApiUrl('/api/reports'));
      if (!response.ok) throw new Error('load reports failed');
      const json = await response.json();
      const normalized = normalizeReportsResponse(json);
      setData(normalized);
      setSelectedTemplates(
        Object.fromEntries((normalized.groups || []).map((group) => [group.key, group.defaultTemplateKey])),
      );
    } catch {
      setError('报表接口暂时不可用');
    }
  }

  useEffect(() => {
    void loadReports();

    async function loadDatasources() {
      try {
        const response = await fetch(buildApiUrl('/api/datasources'));
        if (!response.ok) throw new Error('load datasources failed');
        const json = await response.json();
        const normalized = normalizeDatasourceResponse(json);
        if (normalized.items.length) setSidebarSources(normalized.items);
      } catch {
        // keep local fallback
      }
    }

    void loadDatasources();
  }, []);

  const groups = useMemo(() => data?.groups || [], [data]);

  if (generatedId) {
    return (
      <div className="app-shell">
        <Sidebar sourceItems={sidebarSources} currentPath="/reports" />
        <main className="main-panel">
          <header className="topbar">
            <div>
              <h2>AI 知识库</h2>
              <p>生成报表详情页。可继续下载文件，或复制当前静态页链接转发。</p>
            </div>
          </header>

          {!generatedReport ? (
            <section className="card report-empty-card">
              <h4>报表不存在</h4>
              <p>当前链接对应的本地生成报表不存在，可能已被删除。</p>
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

  async function updateGroupTemplate(groupKey, templateKey) {
    try {
      setSubmittingKey(`template:${groupKey}`);
      setMessage('');
      const response = await fetch(buildApiUrl('/api/reports/group-template'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupKey, templateKey }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'update group template failed');
      setMessage(json?.message || '已更新输出方式');
      setSelectedTemplates((prev) => ({ ...prev, [groupKey]: templateKey }));
      await loadReports();
    } catch (updateError) {
      setMessage(updateError instanceof Error ? updateError.message : '更新输出方式失败');
    } finally {
      setSubmittingKey('');
    }
  }

  async function generateReport(groupKey) {
    try {
      setSubmittingKey(`generate:${groupKey}`);
      setMessage('');
      const response = await fetch(buildApiUrl('/api/reports'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupKey,
          templateKey: selectedTemplates[groupKey],
          title: `${groups.find((item) => item.key === groupKey)?.label || groupKey}-${selectedTemplates[groupKey] || 'report'}`,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'generate report failed');
      setMessage(json?.message || '已生成报表');
      await loadReports();
    } catch (generateError) {
      setMessage(generateError instanceof Error ? generateError.message : '生成报表失败');
    } finally {
      setSubmittingKey('');
    }
  }

  async function uploadSample(groupKey, file) {
    if (!file) return;
    try {
      setSubmittingKey(`upload:${groupKey}`);
      setMessage('');
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${buildApiUrl('/api/reports/reference-image')}?groupKey=${encodeURIComponent(groupKey)}`, {
        method: 'POST',
        body: formData,
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'upload sample failed');
      setMessage(json?.message || '已上传参考样例');
      await loadReports();
    } catch (uploadError) {
      setMessage(uploadError instanceof Error ? uploadError.message : '上传参考样例失败');
    } finally {
      setSubmittingKey('');
    }
  }

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/reports" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>AI 知识库</h2>
            <p>报表中心现在严格按文档中心知识库分组输出。每个分组只选择一种当前输出方式，并可上传参考样例。</p>
          </div>
        </header>

        {error ? <p>{error}</p> : null}
        {message ? <div className="page-note">{message}</div> : null}

        {data ? (
          <section className="documents-layout">
            <section className="card stats-grid">
              <StatCard label="知识库分组" value={String(data.meta?.groups || groups.length)} subtle="只来自文档中心分组" />
              <StatCard label="当前模板数" value={String(data.meta?.templates || 0)} subtle="每组只选一个当前输出方式" />
              <StatCard label="历史成型报表" value={String(data.meta?.outputs || 0)} subtle="统一沉淀在底部" />
            </section>

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>知识库分组输出方式</h3>
                  <p>每个知识库分组只保留一个当前输出方式。聊天命中该分组时，也会跟随这里的当前模板输出。</p>
                </div>
              </div>

              <div className="capture-task-grid">
                {groups.map((group) => {
                  const currentTemplateKey = selectedTemplates[group.key] || group.defaultTemplateKey;
                  const currentTemplate = group.templates?.find((item) => item.key === currentTemplateKey);

                  return (
                    <article key={group.key} className="capture-task-card">
                      <div className="capture-task-card-head">
                        <div>
                          <div className="capture-task-title">{group.label}</div>
                          <div className="capture-task-meta">{group.description}</div>
                        </div>
                        <span className="tag neutral-tag">当前：{currentTemplate?.label || '未设置'}</span>
                      </div>

                      <div className="summary-item" style={{ display: 'grid', gap: 10 }}>
                        <div className="summary-key">当前输出方式</div>
                        <select
                          className="filter-input"
                          value={currentTemplateKey}
                          onChange={(event) => updateGroupTemplate(group.key, event.target.value)}
                          disabled={submittingKey === `template:${group.key}`}
                        >
                          {(group.templates || []).map((template) => (
                            <option key={template.key} value={template.key}>
                              {template.label}{template.supported ? '' : '（后续支持）'}
                            </option>
                          ))}
                        </select>
                        <div className="capture-task-note">{currentTemplate?.description || '未配置模板说明'}</div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className="primary-btn"
                          type="button"
                          disabled={submittingKey === `generate:${group.key}` || !currentTemplate?.supported}
                          onClick={() => generateReport(group.key)}
                        >
                          {submittingKey === `generate:${group.key}` ? '生成中...' : currentTemplate?.supported ? '按当前方式生成' : '当前方式暂未开放'}
                        </button>
                      </div>

                      <div className="summary-item" style={{ display: 'grid', gap: 10 }}>
                        <div style={{ fontWeight: 700 }}>参考样例</div>
                        <div className="capture-task-note">上传这个知识库分组的参考样例。后续生成报表和聊天输出时，会按当前模板参考这些样例风格。</div>
                        <input
                          type="file"
                          accept="image/*,.pdf,.ppt,.pptx,.xlsx,.xls,.doc,.docx"
                          onChange={(event) => uploadSample(group.key, event.target.files?.[0])}
                          disabled={submittingKey === `upload:${group.key}`}
                        />
                        <div className="capture-task-meta">当前已上传 {group.referenceImages?.length || 0} 份参考样例</div>
                        {group.referenceImages?.length ? (
                          <div className="capture-result-list">
                            {group.referenceImages.map((image) => (
                              <div key={image.id} className="capture-result-item">
                                <strong>{image.originalName}</strong>
                                <div className="capture-task-meta">上传时间：{formatDateTime(image.uploadedAt)}</div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="card table-card">
              <div className="panel-header">
                <div>
                  <h3>历史输出的成型报表</h3>
                  <p>这里统一展示所有已经生成的表格、静态页和 PPT 记录。</p>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>报表名称</th>
                    <th>所属知识库分组</th>
                    <th>输出方式</th>
                    <th>输出类型</th>
                    <th>触发来源</th>
                    <th>生成时间</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.outputRecords || []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.title}</td>
                      <td>{item.groupLabel}</td>
                      <td>{item.templateLabel}</td>
                      <td>{item.outputType}</td>
                      <td>{item.triggerSource === 'chat' ? '聊天输出' : '报表中心'}</td>
                      <td>{formatDateTime(item.createdAt)}</td>
                    </tr>
                  ))}
                  {!data.outputRecords?.length ? (
                    <tr><td colSpan={6} className="summary-cell">当前还没有历史成型报表。你可以先为某个知识库分组生成一次。</td></tr>
                  ) : null}
                </tbody>
              </table>
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
