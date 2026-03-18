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
  const [hiddenIds, setHiddenIds] = useState([]);

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

  const visibleItems = useMemo(() => (data?.items || []).filter((item) => !hiddenIds.includes(item.id)), [data, hiddenIds]);
  const activeItems = useMemo(() => (data?.activeItems || []).filter((item) => !hiddenIds.includes(item.id)), [data, hiddenIds]);

  const groupedItems = useMemo(() => {
    return visibleItems.reduce((acc, item) => {
      const group = item.group || '其他';
      acc[group] = acc[group] || [];
      acc[group].push(item);
      return acc;
    }, {});
  }, [visibleItems]);

  const hideItem = (id) => setHiddenIds((prev) => prev.includes(id) ? prev : [...prev, id]);
  const deleteItem = (id) => setHiddenIds((prev) => prev.includes(id) ? prev : [...prev, id]);

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/datasources" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>数据源管理</h2>
            <p>展示所有正在采集或可更新的数据源，包括固定网页抓取、知识网站获取、数据库接入、ERP 订单后台与爬虫数据接入。尽量减少客户操作，仅保留屏蔽与删除。</p>
          </div>
        </header>

        {error ? <p>{error}</p> : null}
        {data ? (
          <section className="documents-layout">
            <section className="card stats-grid">
              <StatCard label="总数据源" value={String(visibleItems.length)} subtle={data.mode} />
              <StatCard label="正在更新/可用" value={String(activeItems.length)} subtle="active + connected" />
              <StatCard label="已屏蔽" value={String(hiddenIds.length)} subtle="本地视图隐藏" />
            </section>

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>正在采集 / 可更新的数据</h3>
                  <p>优先显示系统当前持续更新或可以随时更新的来源，减少用户到处找入口。</p>
                </div>
              </div>
              <div className="summary-grid biz-summary-grid">
                {activeItems.map((item) => (
                  <div key={item.id} className="summary-item">
                    <div className="summary-key">{item.name}</div>
                    <div className="summary-value" style={{ fontSize: 18 }}>{item.group}</div>
                    <div className="capture-task-meta" style={{ marginTop: 8 }}>更新方式：{item.updateMode}</div>
                    <div className="capture-task-note">{item.capability}</div>
                  </div>
                ))}
              </div>
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
                      <div key={item.id} className="summary-item">
                        <div className="summary-key">{item.name}</div>
                        <div className="summary-value" style={{ fontSize: '15px' }}>{item.updateMode}</div>
                        <div className="capture-task-note">{item.capability}</div>
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
                  <p>默认只做查看与轻管理；如无需要，不要求客户维护复杂配置。</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>来源分组</th>
                    <th>类型</th>
                    <th>更新方式</th>
                    <th>能力</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.group}</td>
                      <td>{item.type}</td>
                      <td>{item.updateMode}</td>
                      <td className="summary-cell">{item.capability}</td>
                      <td><span className={`tag ${item.status === 'success' ? 'up-tag' : item.status === 'warning' ? 'warning' : 'neutral-tag'}`}>{item.rawStatus}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button className="ghost-btn" onClick={() => hideItem(item.id)}>屏蔽</button>
                          <button className="ghost-btn" onClick={() => deleteItem(item.id)}>删除</button>
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
