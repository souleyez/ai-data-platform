'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { buildApiUrl } from '../lib/config';
import { formatDocumentBusinessResult, normalizeDatasourceResponse, normalizeDocumentsResponse } from '../lib/types';
import { sourceItems } from '../lib/mock-data';

const BIZ_CATEGORY_LABELS = {
  technical: '技术类',
  contract: '合同类',
  report: '日报类',
  paper: '论文类',
  other: '其他类',
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

export default function DocumentsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [error, setError] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [activeBizCategory, setActiveBizCategory] = useState('all');
  const [keyword, setKeyword] = useState('');

  const loadDocuments = async () => {
    try {
      setError('');
      const response = await fetch(buildApiUrl('/api/documents'));
      if (!response.ok) throw new Error('load documents failed');
      const json = await response.json();
      setData(normalizeDocumentsResponse(json));
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
  const statusSummary = useMemo(() => (data?.byStatus ? Object.entries(data.byStatus) : []), [data]);
  const bizCategorySummary = useMemo(() => {
    const entries = data?.byBizCategory ? Object.entries(data.byBizCategory) : [];
    return entries.map(([key, value]) => ({ key, label: BIZ_CATEGORY_LABELS[key] || key, value }));
  }, [data]);

  const filteredItems = useMemo(() => {
    const items = data?.items || [];
    return items.filter((item) => {
      const categoryMatch = activeBizCategory === 'all' || item.bizCategory === activeBizCategory;
      const normalizedKeyword = keyword.trim().toLowerCase();
      const keywordMatch = !normalizedKeyword
        || item.name.toLowerCase().includes(normalizedKeyword)
        || item.summary.toLowerCase().includes(normalizedKeyword)
        || item.excerpt.toLowerCase().includes(normalizedKeyword);
      return categoryMatch && keywordMatch;
    });
  }, [data, activeBizCategory, keyword]);

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/documents" />

      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>文档中心</h2>
            <p>按业务分类浏览文档，优先面向技术类、合同类、日报类、论文类做结构化整理与后续问答。</p>
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
            <section className="card stats-grid">
              <StatCard label="扫描目录" value={data.scanRoot} subtle={data.exists ? '目录可访问' : '目录不存在'} />
              <StatCard label="总文件数" value={String(data.totalFiles)} subtle="只读扫描" />
              <StatCard label="最近扫描" value={new Date(data.lastScanAt).toLocaleString()} subtle="解析第一版" />
            </section>

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>业务分类</h3>
                  <p>先按业务视角组织：技术类、合同类、日报类、论文类、其他类。</p>
                </div>
              </div>
              <div className="summary-grid biz-summary-grid">
                <button className={`summary-item filter-card ${activeBizCategory === 'all' ? 'active-filter' : ''}`} onClick={() => setActiveBizCategory('all')}>
                  <div className="summary-key">全部</div>
                  <div className="summary-value">{data.totalFiles}</div>
                </button>
                {bizCategorySummary.map((item) => (
                  <button key={item.key} className={`summary-item filter-card ${activeBizCategory === item.key ? 'active-filter' : ''}`} onClick={() => setActiveBizCategory(item.key)}>
                    <div className="summary-key">{item.label}</div>
                    <div className="summary-value">{item.value}</div>
                  </button>
                ))}
              </div>
            </section>

            <section className="documents-grid three-columns">
              <section className="card documents-card">
                <div className="panel-header">
                  <div>
                    <h3>扩展名统计</h3>
                    <p>当前已尝试接入 txt / md / pdf</p>
                  </div>
                </div>
                <div className="summary-grid">
                  {extensionSummary.map(([key, value]) => (
                    <div key={key} className="summary-item">
                      <div className="summary-key">{key}</div>
                      <div className="summary-value">{value}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="card documents-card">
                <div className="panel-header">
                  <div>
                    <h3>解析状态</h3>
                    <p>观察当前解析成功 / 不支持 / 失败情况</p>
                  </div>
                </div>
                <div className="summary-grid">
                  {statusSummary.map(([key, value]) => (
                    <div key={key} className="summary-item">
                      <div className="summary-key">{key}</div>
                      <div className="summary-value">{value}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="card documents-card">
                <div className="panel-header">
                  <div>
                    <h3>筛选</h3>
                    <p>支持按业务分类和关键词快速查看。</p>
                  </div>
                </div>
                <input
                  className="filter-input"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索文件名、摘要、摘录..."
                />
                <div className="page-note" style={{ marginTop: '12px', marginBottom: 0 }}>
                  当前结果：{filteredItems.length} / {data.items.length}
                </div>
              </section>
            </section>

            <section className="card table-card">
              <div className="panel-header">
                <div>
                  <h3>文件列表</h3>
                  <p>当前展示基础摘要、业务分类与解析状态，后续会继续补标签、命中原因与结构化块。</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>文件名</th>
                    <th>业务分类</th>
                    <th>解析分类</th>
                    <th>业务结果</th>
                    <th>解析状态</th>
                    <th>摘要</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.path}>
                      <td><a href={`/documents/${item.id}`}>{item.name}</a></td>
                      <td>{BIZ_CATEGORY_LABELS[item.bizCategory] || item.bizCategory}</td>
                      <td>{item.category}</td>
                      <td className="summary-cell">{formatDocumentBusinessResult(item)}</td>
                      <td>{item.parseStatus}</td>
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
