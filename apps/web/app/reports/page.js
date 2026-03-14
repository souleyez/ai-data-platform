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
            <p>展示当前后端可提供的报表资源，为后续导出、周报和专题分析留接口位。</p>
          </div>
        </header>

        {error ? <p>{error}</p> : null}
        {data ? (
          <section className="documents-layout">
            <section className="card stats-grid">
              <StatCard label="报表总数" value={String(data.total)} subtle={data.mode} />
              <StatCard label="已就绪" value={String(data.meta?.ready || 0)} subtle="ready" />
              <StatCard label="待扩展" value={String(Math.max(0, data.total - (data.meta?.ready || 0)))} subtle="future" />
            </section>

            <section className="card table-card">
              <div className="panel-header">
                <div>
                  <h3>报表列表</h3>
                  <p>当前先接真实 API 清单，后续再补报表详情和导出链路。</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>类型</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.type}</td>
                      <td><span className={`tag ${item.status === 'ready' ? 'up-tag' : 'warning'}`}>{item.status}</span></td>
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
