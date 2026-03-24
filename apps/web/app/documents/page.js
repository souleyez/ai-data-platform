'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { buildApiUrl } from '../lib/config';
import {
  extractDocumentTimestamp,
  getDocumentLibraryKeys,
  getLibraryDocumentCount,
  sortLibrariesForDisplay,
} from '../lib/knowledge-libraries';
import { formatDocumentBusinessResult, normalizeDatasourceResponse, normalizeDocumentsResponse } from '../lib/types';

const PARSE_METHOD_LABELS = {
  'text-utf8': 'UTF-8 文本',
  'markdown-utf8': 'Markdown',
  'csv-utf8': 'CSV',
  'json-parse': 'JSON',
  'html-strip': 'HTML 清洗',
  mammoth: 'DOCX 提取',
  'xlsx-sheet-reader': '表格读取',
  'pdf-parse': 'PDF 文本',
  pypdf: 'PyPDF',
  'pdf-auto': 'PDF 自动解析',
  'ocr-fallback': 'OCR fallback',
  unsupported: '暂不支持',
  error: '解析失败',
};

export default function DocumentsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [error, setError] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [sidebarSources, setSidebarSources] = useState([
    { name: '文档中心', status: 'success' },
    { name: '本地扫描源', status: 'success' },
    { name: '知识库分组', status: 'success' },
  ]);
  const [keyword, setKeyword] = useState('');
  const [activeExtension, setActiveExtension] = useState('all');
  const [activeLibrary, setActiveLibrary] = useState('all');
  const [assignmentSubmittingId, setAssignmentSubmittingId] = useState('');
  const [ignoreSubmittingId, setIgnoreSubmittingId] = useState('');
  const [libraryDrafts, setLibraryDrafts] = useState({});
  const [expandedLibraryEditorId, setExpandedLibraryEditorId] = useState('');
  const [scanRootDraft, setScanRootDraft] = useState('');
  const [scanSourceSubmitting, setScanSourceSubmitting] = useState(false);
  const [candidateSourceLoading, setCandidateSourceLoading] = useState(false);
  const [candidateSourceSubmitting, setCandidateSourceSubmitting] = useState(false);
  const [candidateSources, setCandidateSources] = useState([]);
  const [selectedCandidatePaths, setSelectedCandidatePaths] = useState([]);
  const [scanSourcesExpanded, setScanSourcesExpanded] = useState(false);
  const [recentNewIds, setRecentNewIds] = useState([]);

  const formatLocalTime = (value) => {
    const timestamp = Number(value || 0);
    return timestamp > 0 ? new Date(timestamp).toLocaleString('zh-CN') : '未知';
  };

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch(buildApiUrl('/api/documents'));
      if (!response.ok) throw new Error('load documents failed');
      const normalized = normalizeDocumentsResponse(await response.json());
      setData(normalized);
      setScanRootDraft((current) => current || normalized.scanRoot || '');
      return normalized;
    } catch {
      setError('文档接口暂时不可用');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const loadDatasources = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/datasources'));
      if (!response.ok) throw new Error('load datasources failed');
      const normalized = normalizeDatasourceResponse(await response.json());
      if (normalized.items.length) setSidebarSources(normalized.items);
    } catch {
      // keep local fallback
    }
  };

  useEffect(() => {
    loadDocuments();
    loadDatasources();
  }, []);

  const runScanWorkflow = async (request, successMessage) => {
    const beforeIds = new Set((data?.items || []).map((item) => item.id));
    setScanSourcesExpanded(false);
    setScanMessage('');

    const response = await request();
    if (!response.ok) throw new Error('scan workflow failed');
    const json = await response.json();

    const organizeResponse = await fetch(buildApiUrl('/api/documents/organize'), { method: 'POST' });
    if (!organizeResponse.ok) throw new Error('organize after scan failed');

    const refreshed = await loadDocuments();
    const newIds = (refreshed?.items || []).filter((item) => !beforeIds.has(item.id)).map((item) => item.id);

    if (newIds.length) {
      const acceptResponse = await fetch(buildApiUrl('/api/documents/groups/accept-suggestions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: newIds.map((id) => ({ id })) }),
      });
      if (acceptResponse.ok) {
        await loadDocuments();
      }
    }

    setRecentNewIds(newIds);
    setScanMessage(json.message || successMessage);
  };

  const handlePrimaryScan = async () => {
    try {
      setScanLoading(true);
      const response = await fetch(buildApiUrl('/api/documents/recluster-ungrouped'), { method: 'POST' });
      if (!response.ok) throw new Error('recluster ungrouped failed');
      const json = await response.json();
      await loadDocuments();
      setScanMessage(json.message || '未分组文档已重新分组');
    } catch {
      setScanMessage('未分组文档重新分组失败，请稍后重试');
    } finally {
      setScanLoading(false);
    }
  };

  const loadCandidateSources = async () => {
    try {
      setCandidateSourceLoading(true);
      setScanMessage('');
      const response = await fetch(buildApiUrl('/api/documents/candidate-sources'));
      if (!response.ok) throw new Error('load candidate sources failed');
      const payload = await response.json();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setCandidateSources(items);
      setSelectedCandidatePaths((current) => current.filter((item) => items.some((candidate) => candidate.path === item)));
    } catch {
      setScanMessage('发现本机候选目录失败，请稍后重试');
    } finally {
      setCandidateSourceLoading(false);
    }
  };

  const toggleCandidatePath = (candidatePath) => {
    setSelectedCandidatePaths((current) => (
      current.includes(candidatePath)
        ? current.filter((item) => item !== candidatePath)
        : [...current, candidatePath]
    ));
  };

  const handleCandidateImportScan = async () => {
    if (!selectedCandidatePaths.length) return;
    try {
      setCandidateSourceSubmitting(true);
      await runScanWorkflow(
        () => fetch(buildApiUrl('/api/documents/candidate-sources/import'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scanRoots: selectedCandidatePaths, scanNow: true }),
        }),
        '候选目录已加入扫描源并完成索引入库',
      );
    } catch {
      setScanMessage('候选目录导入失败，请稍后重试');
    } finally {
      setCandidateSourceSubmitting(false);
    }
  };

  const ignoreDocument = async (itemId) => {
    if (!itemId || ignoreSubmittingId) return;
    try {
      setIgnoreSubmittingId(itemId);
      const response = await fetch(buildApiUrl('/api/documents/ignore'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: itemId, ignored: true }] }),
      });
      if (!response.ok) throw new Error('ignore document failed');
      await loadDocuments();
      setScanMessage('文档已忽略，已从列表隐藏');
    } catch {
      setScanMessage('忽略文档失败，请稍后重试');
    } finally {
      setIgnoreSubmittingId('');
    }
  };

  const addScanSource = async () => {
    const scanRoot = scanRootDraft.trim();
    if (!scanRoot) return;
    setCandidateSources((current) => {
      if (current.some((item) => item.path === scanRoot)) return current;
      return [{
        key: `manual-${scanRoot}`,
        label: '手动指定目录',
        reason: '用户手动输入的本地目录',
        path: scanRoot,
        exists: true,
        fileCount: 0,
        latestModifiedAt: Date.now(),
        truncated: false,
        pendingScan: true,
        manual: true,
      }, ...current];
    });
    setSelectedCandidatePaths((current) => (current.includes(scanRoot) ? current : [...current, scanRoot]));
    setScanRootDraft('');
  };

  const setPrimaryScanSource = async (scanRoot) => {
    if (!scanRoot) return;
    try {
      setScanSourceSubmitting(true);
      setScanMessage('');
      const response = await fetch(buildApiUrl('/api/documents/scan-sources/primary'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanRoot }),
      });
      if (!response.ok) throw new Error('set primary scan source failed');
      const json = await response.json();
      setScanMessage(json.message || '主扫描目录已更新');
      setScanRootDraft(scanRoot);
      await loadDocuments();
    } catch {
      setScanMessage('更新主扫描目录失败，请稍后重试');
    } finally {
      setScanSourceSubmitting(false);
    }
  };

  const removeScanSource = async (scanRoot) => {
    if (!scanRoot) return;
    try {
      setScanSourceSubmitting(true);
      setScanMessage('');
      const response = await fetch(buildApiUrl('/api/documents/scan-sources/remove'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanRoot }),
      });
      if (!response.ok) throw new Error('remove scan source failed');
      const json = await response.json();
      setScanMessage(json.message || '扫描目录已移除');
      await loadDocuments();
    } catch {
      setScanMessage('移除扫描目录失败，请稍后重试');
    } finally {
      setScanSourceSubmitting(false);
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

  const acceptSuggestedGroups = async (itemIds) => {
    const ids = (itemIds || []).filter(Boolean);
    if (!ids.length) return;
    try {
      setAssignmentSubmittingId(ids.length === 1 ? ids[0] : '__bulk_accept__');
      const response = await fetch(buildApiUrl('/api/documents/groups/accept-suggestions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: ids.map((id) => ({ id })) }),
      });
      if (!response.ok) throw new Error('accept suggestions failed');
      const json = await response.json();
      setScanMessage(json.message || '已接受建议分组');
      await loadDocuments();
    } catch {
      setScanMessage('接受建议分组失败，请稍后重试');
    } finally {
      setAssignmentSubmittingId('');
    }
  };

  const extensionSummary = useMemo(() => (data?.byExtension ? Object.entries(data.byExtension) : []), [data]);
  const libraries = useMemo(
    () => sortLibrariesForDisplay(Array.isArray(data?.libraries) ? data.libraries : [], data?.items || []),
    [data],
  );
  const libraryLabelMap = useMemo(() => new Map(libraries.map((item) => [item.key, item.label])), [libraries]);
  const visibleItems = useMemo(
    () => (data?.items || []).filter((item) => !item.ignored && item.parseStatus !== 'error'),
    [data],
  );
  const isUngroupedItem = (item) => !(item.confirmedGroups?.length) && !(item.suggestedGroups?.length);

  const filteredItems = useMemo(() => {
    const items = visibleItems;
    const normalizedKeyword = keyword.trim().toLowerCase();
    return items
      .filter((item) => {
        const effectiveGroups = getDocumentLibraryKeys(item, libraries);
        const extensionMatch = activeExtension === 'all' || item.ext === activeExtension;
        const libraryMatch = activeLibrary === 'all'
          || (activeLibrary === 'ungrouped' ? isUngroupedItem(item) : effectiveGroups.includes(activeLibrary));
        const haystack = [
          String(item?.name || ''),
          String(item?.summary || ''),
          String(item?.excerpt || ''),
          (Array.isArray(item?.topicTags) ? item.topicTags : []).join(' '),
          effectiveGroups.map((group) => libraryLabelMap.get(group) || group).join(' '),
        ].join(' ').toLowerCase();
        return extensionMatch && libraryMatch && (!normalizedKeyword || haystack.includes(normalizedKeyword));
      })
      .sort((a, b) => extractDocumentTimestamp(b) - extractDocumentTimestamp(a) || String(b.path).localeCompare(String(a.path)));
  }, [activeExtension, activeLibrary, keyword, libraries, libraryLabelMap, visibleItems]);

  const parsedCount = data?.meta?.parsed || 0;
  const totalFiles = data?.totalFiles || 0;
  const parseRate = totalFiles ? `${Math.round((parsedCount / totalFiles) * 100)}%` : '0%';
  const recentCount = useMemo(() => filteredItems.filter((item) => extractDocumentTimestamp(item) > 0).slice(0, 10).length, [filteredItems]);
  const ungroupedCount = useMemo(() => visibleItems.filter((item) => isUngroupedItem(item)).length, [visibleItems]);
  const scanSources = data?.scanRoots || [];

  const directoryOptions = useMemo(() => {
    const byPath = new Map();
    for (const scanSource of scanSources) {
      byPath.set(scanSource, {
        key: `source-${scanSource}`,
        label: scanSource === data?.scanRoot ? '当前主扫描目录' : '已加入扫描源',
        reason: '当前已纳入文档中心扫描范围',
        path: scanSource,
        exists: true,
        fileCount: 0,
        latestModifiedAt: 0,
        truncated: false,
        pendingScan: true,
        alreadyAdded: true,
      });
    }
    for (const candidate of candidateSources) {
      byPath.set(candidate.path, { ...candidate, alreadyAdded: byPath.has(candidate.path) });
    }
    return Array.from(byPath.values());
  }, [candidateSources, data?.scanRoot, scanSources]);

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/documents" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>AI 知识库</h2>
            <p>首次无法判断的文档会保留在未分组，右上角按钮只重扫未分组文档并尝试重新归组。</p>
          </div>
          <div className="topbar-actions">
            <button className="ghost-btn" onClick={loadDocuments}>刷新</button>
            <button className="primary-btn" onClick={handlePrimaryScan} disabled={scanLoading}>
              {scanLoading ? '处理中...' : '立即扫描未分组文档'}
            </button>
          </div>
        </header>

        {loading ? <p>加载中...</p> : null}
        {error ? <p>{error}</p> : null}
        {scanMessage ? <div className="page-note">{scanMessage}</div> : null}

        {data ? (
          <section className="documents-layout">
            <section className="workbench-toolbar card">
              <div className="workbench-toolbar-label">知识库分组</div>
              <div className="workbench-toolbar-tabs">
                {libraries.map((library) => (
                  <button
                    key={library.key}
                    className={`workbench-tab ${activeLibrary === library.key ? 'active' : ''}`}
                    onClick={() => setActiveLibrary(library.key)}
                  >
                    <span>{library.label}</span>
                    <span className="library-tab-count">{getLibraryDocumentCount(library, visibleItems, libraries)}</span>
                  </button>
                ))}
                <button className={`workbench-tab ${activeLibrary === 'all' ? 'active' : ''}`} onClick={() => setActiveLibrary('all')}>
                  全部文档
                </button>
                <button className={`workbench-tab ${activeLibrary === 'ungrouped' ? 'active' : ''}`} onClick={() => setActiveLibrary('ungrouped')}>
                  <span>未分组</span>
                  <span className="library-tab-count">{ungroupedCount}</span>
                </button>
              </div>
            </section>

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>扫描源</h3>
                  <p>发现本机候选目录，勾选后加入扫描源并直接扫描入库。</p>
                </div>
                <button className="ghost-btn" type="button" onClick={() => setScanSourcesExpanded((current) => !current)}>
                  {scanSourcesExpanded ? '收起扫描源' : '展开扫描源'}
                </button>
              </div>
              {scanSourcesExpanded ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div>
                      <strong>本机候选目录发现</strong>
                      <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>
                        自动发现 Desktop、Documents、Downloads 等目录。可能过程较慢，请谨慎选择。
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="ghost-btn" onClick={loadCandidateSources} disabled={candidateSourceLoading}>
                        {candidateSourceLoading ? '发现中...' : '发现本机候选目录'}
                      </button>
                      <button className="primary-btn" onClick={handleCandidateImportScan} disabled={candidateSourceSubmitting || !selectedCandidatePaths.length}>
                        {candidateSourceSubmitting ? '入库中...' : `加入扫描源并扫描 (${selectedCandidatePaths.length})`}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 12, border: scanRootDraft.trim() ? '1px solid #0f766e' : '1px solid #e2e8f0', background: scanRootDraft.trim() ? '#f0fdfa' : '#ffffff' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong>手动指定目录</strong>
                      <span style={{ color: '#475569', fontSize: 13 }}>输入本地目录后加入同一批扫描列表</span>
                    </div>
                    <input className="filter-input" value={scanRootDraft} onChange={(event) => setScanRootDraft(event.target.value)} placeholder="例如：C:\\docs\\papers" />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="ghost-btn" onClick={addScanSource} disabled={scanSourceSubmitting || !scanRootDraft.trim()}>
                        {scanSourceSubmitting ? '处理中...' : '加入目录列表'}
                      </button>
                    </div>
                  </div>

                  {directoryOptions.length ? (
                    <div style={{ display: 'grid', gap: 10 }}>
                      {directoryOptions.map((candidate) => (
                        <label key={candidate.path} style={{ display: 'grid', gap: 6, padding: 12, borderRadius: 12, border: selectedCandidatePaths.includes(candidate.path) ? '1px solid #0f766e' : '1px solid #e2e8f0', background: selectedCandidatePaths.includes(candidate.path) ? '#f0fdfa' : '#ffffff', cursor: 'pointer' }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <input type="checkbox" checked={selectedCandidatePaths.includes(candidate.path)} onChange={() => toggleCandidatePath(candidate.path)} />
                            <strong>{candidate.label}</strong>
                            <span style={{ color: '#475569', fontSize: 13 }}>{candidate.reason}</span>
                            {candidate.alreadyAdded ? <span className="source-chip" style={{ background: '#ecfeff', color: '#0f766e' }}>已加入</span> : null}
                            {candidate.path === data?.scanRoot ? <span className="source-chip" style={{ background: '#eff6ff', color: '#1d4ed8' }}>主目录</span> : null}
                          </div>
                          <div style={{ color: '#0f172a', fontSize: 13, wordBreak: 'break-all' }}>{candidate.path}</div>
                          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', color: '#64748b', fontSize: 12 }}>
                            <span>预计文件 {candidate.pendingScan ? '待扫描' : `${candidate.fileCount}${candidate.truncated ? '+' : ''}`}</span>
                            <span>最近更新 {formatLocalTime(candidate.latestModifiedAt)}</span>
                            {candidate.path !== data?.scanRoot && candidate.alreadyAdded ? (
                              <button type="button" onClick={(event) => { event.preventDefault(); setPrimaryScanSource(candidate.path); }} style={{ border: 'none', background: 'transparent', color: '#475569', cursor: 'pointer', padding: 0 }}>
                                设为主目录
                              </button>
                            ) : null}
                            {candidate.alreadyAdded && scanSources.length > 1 ? (
                              <button type="button" onClick={(event) => { event.preventDefault(); removeScanSource(candidate.path); }} style={{ border: 'none', background: 'transparent', color: '#475569', cursor: 'pointer', padding: 0 }}>
                                移除
                              </button>
                            ) : null}
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: '#64748b', fontSize: 13 }}>先点击“发现本机候选目录”获取可勾选的本地目录列表。</div>
                  )}
                </div>
              ) : null}
            </section>

            <section className="card documents-card" style={{ paddingTop: 10, paddingBottom: 10 }}>
              <div className="message-refs" style={{ gap: 8, alignItems: 'center' }}>
                <span className="source-chip">总数 {totalFiles}</span>
                <span className="source-chip">新增 {recentCount}</span>
                <span className="source-chip">解析 {parseRate}</span>
                <span className="source-chip">结果 {filteredItems.length}/{visibleItems.length}</span>
                <button className={`ref-chip ${activeExtension === 'all' ? 'active-filter' : ''}`} onClick={() => setActiveExtension('all')}>全部格式</button>
                {extensionSummary.map(([ext, count]) => (
                  <button key={ext} className={`ref-chip ${activeExtension === ext ? 'active-filter' : ''}`} onClick={() => setActiveExtension(ext)}>
                    {ext} {count}
                  </button>
                ))}
                <input className="filter-input" style={{ minWidth: 200, flex: '1 1 200px', marginLeft: 'auto' }} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索文件名、摘要、知识库分组..." />
              </div>
            </section>

            <section className="card table-card">
              <div className="panel-header">
                <div>
                  <h3>文档列表</h3>
                  <p>扫描结果会直接归入知识库。需要调整时，可在这里手动补充分组或忽略文档。</p>
                </div>
              </div>
              <table>
                <colgroup>
                  <col style={{ width: '24%' }} />
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '16%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>文件名</th>
                    <th>知识库分组</th>
                    <th>解析</th>
                    <th>业务结果</th>
                    <th>摘要</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const groups = item.confirmedGroups || item.groups || [];
                    const suggestedGroups = item.confirmedGroups?.length ? [] : (item.suggestedGroups || []);
                    const effectiveGroups = getDocumentLibraryKeys(item, libraries);
                    const availableLibraries = libraries.filter((library) => !effectiveGroups.includes(library.key));
                    const draftValue = libraryDrafts[item.id] || availableLibraries[0]?.key || '';
                    return (
                      <tr key={item.id} style={recentNewIds.includes(item.id) ? { background: '#f0fdf4' } : undefined}>
                        <td className="document-name-cell">
                          <div style={{ display: 'grid', gap: 6 }}>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                              <a href={`/documents/${item.id}`}>{item.name}</a>
                              {recentNewIds.includes(item.id) ? <span className="source-chip" style={{ background: '#dcfce7', color: '#166534' }}>新增</span> : null}
                            </div>
                            <div>
                              <button type="button" className="ghost-btn compact-inline-btn" onClick={() => ignoreDocument(item.id)} disabled={ignoreSubmittingId === item.id}>
                                {ignoreSubmittingId === item.id ? '处理中...' : '忽略'}
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="library-cell">
                          <div style={{ display: 'grid', gap: 8 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              {effectiveGroups.length ? effectiveGroups.map((group) => {
                                const matchedLibrary = libraries.find((library) => library.key === group);
                                const removable = groups.includes(group) && !matchedLibrary?.isDefault;
                                return (
                                  <span key={group} className="source-chip" style={{ gap: 8 }}>
                                    {libraryLabelMap.get(group) || group}
                                    {removable ? (
                                      <button
                                        type="button"
                                        onClick={() => updateDocumentLibraries(item.id, groups.filter((entry) => entry !== group))}
                                        disabled={assignmentSubmittingId === item.id}
                                        style={{ border: 'none', background: 'transparent', color: '#475569', cursor: 'pointer', padding: 0 }}
                                      >
                                        移除
                                      </button>
                                    ) : null}
                                  </span>
                                );
                              }) : <span style={{ color: '#64748b' }}>未加入知识库分组</span>}
                            </div>
                            {suggestedGroups.length ? (
                              <div style={{ display: 'grid', gap: 8 }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                  {suggestedGroups.map((group) => (
                                    <span key={`suggested-${item.id}-${group}`} className="source-chip" style={{ background: '#fff7ed', borderColor: '#fdba74' }}>
                                      建议: {libraryLabelMap.get(group) || group}
                                    </span>
                                  ))}
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  <button
                                    className="ghost-btn compact-inline-btn"
                                    type="button"
                                    onClick={() => acceptSuggestedGroups([item.id])}
                                    disabled={assignmentSubmittingId === item.id}
                                  >
                                    {assignmentSubmittingId === item.id ? '接受中...' : '接受建议'}
                                  </button>
                                </div>
                              </div>
                            ) : null}
                            {availableLibraries.length ? (
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {expandedLibraryEditorId === item.id ? (
                                  <>
                                    <select className="filter-input" style={{ minWidth: 160, maxWidth: 220 }} value={draftValue} onChange={(event) => setLibraryDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))}>
                                      {availableLibraries.map((library) => <option key={library.key} value={library.key}>{library.label}</option>)}
                                    </select>
                                    <button className="ghost-btn" type="button" disabled={!draftValue || assignmentSubmittingId === item.id} onClick={async () => { await updateDocumentLibraries(item.id, [...groups, draftValue]); setExpandedLibraryEditorId(''); }}>
                                      {assignmentSubmittingId === item.id ? '保存中...' : '确认'}
                                    </button>
                                    <button className="ghost-btn" type="button" onClick={() => setExpandedLibraryEditorId('')} disabled={assignmentSubmittingId === item.id}>取消</button>
                                  </>
                                ) : (
                                  <button className="ghost-btn compact-inline-btn" type="button" onClick={() => setExpandedLibraryEditorId(item.id)}>添加</button>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="summary-cell">
                          <div style={{ display: 'grid', gap: 6 }}>
                            <span>{item.parseStatus}</span>
                            <span style={{ fontSize: 12, color: '#64748b' }}>{PARSE_METHOD_LABELS[item.parseMethod] || item.parseMethod || '-'}</span>
                          </div>
                        </td>
                        <td className="summary-cell">{formatDocumentBusinessResult(item)}</td>
                        <td className="summary-cell excerpt-cell">{item.summary}</td>
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
