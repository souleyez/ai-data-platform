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

export default function DatasourcesPage() {
  const [data, setData] = useState(null);
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(buildApiUrl('/api/datasources'));
        if (!response.ok) throw new Error('load datasources failed');
        const json = await response.json();
        const normalized = normalizeDatasourceResponse(json);
        setData(normalized);
        if (normalized.items.length) setSidebarSources(normalized.items);
      } catch {
        setError('数据源接口暂时不可用');
      }
    }
    load();
  }, []);

  const groupedItems = useMemo(() => {
    const items = data?.items || [];
    return items.reduce((acc, item) => {
      const group = item.group || '其他';
      acc[group] = acc[group] || [];
      acc[group].push(item);
      return acc;
    }, {});
  }, [data]);

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/datasources" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>数据源管理</h2>
            <p>按文档型、数据库型、Web采集型查看当前只读接入状态，并说明每类数据源当前可支撑的能力。</p>
          </div>
        </header>

        {error ? <p>{error}</p> : null}
        {data ? (
          <section className="documents-layout">
            <section className="card stats-grid">
              <StatCard label="总数据源" value={String(data.total)} subtle={data.mode} />
              <StatCard label="已连接" value={String(data.meta?.connected || 0)} subtle="connected" />
              <StatCard label="告警/空闲" value={String((data.meta?.warning || 0) + (data.meta?.idle || 0))} subtle="warning + idle" />
            </section>

            <section className="documents-grid three-columns">
              {Object.entries(groupedItems).map(([group, items]) => (
                <section key={group} className="card documents-card">
                  <div className="panel-header">
                    <div>
                      <h3>{group}</h3>
                      <p>{items.length} 个数据源</p>
                    </div>
                  </div>
                  <div className="summary-grid">
                    {items.map((item) => (
                      <div key={`${item.name}-${item.type}`} className="summary-item">
                        <div className="summary-key">{item.name}</div>
                        <div className="summary-value" style={{ fontSize: '15px' }}>{item.capability}</div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </section>

            <section className="card table-card">
              <div className="panel-header">
                <div>
                  <h3>数据源列表</h3>
                  <p>当前是后端真实接口清单页；第一版重点把分组、能力说明、状态和模式先做清楚。</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>分组</th>
                    <th>类型</th>
                    <th>能力</th>
                    <th>状态</th>
                    <th>模式</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={`${item.name}-${item.type}`}>
                      <td>{item.name}</td>
                      <td>{item.group}</td>
                      <td>{item.type}</td>
                      <td className="summary-cell">{item.capability}</td>
                      <td><span className={`tag ${item.status === 'success' ? 'up-tag' : item.status === 'warning' ? 'warning' : 'neutral-tag'}`}>{item.status}</span></td>
                      <td>{item.mode}</td>
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
