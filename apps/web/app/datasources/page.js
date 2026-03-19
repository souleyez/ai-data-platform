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

const TYPE_LABELS = {
  documents: '文档型',
  web: '网页采集',
  database: '数据库',
  unknown: '其他',
};

export default function DatasourcesPage() {
  const [data, setData] = useState(null);
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [error, setError] = useState('');
  const [hiddenIds, setHiddenIds] = useState([]);
  const [activeType, setActiveType] = useState('all');
  const [activeGroup, setActiveGroup] = useState('all');
  const [activeStatus, setActiveStatus] = useState('all');
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
  const groupedItems = useMemo(() => visibleItems.reduce((acc, item) => {
    const group = item.group || '其他';
    acc[group] = (acc[group] || 0) + 1;
    return acc;
  }, {}), [visibleItems]);
  const typeItems = useMemo(() => visibleItems.reduce((acc, item) => {
    const type = item.type || 'unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {}), [visibleItems]);

  const filteredItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return visibleItems.filter((item) => {
      const typeMatch = activeType === 'all' || item.type === activeType;
      const groupMatch = activeGroup === 'all' || item.group === activeGroup;
      const statusMatch = activeStatus === 'all' || item.rawStatus === activeStatus || item.status === activeStatus;
      const keywordMatch = !normalizedKeyword
        || item.name.toLowerCase().includes(normalizedKeyword)
        || item.group.toLowerCase().includes(normalizedKeyword)
        || item.capability.toLowerCase().includes(normalizedKeyword)
        || item.updateMode.toLowerCase().includes(normalizedKeyword);
      return typeMatch && groupMatch && statusMatch && keywordMatch;
    });
  }, [visibleItems, activeType, activeGroup, activeStatus, keyword]);

  const hideItem = (id) => setHiddenIds((prev) => prev.includes(id) ? prev : [...prev, id]);
  const deleteItem = (id) => setHiddenIds((prev) => prev.includes(id) ? prev : [...prev, id]);

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/datasources" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>数据源管理</h2>
            <p>先按分类和分组筛，再按状态和关键字缩小范围，下面统一看数据源大列表。</p>
          </div>
        </header>

        {error ? <p>{error}</p> : null}
        {data ? (
          <section className="documents-layout">
            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>分类</h3>
                  <p>先看来源类型。</p>
                </div>
              </div>
              <div className="summary-grid biz-summary-grid">
                <button className={`summary-item filter-card ${activeType === 'all' ? 'active-filter' : ''}`} onClick={() => setActiveType('all')}>
                  <div className="summary-key">全部</div>
                  <div className="summary-value">{visibleItems.length}</div>
                </button>
                {Object.entries(typeItems).map(([type, count]) => (
                  <button key={type} className={`summary-item filter-card ${activeType === type ? 'active-filter' : ''}`} onClick={() => setActiveType(type)}>
                    <div className="summary-key">{TYPE_LABELS[type] || type}</div>
                    <div className="summary-value">{count}</div>
                  </button>
                ))}
              </div>
            </section>

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>分组</h3>
                  <p>按业务来源分组继续细分。</p>
                </div>
              </div>
              <div className="message-refs" style={{ gap: 10 }}>
                <button className={`ref-chip ${activeGroup === 'all' ? 'active-filter' : ''}`} onClick={() => setActiveGroup('all')}>全部分组</button>
                {Object.entries(groupedItems).map(([group, count]) => (
                  <button key={group} className={`ref-chip ${activeGroup === group ? 'active-filter' : ''}`} onClick={() => setActiveGroup(group)}>
                    {group} · {count}
                  </button>
                ))}
              </div>
            </section>

            <section className="documents-grid three-columns">
              <section className="card documents-card">
                <div className="panel-header">
                  <div>
                    <h3>状态</h3>
                    <p>快速看可用性与隐藏情况。</p>
                  </div>
                </div>
                <div className="summary-grid">
                  <StatCard label="总数据源" value={String(visibleItems.length)} subtle={data.mode} />
                  <StatCard label="可用 / 在线" value={String(visibleItems.filter((item) => item.status === 'success').length)} subtle="connected / active" />
                  <StatCard label="已屏蔽" value={String(hiddenIds.length)} subtle="本地视图隐藏" />
                </div>
                <div className="message-refs" style={{ gap: 10, marginTop: 12 }}>
                  <button className={`ref-chip ${activeStatus === 'all' ? 'active-filter' : ''}`} onClick={() => setActiveStatus('all')}>全部状态</button>
                  <button className={`ref-chip ${activeStatus === 'success' ? 'active-filter' : ''}`} onClick={() => setActiveStatus('success')}>success</button>
                  <button className={`ref-chip ${activeStatus === 'warning' ? 'active-filter' : ''}`} onClick={() => setActiveStatus('warning')}>warning</button>
                  <button className={`ref-chip ${activeStatus === 'idle' ? 'active-filter' : ''}`} onClick={() => setActiveStatus('idle')}>idle</button>
                </div>
              </section>

              <section className="card documents-card" style={{ gridColumn: 'span 2' }}>
                <div className="panel-header">
                  <div>
                    <h3>关键字搜索</h3>
                    <p>支持名称、分组、能力、更新方式搜索。</p>
                  </div>
                </div>
                <input
                  className="filter-input"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索数据源名称、分组、能力..."
                />
                <div className="page-note" style={{ marginTop: '12px', marginBottom: 0 }}>
                  当前结果：{filteredItems.length} / {visibleItems.length}
                </div>
              </section>
            </section>

            <section className="card table-card">
              <div className="panel-header">
                <div>
                  <h3>数据源列表</h3>
                  <p>默认直接看大列表；上面三层筛选决定这里显示什么。</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>分类</th>
                    <th>分组</th>
                    <th>状态</th>
                    <th>更新方式</th>
                    <th>能力</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{TYPE_LABELS[item.type] || item.type}</td>
                      <td>{item.group}</td>
                      <td><span className={`tag ${item.status === 'success' ? 'up-tag' : item.status === 'warning' ? 'warning' : 'neutral-tag'}`}>{item.rawStatus}</span></td>
                      <td>{item.updateMode}</td>
                      <td className="summary-cell">{item.capability}</td>
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
