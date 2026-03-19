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

function toContinuousItem(item) {
  return {
    ...item,
    focus: item.capability,
    cycle: item.updateMode,
    totalCollected: item.rawStatus === 'connected' ? '持续累计中' : item.rawStatus === 'warning' ? '最近有波动' : '尚未开始',
    mainContent: item.capability,
  };
}

function toCompletedItem(item) {
  return {
    ...item,
    ingestedCount: 1,
    defaultCategory: '已按结果自动归档到文档中心',
    mainContent: item.capability,
  };
}

export default function DatasourcesPage() {
  const [data, setData] = useState(null);
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [error, setError] = useState('');
  const [hiddenIds, setHiddenIds] = useState([]);
  const [keyword, setKeyword] = useState('');

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
  const normalizedKeyword = keyword.trim().toLowerCase();

  const continuousItems = useMemo(() => visibleItems
    .filter((item) => item.updateMode.includes('定时') || item.updateMode.includes('周期') || item.mode === 'active')
    .filter((item) => !normalizedKeyword
      || item.name.toLowerCase().includes(normalizedKeyword)
      || item.capability.toLowerCase().includes(normalizedKeyword)
      || item.updateMode.toLowerCase().includes(normalizedKeyword))
    .map(toContinuousItem), [visibleItems, normalizedKeyword]);

  const completedItems = useMemo(() => visibleItems
    .filter((item) => !(item.updateMode.includes('定时') || item.updateMode.includes('周期') || item.mode === 'active'))
    .filter((item) => !normalizedKeyword
      || item.name.toLowerCase().includes(normalizedKeyword)
      || item.capability.toLowerCase().includes(normalizedKeyword)
      || item.updateMode.toLowerCase().includes(normalizedKeyword))
    .map(toCompletedItem), [visibleItems, normalizedKeyword]);

  const toggleHidden = (id) => setHiddenIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/datasources" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>数据源管理</h2>
            <p>这里只看两类：采集完成，以及需要持续关注的动态采集任务。</p>
          </div>
        </header>

        {error ? <p>{error}</p> : null}
        {data ? (
          <section className="documents-layout">
            <section className="documents-grid three-columns">
              <section className="card documents-card">
                <div className="panel-header">
                  <div>
                    <h3>总览</h3>
                    <p>整体看板，不再展开多余分类。</p>
                  </div>
                </div>
                <div className="summary-grid">
                  <StatCard label="动态持续采集" value={String(continuousItems.length)} subtle="持续进入文档库" />
                  <StatCard label="采集完成" value={String(completedItems.length)} subtle="已结构化入库" />
                  <StatCard label="已隐藏" value={String(hiddenIds.length)} subtle="仅当前视图" />
                </div>
              </section>

              <section className="card documents-card" style={{ gridColumn: 'span 2' }}>
                <div className="panel-header">
                  <div>
                    <h3>关键字搜索</h3>
                    <p>支持名称、内容、周期搜索。</p>
                  </div>
                </div>
                <input
                  className="filter-input"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索数据源名称、主要内容、采集周期..."
                />
                <div className="page-note" style={{ marginTop: '12px', marginBottom: 0 }}>
                  当前结果：动态持续采集 {continuousItems.length} 项，采集完成 {completedItems.length} 项。
                </div>
              </section>
            </section>

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>动态持续采集</h3>
                  <p>每次采集都会分别存入文档中心，可持续关注、暂停或调整频率。</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>已采集多少</th>
                    <th>主要是什么</th>
                    <th>采集周期</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {continuousItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.totalCollected}</td>
                      <td className="summary-cell">{item.mainContent}</td>
                      <td>{item.cycle}</td>
                      <td><span className={`tag ${item.status === 'success' ? 'up-tag' : item.status === 'warning' ? 'warning' : 'neutral-tag'}`}>{item.rawStatus}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button className="ghost-btn" onClick={() => toggleHidden(item.id)}>是否暂停</button>
                          <button className="ghost-btn">调整频率</button>
                          <a className="ghost-btn back-link" href="/documents">查看文档</a>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!continuousItems.length ? (
                    <tr><td colSpan={6} className="summary-cell">当前没有需要持续关注的动态采集任务。</td></tr>
                  ) : null}
                </tbody>
              </table>
            </section>

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>采集完成</h3>
                  <p>一次性采集完成后，结果会变成结构化资料进入文档中心，按结果默认分类。</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>已入库</th>
                    <th>默认分类</th>
                    <th>主要是什么</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {completedItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.ingestedCount} 份</td>
                      <td>{item.defaultCategory}</td>
                      <td className="summary-cell">{item.mainContent}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <a className="ghost-btn back-link" href="/documents">查看文档</a>
                          <button className="ghost-btn" onClick={() => toggleHidden(item.id)}>隐藏</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!completedItems.length ? (
                    <tr><td colSpan={5} className="summary-cell">当前没有采集完成的静态结果。</td></tr>
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
