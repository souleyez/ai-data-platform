'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { buildApiUrl } from '../lib/config';
import { formatDocumentBusinessResult, normalizeDatasourceResponse, normalizeDocumentsResponse } from '../lib/types';
import { sourceItems } from '../lib/mock-data';
import { getDocumentGroupLabel } from '../lib/document-taxonomy';

const BIZ_CATEGORY_LABELS = {
  paper: '学术论文',
  contract: '合同协议',
  daily: '工作日报',
  invoice: '发票凭据',
  order: '订单分析',
  service: '客服采集',
  inventory: '库存监控',
};

function extractTimestamp(item) {
  const text = `${item?.name || ''} ${item?.path || ''}`;
  const match = text.match(/(\d{13})/);
  return match ? Number(match[1]) : 0;
}

export default function DocumentsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [error, setError] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [keyword, setKeyword] = useState('');
  const [activeExtension, setActiveExtension] = useState('all');

  const loadDocuments = async () => {
    try {
      setError('');
      const response = await fetch(buildApiUrl('/api/documents'));
      if (!response.ok) throw new Error('load documents failed');
      const json = await response.json();
      const normalized = normalizeDocumentsResponse(json);
      setData(normalized);
    } catch {
      setError('文档接口暂时不可用');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();

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

    loadDatasources();
  }, []);

  const triggerScan = async () => {
    try {
      setScanLoading(true);
      setScanMessage('');
      const response = await fetch(buildApiUrl('/api/documents/scan'), { method: 'POST' });
      if (!response.ok) throw new Error('scan failed');
      const json = await response.json();
      setScanMessage(json.message || '扫描完成');
      await loadDocuments();
    } catch {
      setScanMessage('扫描触发失败，请稍后重试');
    } finally {
      setScanLoading(false);
    }
  };

  const extensionSummary = useMemo(() => (data?.byExtension ? Object.entries(data.byExtension) : []), [data]);

  const filteredItems = useMemo(() => {
    const items = data?.items || [];
    const normalizedKeyword = keyword.trim().toLowerCase();

    return items
      .filter((item) => {
        const extensionMatch = activeExtension === 'all' || item.ext === activeExtension;
        const keywordMatch = !normalizedKeyword
          || item.name.toLowerCase().includes(normalizedKeyword)
          || item.summary.toLowerCase().includes(normalizedKeyword)
          || item.excerpt.toLowerCase().includes(normalizedKeyword)
          || (item.topicTags || []).join(' ').toLowerCase().includes(normalizedKeyword)
          || (item.confirmedGroups || item.groups || []).join(' ').toLowerCase().includes(normalizedKeyword);

        return extensionMatch && keywordMatch;
      })
      .sort((a, b) => extractTimestamp(b) - extractTimestamp(a) || String(b.path).localeCompare(String(a.path)));
  }, [data, activeExtension, keyword]);

  const parsedCount = data?.meta?.parsed || 0;
  const totalFiles = data?.totalFiles || 0;
  const parseRate = totalFiles ? `${Math.round((parsedCount / totalFiles) * 100)}%` : '0%';
  const recentCount = useMemo(() => filteredItems.filter((item) => extractTimestamp(item) > 0).slice(0, 10).length, [filteredItems]);

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/documents" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>文档中心</h2>
            <p>保留紧凑状态栏和文档大列表，便于快速浏览与定位资料。</p>
          </div>
          <div className="topbar-actions">
            <button className="ghost-btn" onClick={loadDocuments}>刷新</button>
            <button className="primary-btn" onClick={triggerScan} disabled={scanLoading}>
              {scanLoading ? '扫描中...' : '执行扫描'}
            </button>
          </div>
        </header>

        {loading ? <p>加载中…</p> : null}
        {error ? <p>{error}</p> : null}
        {scanMessage ? <div className="page-note">{scanMessage}</div> : null}

        {data ? (
          <section className="documents-layout">
            <section className="card documents-card" style={{ paddingTop: 10, paddingBottom: 10 }}>
              <div className="message-refs" style={{ gap: 8, alignItems: 'center' }}>
                <span className="source-chip">总数 {totalFiles}</span>
                <span className="source-chip">新增 {recentCount}</span>
                <span className="source-chip">解析 {parseRate}</span>
                <span className="source-chip">结果 {filteredItems.length}/{data.items.length}</span>
                <button className={`ref-chip ${activeExtension === 'all' ? 'active-filter' : ''}`} onClick={() => setActiveExtension('all')}>全部</button>
                {extensionSummary.map(([ext, count]) => (
                  <button key={ext} className={`ref-chip ${activeExtension === ext ? 'active-filter' : ''}`} onClick={() => setActiveExtension(ext)}>
                    {ext} {count}
                  </button>
                ))}
                <input
                  className="filter-input"
                  style={{ minWidth: 200, flex: '1 1 200px', marginLeft: 'auto' }}
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索文件名、摘要、分组..."
                />
              </div>
            </section>

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>重复文档提示（待接实）</h3>
                  <p>后续这里会提示摘要高相似的重复文档，默认覆盖保留最新版本，也支持放弃合并。</p>
                </div>
              </div>
              <div className="page-note" style={{ marginBottom: 0 }}>
                当前先保留提示位，后面接真实重复摘要比对逻辑与合并确认交互。
              </div>
            </section>

            <section className="card table-card">
              <div className="panel-header">
                <div>
                  <h3>文档列表</h3>
                  <p>默认按最近文档排序，结合上方状态栏快速筛看当前资料。</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>文件名</th>
                    <th>分类</th>
                    <th>分组</th>
                    <th>解析状态</th>
                    <th>业务结果</th>
                    <th>摘要</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.path}>
                      <td><a href={`/documents/${item.id}`}>{item.name}</a></td>
                      <td>{BIZ_CATEGORY_LABELS[item.confirmedBizCategory || item.bizCategory] || item.bizCategory}</td>
                      <td className="summary-cell">{(item.confirmedGroups || item.groups || []).map((group) => getDocumentGroupLabel(group)).join('、') || '-'}</td>
                      <td>{item.parseStatus}</td>
                      <td className="summary-cell">{formatDocumentBusinessResult(item)}</td>
                      <td className="summary-cell">{item.summary}</td>
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
