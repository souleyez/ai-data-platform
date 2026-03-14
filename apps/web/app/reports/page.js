'use client';

import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { buildApiUrl } from '../lib/config';
import { normalizeDatasourceResponse, normalizeReportsResponse } from '../lib/types';
import { sourceItems } from '../lib/mock-data';

const reportDescriptions = {
  weekly: '用于周维度经营概览与阶段性总结，后续适合接日报/周报生成链路。',
  risk: '用于合同风险、异常条款、付款节点等风险视角归纳。',
  trend: '用于订单、客户、渠道等趋势变化分析与对比。',
};

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
            <p>这里先作为报表入口页：上面看就绪情况，中间看报表卡片，下面保留真实接口清单。</p>
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

            <section className="documents-grid three-columns">
              {data.items.map((item) => (
                <section key={item.id} className="card documents-card">
                  <div className="panel-header">
                    <div>
                      <h3>{item.name}</h3>
                      <p>{item.type}</p>
                    </div>
                    <span className={`tag ${item.status === 'ready' ? 'up-tag' : 'warning'}`}>{item.status}</span>
                  </div>
                  <div className="summary-item">
                    <div className="summary-key">当前说明</div>
                    <div className="summary-value" style={{ fontSize: '15px' }}>
                      {reportDescriptions[item.type] || '后续补充说明'}
                    </div>
                  </div>
                </section>
              ))}
            </section>

            <section className="card table-card">
              <div className="panel-header">
                <div>
                  <h3>报表清单</h3>
                  <p>当前先把真实接口清单接通；后续再补报表详情页、导出链路和参数化筛选。</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>类型</th>
                    <th>状态</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.type}</td>
                      <td><span className={`tag ${item.status === 'ready' ? 'up-tag' : 'warning'}`}>{item.status}</span></td>
                      <td className="summary-cell">{reportDescriptions[item.type] || '后续补充说明'}</td>
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
