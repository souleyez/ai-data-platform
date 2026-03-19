'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { buildApiUrl } from '../lib/config';
import { formatDocumentBusinessResult, normalizeDatasourceResponse, normalizeDocumentsResponse } from '../lib/types';
import { sourceItems } from '../lib/mock-data';
import { DEFAULT_CUSTOM_DOCUMENT_CATEGORIES, PRIMARY_DOCUMENT_CATEGORIES } from '../lib/document-taxonomy';

const BIZ_CATEGORY_LABELS = {
  paper: '学术论文',
  contract: '合同协议',
  daily: '工作日报',
  invoice: '发票凭据',
  order: '订单分析',
  service: '客服采集',
  inventory: '库存监控',
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
  const [activeBizCategory, setActiveBizCategory] = useState('all');
  const [activeCustomCategory, setActiveCustomCategory] = useState('all');
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
  const bizCategorySummary = useMemo(() => {
    const entries = data?.byBizCategory ? Object.entries(data.byBizCategory) : [];
    return entries.map(([key, value]) => ({ key, label: BIZ_CATEGORY_LABELS[key] || key, value }));
  }, [data]);

  const customCategorySummary = useMemo(() => {
    const configured = data?.customCategories?.length ? data.customCategories : DEFAULT_CUSTOM_DOCUMENT_CATEGORIES;
    return configured.map((item) => {
      const count = (data?.items || []).filter((doc) => {
        const text = `${doc.name} ${doc.summary} ${doc.excerpt} ${(doc.topicTags || []).join(' ')}`.toLowerCase();
        return (item.keywords || [item.label]).some((entry) => text.includes(String(entry).toLowerCase()));
      }).length;
      return {
        key: item.key,
        label: item.label,
        parent: item.parent,
        count,
        keywords: item.keywords || [item.label],
      };
    });
  }, [data]);

  const filteredItems = useMemo(() => {
    const items = data?.items || [];
    const normalizedKeyword = keyword.trim().toLowerCase();

    return items
      .filter((item) => {
        const categoryMatch = activeBizCategory === 'all' || item.bizCategory === activeBizCategory || item.confirmedBizCategory === activeBizCategory;
        const customCategory = customCategorySummary.find((entry) => entry.key === activeCustomCategory);
        const customMatch = activeCustomCategory === 'all'
          || (item.confirmedGroups || item.groups || []).includes(activeCustomCategory)
          || (!!customCategory && customCategory.keywords.some((entry) => `${item.name} ${item.summary} ${item.excerpt} ${(item.topicTags || []).join(' ')} ${((item.confirmedGroups || item.groups || []).join(' '))}`.toLowerCase().includes(String(entry).toLowerCase())));
        const extensionMatch = activeExtension === 'all' || item.ext === activeExtension;
        const keywordMatch = !normalizedKeyword
          || item.name.toLowerCase().includes(normalizedKeyword)
          || item.summary.toLowerCase().includes(normalizedKeyword)
          || item.excerpt.toLowerCase().includes(normalizedKeyword)
          || (item.topicTags || []).join(' ').toLowerCase().includes(normalizedKeyword);

        return categoryMatch && customMatch && extensionMatch && keywordMatch;
      })
      .sort((a, b) => extractTimestamp(b) - extractTimestamp(a) || String(b.path).localeCompare(String(a.path)));
  }, [data, activeBizCategory, activeCustomCategory, activeExtension, keyword, customCategorySummary]);

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
            <p>大分类固定，分组可扩展；先按分类和分组筛，再看状态与列表。</p>
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
            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>分类</h3>
                  <p>固定主分类：学术论文、合同协议、工作日报、发票凭据、订单分析、客服采集、库存监控。</p>
                </div>
              </div>
              <div className="summary-grid biz-summary-grid">
                <button className={`summary-item filter-card ${activeBizCategory === 'all' ? 'active-filter' : ''}`} onClick={() => setActiveBizCategory('all')}>
                  <div className="summary-key">全部</div>
                  <div className="summary-value">{data.totalFiles}</div>
                </button>
                {PRIMARY_DOCUMENT_CATEGORIES.map((category) => {
                  const matched = bizCategorySummary.find((item) => item.key === category.key);
                  return (
                    <button key={category.key} className={`summary-item filter-card ${activeBizCategory === category.key ? 'active-filter' : ''}`} onClick={() => setActiveBizCategory(category.key)}>
                      <div className="summary-key">{category.label}</div>
                      <div className="summary-value">{matched?.value || 0}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>分组</h3>
                  <p>分组支持 AI 建议与用户自定义，后续会支持一份资料属于多个分组。</p>
                </div>
              </div>
              <div className="message-refs" style={{ gap: 10 }}>
                <button className={`ref-chip ${activeCustomCategory === 'all' ? 'active-filter' : ''}`} onClick={() => setActiveCustomCategory('all')}>全部分组</button>
                {customCategorySummary.map((item) => (
                  <button key={item.key} className={`ref-chip ${activeCustomCategory === item.key ? 'active-filter' : ''}`} onClick={() => setActiveCustomCategory(item.key)}>
                    {item.label} · {item.count}
                  </button>
                ))}
              </div>
            </section>

            <section className="documents-grid three-columns">
              <section className="card documents-card">
                <div className="panel-header">
                  <div>
                    <h3>状态</h3>
                    <p>当前文档整体情况。</p>
                  </div>
                </div>
                <div className="summary-grid">
                  <StatCard label="文档总数" value={String(totalFiles)} subtle={data.exists ? '目录可访问' : '目录不存在'} />
                  <StatCard label="新增" value={String(recentCount)} subtle="默认按最近文档排序" />
                  <StatCard label="解析度" value={parseRate} subtle={`${parsedCount} / ${totalFiles || 0}`} />
                </div>
              </section>

              <section className="card documents-card">
                <div className="panel-header">
                  <div>
                    <h3>后缀包含</h3>
                    <p>先做轻筛选，避免列表太散。</p>
                  </div>
                </div>
                <div className="message-refs" style={{ gap: 10 }}>
                  <button className={`ref-chip ${activeExtension === 'all' ? 'active-filter' : ''}`} onClick={() => setActiveExtension('all')}>全部后缀</button>
                  {extensionSummary.map(([ext, count]) => (
                    <button key={ext} className={`ref-chip ${activeExtension === ext ? 'active-filter' : ''}`} onClick={() => setActiveExtension(ext)}>
                      {ext} · {count}
                    </button>
                  ))}
                </div>
              </section>

              <section className="card documents-card">
                <div className="panel-header">
                  <div>
                    <h3>关键字搜索</h3>
                    <p>支持文件名、摘要、摘录、标签搜索。</p>
                  </div>
                </div>
                <input className="filter-input" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索文件名、摘要、主题词..." />
                <div className="page-note" style={{ marginTop: '12px', marginBottom: 0 }}>
                  当前结果：{filteredItems.length} / {data.items.length}
                </div>
              </section>
            </section>

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>重复文档提示（待接实）</h3>
                  <p>后续这里会延迟提示“XX 文档重复（摘要 90%）”，默认覆盖并保留最新日期，也支持用户放弃合并；分组建议也会在上传后一起给出。</p>
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
                  <p>默认按最近文档排序，并按上面的分类/分组/状态筛选结果展示。</p>
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
                      <td className="summary-cell">{(item.confirmedGroups || item.groups || []).join('、') || '-'}</td>
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
