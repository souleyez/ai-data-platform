'use client';

import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { buildApiUrl } from '../lib/config';
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

function ActionButton({ children }) {
  return <button className="ghost-btn" type="button">{children}</button>;
}

export default function ReportsPage() {
  const [data, setData] = useState(null);
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadReports() {
      try {
        const response = await fetch(buildApiUrl('/api/reports'));
        if (!response.ok) throw new Error('load reports failed');
        const json = await response.json();
        setData(normalizeReportsResponse(json));
      } catch {
        setError('报表接口暂时不可用');
      }
    }

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

    loadReports();
    loadDatasources();
  }, []);

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/reports" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>报表中心</h2>
            <p>直接按报表用途组织：模板、静态页、运行实例和历史输出记录。</p>
          </div>
        </header>

        {error ? <p>{error}</p> : null}
        {data ? (
          <section className="documents-layout">
            <section className="card stats-grid">
              <StatCard label="固定模板" value={String(data.fixedTemplates?.length || 0)} subtle="表格 / 文件 / PPT" />
              <StatCard label="动态静态页" value={String(data.activePages?.length || 0)} subtle="当前运行中" />
              <StatCard label="历史输出" value={String(data.outputRecords?.length || 0)} subtle="已生成记录" />
            </section>

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>固定格式输出模板</h3>
                  <p>按固定格式输出表格、文件或 PPT，用于稳定复用的经营材料。</p>
                </div>
              </div>
              <div className="documents-grid three-columns">
                {(data.fixedTemplates || []).map((item) => (
                  <section key={item.id} className="summary-item">
                    <div className="summary-key">{item.name}</div>
                    <div className="summary-value" style={{ fontSize: 16 }}>{item.outputType}</div>
                    <div className="capture-task-note" style={{ marginTop: 8 }}>{item.description}</div>
                    <div className="capture-task-meta" style={{ marginTop: 8 }}>最近生成：{item.lastGeneratedAt}</div>
                    <div style={{ marginTop: 10 }}>
                      <ActionButton>立即生成</ActionButton>
                    </div>
                  </section>
                ))}
              </div>
            </section>

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>动态更新静态页模板</h3>
                  <p>可生成独立静态页链接，页面单独访问，不返回平台。</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>主要内容</th>
                    <th>更新频率</th>
                    <th>独立链接</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.staticPageTemplates || []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td className="summary-cell">{item.scope}</td>
                      <td>{item.frequency}</td>
                      <td className="summary-cell">{item.publicUrl}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <ActionButton>打开</ActionButton>
                          <ActionButton>复制链接</ActionButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>当前动态更新的静态页</h3>
                  <p>这里看当前运行中的静态页实例、更新时间和访问链接。</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>状态</th>
                    <th>更新频率</th>
                    <th>最近更新时间</th>
                    <th>主要内容</th>
                    <th>链接</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.activePages || []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td><span className="tag up-tag">{item.status}</span></td>
                      <td>{item.frequency}</td>
                      <td>{item.updatedAt}</td>
                      <td className="summary-cell">{item.scope}</td>
                      <td className="summary-cell">{item.publicUrl}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card table-card">
              <div className="panel-header">
                <div>
                  <h3>已输出记录</h3>
                  <p>已生成的固定格式表格、文件、PPT 记录统一保留在这里。</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>输出类型</th>
                    <th>分类</th>
                    <th>来源模板</th>
                    <th>输出时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.outputRecords || []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.outputType}</td>
                      <td>{item.category}</td>
                      <td>{item.source}</td>
                      <td>{item.createdAt}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <ActionButton>查看</ActionButton>
                          <ActionButton>重新生成</ActionButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </section>
        ) : null}
      </main>
    </div>
  );
}
