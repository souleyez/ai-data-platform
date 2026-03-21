'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { buildApiUrl } from '../lib/config';
import { formatDocumentBusinessResult, normalizeDatasourceResponse, normalizeDocumentsResponse } from '../lib/types';
import { sourceItems } from '../lib/mock-data';

const BIZ_CATEGORY_LABELS = {
  paper: '学术论文',
  contract: '合同协议',
  daily: '工作日报',
  invoice: '发票凭据',
  order: '订单分析',
  service: '客服采集',
  inventory: '库存监控',
};

const PARSE_METHOD_LABELS = {
  'text-utf8': 'UTF-8 文本',
  'markdown-utf8': 'Markdown',
  'csv-utf8': 'CSV',
  'json-parse': 'JSON',
  'html-strip': 'HTML 清洗',
  'mammoth': 'DOCX 提取',
  'xlsx-sheet-reader': '表格读取',
  'pdf-parse': 'PDF 文本',
  'pypdf': 'PyPDF',
  'pdf-auto': 'PDF 自动解析',
  'ocr-fallback': 'OCR fallback',
  'unsupported': '暂不支持',
  error: '解析失败',
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
  const [activeLibrary, setActiveLibrary] = useState('all');
  const [newLibraryName, setNewLibraryName] = useState('');
  const [librarySubmitting, setLibrarySubmitting] = useState(false);
  const [assignmentSubmittingId, setAssignmentSubmittingId] = useState('');
  const [libraryDrafts, setLibraryDrafts] = useState({});

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

  const createLibrary = async () => {
    const name = newLibraryName.trim();
    if (!name || librarySubmitting) return;

    try {
      setLibrarySubmitting(true);
      setScanMessage('');
      const response = await fetch(buildApiUrl('/api/documents/libraries'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error('create library failed');
      const json = await response.json();
      setScanMessage(json.message || `已新增知识库分组“${name}”`);
      setNewLibraryName('');
      await loadDocuments();
    } catch {
      setScanMessage('新增知识库分组失败，请稍后重试');
    } finally {
      setLibrarySubmitting(false);
    }
  };

  const deleteLibrary = async (library) => {
    if (!library?.key || librarySubmitting) return;

    try {
      setLibrarySubmitting(true);
      setScanMessage('');
      const response = await fetch(buildApiUrl(`/api/documents/libraries/${library.key}`), {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('delete library failed');
      const json = await response.json();
      if (activeLibrary === library.key) setActiveLibrary('all');
      setScanMessage(json.message || `已删除知识库分组“${library.label}”`);
      await loadDocuments();
    } catch {
      setScanMessage('删除知识库分组失败，请稍后重试');
    } finally {
      setLibrarySubmitting(false);
    }
  };

  const updateDocumentLibraries = async (itemId, groups) => {
    if (!itemId) return;

    try {
      setAssignmentSubmittingId(itemId);
      const response = await fetch(buildApiUrl('/api/documents/groups'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: itemId, groups }] }),
      });
      if (!response.ok) throw new Error('update groups failed');
      await loadDocuments();
    } catch {
      setScanMessage('更新知识库分组失败，请稍后重试');
    } finally {
      setAssignmentSubmittingId('');
    }
  };

  const extensionSummary = useMemo(() => (data?.byExtension ? Object.entries(data.byExtension) : []), [data]);
  const libraries = useMemo(() => Array.isArray(data?.libraries) ? data.libraries : [], [data]);
  const libraryLabelMap = useMemo(
    () => new Map(libraries.map((item) => [item.key, item.label])),
    [libraries],
  );

  const filteredItems = useMemo(() => {
    const items = data?.items || [];
    const normalizedKeyword = keyword.trim().toLowerCase();

    return items
      .filter((item) => {
        const groups = item.confirmedGroups || item.groups || [];
        const extensionMatch = activeExtension === 'all' || item.ext === activeExtension;
        const libraryMatch = activeLibrary === 'all'
          || (activeLibrary === 'ungrouped' ? groups.length === 0 : groups.includes(activeLibrary));
        const keywordMatch = !normalizedKeyword
          || item.name.toLowerCase().includes(normalizedKeyword)
          || item.summary.toLowerCase().includes(normalizedKeyword)
          || item.excerpt.toLowerCase().includes(normalizedKeyword)
          || (item.topicTags || []).join(' ').toLowerCase().includes(normalizedKeyword)
          || groups.map((group) => libraryLabelMap.get(group) || group).join(' ').toLowerCase().includes(normalizedKeyword);

        return extensionMatch && libraryMatch && keywordMatch;
      })
      .sort((a, b) => extractTimestamp(b) - extractTimestamp(a) || String(b.path).localeCompare(String(a.path)));
  }, [activeExtension, activeLibrary, data, keyword, libraryLabelMap]);

  const parsedCount = data?.meta?.parsed || 0;
  const totalFiles = data?.totalFiles || 0;
  const parseRate = totalFiles ? `${Math.round((parsedCount / totalFiles) * 100)}%` : '0%';
  const recentCount = useMemo(() => filteredItems.filter((item) => extractTimestamp(item) > 0).slice(0, 10).length, [filteredItems]);
  const ungroupedCount = useMemo(() => (data?.items || []).filter((item) => !(item.confirmedGroups || item.groups || []).length).length, [data]);

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/documents" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>文档中心</h2>
            <p>首页业务类继续保持固定分类；文档中心新增灵活知识库分组，便于后续按分组做分析结果和数据可视化。</p>
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
            <section className="workbench-toolbar card">
              <div className="workbench-toolbar-label">知识库分组</div>
              <div className="workbench-toolbar-tabs">
                <button className={`workbench-tab ${activeLibrary === 'all' ? 'active' : ''}`} onClick={() => setActiveLibrary('all')}>
                  全部文档
                </button>
                {libraries.map((library) => (
                  <button
                    key={library.key}
                    className={`workbench-tab ${activeLibrary === library.key ? 'active' : ''}`}
                    onClick={() => setActiveLibrary(library.key)}
                  >
                    <span>{library.label}</span>
                    <span className="library-tab-count">{data?.meta?.libraryCounts?.[library.key] ?? 0}</span>
                  </button>
                ))}
                <button className={`workbench-tab ${activeLibrary === 'ungrouped' ? 'active' : ''}`} onClick={() => setActiveLibrary('ungrouped')}>
                  <span>未分组</span>
                  <span className="library-tab-count">{ungroupedCount}</span>
                </button>
              </div>
            </section>

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>知识库分组管理</h3>
                  <p>知识库分组支持自由新增、删除与多选挂载；删除分组不会删除文档本身，只会移除分组关联。</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  className="filter-input"
                  style={{ maxWidth: 260 }}
                  value={newLibraryName}
                  onChange={(event) => setNewLibraryName(event.target.value)}
                  placeholder="新增知识库分组，例如：售前案例库"
                />
                <button className="primary-btn" onClick={createLibrary} disabled={librarySubmitting || !newLibraryName.trim()}>
                  {librarySubmitting ? '处理中...' : '新增分组'}
                </button>
                {libraries.map((library) => (
                  <span key={library.key} className="source-chip" style={{ gap: 8 }}>
                    {library.label}
                    <button
                      type="button"
                      onClick={() => deleteLibrary(library)}
                      style={{ border: 'none', background: 'transparent', color: '#475569', cursor: 'pointer', padding: 0 }}
                    >
                      删除
                    </button>
                  </span>
                ))}
              </div>
            </section>

            <section className="card documents-card" style={{ paddingTop: 10, paddingBottom: 10 }}>
              <div className="message-refs" style={{ gap: 8, alignItems: 'center' }}>
                <span className="source-chip">总数 {totalFiles}</span>
                <span className="source-chip">新增 {recentCount}</span>
                <span className="source-chip">解析 {parseRate}</span>
                <span className="source-chip">结果 {filteredItems.length}/{data.items.length}</span>
                <button className={`ref-chip ${activeExtension === 'all' ? 'active-filter' : ''}`} onClick={() => setActiveExtension('all')}>全部格式</button>
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
                  placeholder="搜索文件名、摘要、知识库分组..."
                />
              </div>
            </section>

            <section className="card table-card">
              <div className="panel-header">
                <div>
                  <h3>文档列表</h3>
                  <p>顶部知识库分组用于灵活组织同一份文档，文档分类仍保持原有固定业务分类语义。</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>文件名</th>
                    <th>分类</th>
                    <th>知识库分组</th>
                    <th>解析状态</th>
                    <th>??????</th>
                    <th>业务结果</th>
                    <th>摘要</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const groups = item.confirmedGroups || item.groups || [];
                    const availableLibraries = libraries.filter((library) => !groups.includes(library.key));
                    const draftValue = libraryDrafts[item.id] || availableLibraries[0]?.key || '';

                    return (
                      <tr key={item.path}>
                        <td><a href={`/documents/${item.id}`}>{item.name}</a></td>
                        <td>{BIZ_CATEGORY_LABELS[item.confirmedBizCategory || item.bizCategory] || item.bizCategory}</td>
                        <td className="summary-cell">
                          <div style={{ display: 'grid', gap: 8 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              {groups.length ? groups.map((group) => (
                                <span key={group} className="source-chip" style={{ gap: 8 }}>
                                  {libraryLabelMap.get(group) || group}
                                  <button
                                    type="button"
                                    onClick={() => updateDocumentLibraries(item.id, groups.filter((entry) => entry !== group))}
                                    disabled={assignmentSubmittingId === item.id}
                                    style={{ border: 'none', background: 'transparent', color: '#475569', cursor: 'pointer', padding: 0 }}
                                  >
                                    移除
                                  </button>
                                </span>
                              )) : <span style={{ color: '#64748b' }}>未加入知识库分组</span>}
                            </div>
                            {availableLibraries.length ? (
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <select
                                  className="filter-input"
                                  style={{ minWidth: 160, maxWidth: 220 }}
                                  value={draftValue}
                                  onChange={(event) => setLibraryDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))}
                                >
                                  {availableLibraries.map((library) => (
                                    <option key={library.key} value={library.key}>{library.label}</option>
                                  ))}
                                </select>
                                <button
                                  className="ghost-btn"
                                  type="button"
                                  disabled={!draftValue || assignmentSubmittingId === item.id}
                                  onClick={() => updateDocumentLibraries(item.id, [...groups, draftValue])}
                                >
                                  {assignmentSubmittingId === item.id ? '保存中...' : '加入分组'}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="summary-cell">
                          <div style={{ display: 'grid', gap: 6 }}>
                            <span>{item.parseStatus}</span>
                            {item.retentionStatus === 'structured-only' ? (
                              <span className="source-chip">仅保留结构化数据</span>
                            ) : null}
                          </div>
                        </td>
                        <td>{PARSE_METHOD_LABELS[item.parseMethod] || item.parseMethod || '-'}</td>
                        <td className="summary-cell">{formatDocumentBusinessResult(item)}</td>
                        <td className="summary-cell">{item.summary}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          </section>
        ) : null}
      </main>
    </div>
  );
}
