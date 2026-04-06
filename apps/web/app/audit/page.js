'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { buildApiUrl } from '../lib/config';
import { normalizeDatasourceResponse } from '../lib/types';
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

function formatDate(value) {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 16);
}

function formatRatio(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatSize(value) {
  const gb = Number(value || 0) / 1024 / 1024 / 1024;
  return `${gb.toFixed(1)} GB`;
}

function renderStorageState(value) {
  if (value === 'structured-only') return '仅保留结构化数据';
  if (value === 'live') return '保留原文件';
  return '无原文件';
}

export default function AuditPage() {
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState('');

  async function loadAll() {
    setLoading(true);
    try {
      const [datasourceResponse, auditResponse] = await Promise.all([
        fetch(buildApiUrl('/api/datasources')),
        fetch(buildApiUrl('/api/audit')),
      ]);

      if (datasourceResponse.ok) {
        const datasourceJson = await datasourceResponse.json();
        const normalized = normalizeDatasourceResponse(datasourceJson);
        if (normalized.items.length) setSidebarSources(normalized.items);
      }

      if (auditResponse.ok) {
        setAudit(await auditResponse.json());
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function runAction(actionId, path, body = {}) {
    setActingId(actionId);
    try {
      await fetch(buildApiUrl(path), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      await loadAll();
    } finally {
      setActingId('');
    }
  }

  const summary = useMemo(() => {
    if (!audit) return null;
    return {
      storage: audit.storage,
      staleDays: audit.staleDays,
      hardDeleteDays: audit.hardDeleteDays,
      staleDocs: (audit.documents || []).filter((item) => item.cleanupRecommended || item.hardDeleteRecommended),
      staleCaptures: (audit.captureTasks || []).filter((item) => item.cleanupRecommended || item.hardDeleteRecommended),
      logs: audit.logs || [],
    };
  }, [audit]);

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/audit" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>AI审计</h2>
            <p>把“清理原文件”和“彻底删除”拆开管理，长期低引用资料优先只删原件、保留结构化结果。</p>
          </div>
        </header>

        <section className="documents-layout">
          <section className="card stats-grid">
            <StatCard
              label="剩余存储"
              value={summary ? formatRatio(summary.storage?.freeRatio) : '-'}
              subtle={summary ? `自动清理阈值 ${formatRatio(summary.storage?.freeThresholdRatio)}` : ''}
            />
            <StatCard
              label="建议清理原件"
              value={summary ? String(summary.staleDocs.filter((item) => item.cleanupRecommended).length + summary.staleCaptures.filter((item) => item.cleanupRecommended).length) : '-'}
              subtle={`超过 ${summary?.staleDays || 90} 天且问答/报表无引用`}
            />
            <StatCard
              label="相似原件待清理"
              value={summary ? String(summary.staleDocs.filter((item) => item.similarityCleanupRecommended).length) : '-'}
              subtle="保留结构化数据，优先删高相似原件"
            />
            <StatCard
              label="建议彻底删除"
              value={summary ? String(summary.staleDocs.filter((item) => item.hardDeleteRecommended).length + summary.staleCaptures.filter((item) => item.hardDeleteRecommended).length) : '-'}
              subtle={`超过 ${summary?.hardDeleteDays || 180} 天且长期无引用`}
            />
          </section>

          <section className="card table-card">
            <div className="panel-header">
              <div>
                <h3>存储策略</h3>
                <p>自动策略只清理原文件并保留结构化结果；彻底删除只对长期无引用对象开放，门槛更严格。</p>
              </div>
              <button
                className="ghost-btn"
                type="button"
                onClick={() => runAction('run-policy', '/api/audit/run-policy')}
                disabled={actingId === 'run-policy'}
              >
                {actingId === 'run-policy' ? '执行中...' : '立即执行策略'}
              </button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>总存储</th>
                  <th>已使用</th>
                  <th>剩余</th>
                  <th>剩余比例</th>
                  <th>当前状态</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{summary ? formatSize(summary.storage.totalBytes) : '-'}</td>
                  <td>{summary ? formatSize(summary.storage.usedBytes) : '-'}</td>
                  <td>{summary ? formatSize(summary.storage.freeBytes) : '-'}</td>
                  <td>{summary ? formatRatio(summary.storage.freeRatio) : '-'}</td>
                  <td>
                    <span className={`tag ${summary?.storage?.belowThreshold ? 'warning-tag' : 'up-tag'}`}>
                      {summary?.storage?.belowThreshold ? '低于阈值，自动原件清理已启用' : '安全'}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="card table-card">
            <div className="panel-header">
              <div>
                <h3>低引用文档</h3>
                <p>先做“清理原文件”，让问答和报表继续复用结构化数据；只有长期无引用时才建议彻底删除。</p>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>文档</th>
                  <th>来源</th>
                  <th>库龄</th>
                  <th>存储状态</th>
                  <th>清理原因</th>
                  <th>引用次数</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.staleDocs || []).map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.sourceType === 'capture' ? '采集结果' : item.sourceType === 'upload' ? '上传文档' : '其他'}</td>
                    <td>{item.ageDays} 天</td>
                    <td>{renderStorageState(item.storageState)}</td>
                    <td>
                      {item.similarityCleanupRecommended
                        ? `高相似原件（同组 ${item.similarDocumentCount} 份）`
                        : item.cleanupRecommended
                          ? `长期低引用（>${summary?.staleDays || 90} 天）`
                          : '-'}
                    </td>
                    <td>{`总 ${item.referenceCount || 0} · 问答 ${item.answerReferenceCount || 0} · 报表 ${item.reportReferenceCount || 0}`}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {item.cleanupRecommended ? (
                          <button
                            className="ghost-btn"
                            type="button"
                            onClick={() => runAction(`doc-clean-${item.id}`, '/api/audit/documents/cleanup', { id: item.id })}
                            disabled={actingId === `doc-clean-${item.id}`}
                          >
                            {actingId === `doc-clean-${item.id}` ? '清理中...' : '清理原文件'}
                          </button>
                        ) : null}
                        {item.hardDeleteRecommended ? (
                          <button
                            className="ghost-btn"
                            type="button"
                            onClick={() => runAction(`doc-hard-${item.id}`, '/api/audit/documents/hard-delete', { id: item.id })}
                            disabled={actingId === `doc-hard-${item.id}`}
                          >
                            {actingId === `doc-hard-${item.id}` ? '删除中...' : '彻底删除'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && !(summary?.staleDocs || []).length ? (
                  <tr>
                    <td colSpan={7}>当前没有满足审计条件的文档。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          <section className="card table-card">
            <div className="panel-header">
              <div>
                <h3>低引用数据源</h3>
                <p>数据源会先走“停采 + 清理原文件”，保留结构化结果；超过更长周期仍无引用时，再允许彻底删除。</p>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>数据源</th>
                  <th>状态</th>
                  <th>库龄</th>
                  <th>存储状态</th>
                  <th>引用次数</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.staleCaptures || []).map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.captureStatus === 'paused' ? '已停采' : '采集中'}</td>
                    <td>{item.ageDays} 天</td>
                    <td>{renderStorageState(item.storageState)}</td>
                    <td>{`总 ${item.referenceCount || 0} · 问答 ${item.answerReferenceCount || 0} · 报表 ${item.reportReferenceCount || 0}`}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {item.captureStatus !== 'paused' ? (
                          <button
                            className="ghost-btn"
                            type="button"
                            onClick={() => runAction(`pause-${item.id}`, `/api/audit/capture-tasks/${item.id}/pause`)}
                            disabled={actingId === `pause-${item.id}`}
                          >
                            {actingId === `pause-${item.id}` ? '停采中...' : '停采'}
                          </button>
                        ) : null}
                        {item.cleanupRecommended ? (
                          <button
                            className="ghost-btn"
                            type="button"
                            onClick={() => runAction(`capture-clean-${item.id}`, '/api/audit/capture-tasks/cleanup', { id: item.id })}
                            disabled={actingId === `capture-clean-${item.id}`}
                          >
                            {actingId === `capture-clean-${item.id}` ? '清理中...' : '清理原文件'}
                          </button>
                        ) : null}
                        {item.hardDeleteRecommended ? (
                          <button
                            className="ghost-btn"
                            type="button"
                            onClick={() => runAction(`capture-hard-${item.id}`, '/api/audit/capture-tasks/hard-delete', { id: item.id })}
                            disabled={actingId === `capture-hard-${item.id}`}
                          >
                            {actingId === `capture-hard-${item.id}` ? '删除中...' : '彻底删除'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && !(summary?.staleCaptures || []).length ? (
                  <tr>
                    <td colSpan={6}>当前没有满足审计条件的采集数据源。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          <section className="card table-card">
            <div className="panel-header">
              <div>
                <h3>审计日志</h3>
                <p>记录停采、原文件清理、彻底删除，以及自动策略执行结果。</p>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>执行方</th>
                  <th>动作</th>
                  <th>对象</th>
                  <th>结果</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.logs || []).map((item) => (
                  <tr key={item.id}>
                    <td>{formatDate(item.time)}</td>
                    <td>{item.actor === 'system' ? '系统自动' : '用户'}</td>
                    <td>{item.action}</td>
                    <td>{item.target}</td>
                    <td>{item.result}</td>
                    <td className="summary-cell">{item.note}</td>
                  </tr>
                ))}
                {!loading && !(summary?.logs || []).length ? (
                  <tr>
                    <td colSpan={6}>当前还没有审计日志。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </section>
      </main>
    </div>
  );
}
