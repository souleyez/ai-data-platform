'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import {
  getDocumentLibraryKeys,
  getLibraryDocumentCount,
  sortLibrariesForDisplay,
} from '../lib/knowledge-libraries';
import { formatDocumentBusinessResult } from '../lib/types';
import {
  acceptDocumentGroupSuggestions,
  createDocumentLibrary,
  fetchCandidateSources,
  fetchDatasources,
  fetchDocuments,
  ignoreDocuments,
  importCandidateSources,
  organizeDocuments,
  reclusterUngroupedDocuments,
  removeDocumentScanSource,
  saveDocumentGroups,
  setPrimaryDocumentScanSource,
} from './api';
import DocumentFiltersBar from './DocumentFiltersBar';
import DocumentsTable from './DocumentsTable';
import LibraryTabs from './LibraryTabs';
import ScanSourcesPanel from './ScanSourcesPanel';
import {
  buildDirectoryOptions,
  buildExtensionSummary,
  buildFilteredItems,
  buildVisibleItems,
  countRecentDocuments,
  isUngroupedDocument,
  paginateItems,
} from './selectors';

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

const PAGE_SIZE = 50;
const DEFAULT_SIDEBAR_SOURCES = [
  { name: '文档中心', status: 'success' },
  { name: '本地扫描源', status: 'success' },
  { name: '知识库分组', status: 'success' },
];

export default function DocumentsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [error, setError] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [sidebarSources, setSidebarSources] = useState(DEFAULT_SIDEBAR_SOURCES);
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
  const [currentPage, setCurrentPage] = useState(1);
  const [libraryCreateDraft, setLibraryCreateDraft] = useState('');
  const [libraryCreateSubmitting, setLibraryCreateSubmitting] = useState(false);

  const formatLocalTime = (value) => {
    const timestamp = Number(value || 0);
    return timestamp > 0 ? new Date(timestamp).toLocaleString('zh-CN') : '未知';
  };

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError('');
      const normalized = await fetchDocuments();
      setData(normalized);
      setScanRootDraft((current) => current || normalized.scanRoot || '');
      return normalized;
    } catch {
      setError('文档中心接口暂时不可用');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const loadDatasources = async () => {
    try {
      const normalized = await fetchDatasources();
      if (normalized.items.length) {
        setSidebarSources(normalized.items);
      }
    } catch {
      // keep fallback sidebar
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

    const json = await request();
    await organizeDocuments();

    const refreshed = await loadDocuments();
    const newIds = (refreshed?.items || [])
      .filter((item) => !beforeIds.has(item.id))
      .map((item) => item.id);

    if (newIds.length) {
      await acceptDocumentGroupSuggestions(newIds.map((id) => ({ id })));
      await loadDocuments();
    }

    setRecentNewIds(newIds);
    setScanMessage(json.message || successMessage);
  };

  const handlePrimaryScan = async () => {
    try {
      setScanLoading(true);
      const json = await reclusterUngroupedDocuments();
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
      const items = await fetchCandidateSources();
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
        () => importCandidateSources(selectedCandidatePaths),
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
      await ignoreDocuments([{ id: itemId, ignored: true }]);
      await loadDocuments();
      setScanMessage('文档索引已删除');
    } catch {
      setScanMessage('忽略文档失败，请稍后重试');
    } finally {
      setIgnoreSubmittingId('');
    }
  };

  const addScanSource = () => {
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
        sampleExtensions: [],
        hotspots: [],
        discoverySource: 'manual',
        discoveryExplanation: '手动指定：由用户直接输入本地目录，加入后会在扫描阶段读取真实文件信息。',
        manual: true,
      }, ...current];
    });

    setSelectedCandidatePaths((current) => (
      current.includes(scanRoot) ? current : [...current, scanRoot]
    ));
    setScanRootDraft('');
  };

  const handleLibraryDraftChange = (itemId, nextValue) => {
    setLibraryDrafts((current) => ({ ...current, [itemId]: nextValue }));
  };

  const openLibraryEditor = (itemId) => {
    setExpandedLibraryEditorId(itemId);
  };

  const closeLibraryEditor = () => {
    setExpandedLibraryEditorId('');
  };

  const setPrimaryScanSource = async (scanRoot) => {
    if (!scanRoot) return;
    try {
      setScanSourceSubmitting(true);
      setScanMessage('');
      const json = await setPrimaryDocumentScanSource(scanRoot);
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
      const json = await removeDocumentScanSource(scanRoot);
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
      await saveDocumentGroups([{ id: itemId, groups }]);
      await loadDocuments();
    } catch {
      setScanMessage('更新知识库分组失败，请稍后重试');
    } finally {
      setAssignmentSubmittingId('');
    }
  };

  const handleCreateLibrary = async () => {
    const name = libraryCreateDraft.trim();
    if (!name || libraryCreateSubmitting) return;
    try {
      setLibraryCreateSubmitting(true);
      setScanMessage('');
      const created = await createDocumentLibrary(name);
      setLibraryCreateDraft('');
      await loadDocuments();
      setActiveLibrary(created?.item?.key || 'all');
      setScanMessage(`已新建知识库分组“${name}”`);
    } catch {
      setScanMessage('新建知识库分组失败，请稍后重试');
    } finally {
      setLibraryCreateSubmitting(false);
    }
  };

  const acceptSuggestedGroups = async (itemIds) => {
    const ids = (itemIds || []).filter(Boolean);
    if (!ids.length) return;
    try {
      setAssignmentSubmittingId(ids.length === 1 ? ids[0] : '__bulk_accept__');
      const json = await acceptDocumentGroupSuggestions(ids.map((id) => ({ id })));
      setScanMessage(json.message || '已接受建议分组');
      await loadDocuments();
    } catch {
      setScanMessage('接受建议分组失败，请稍后重试');
    } finally {
      setAssignmentSubmittingId('');
    }
  };

  const libraries = useMemo(() => {
    const sorted = sortLibrariesForDisplay(Array.isArray(data?.libraries) ? data.libraries : [], data?.items || []);
    return sorted.filter((library) => {
      const count = getLibraryDocumentCount(library, data?.items || [], sorted);
      return count > 0 || library.key === activeLibrary;
    });
  }, [activeLibrary, data]);
  const libraryLabelMap = useMemo(
    () => new Map(libraries.map((item) => [item.key, item.label])),
    [libraries],
  );
  const visibleItems = useMemo(
    () => buildVisibleItems(data?.items || []),
    [data],
  );
  const filteredItems = useMemo(
    () => buildFilteredItems({
      visibleItems,
      keyword,
      activeExtension,
      activeLibrary,
      libraries,
      libraryLabelMap,
    }),
    [activeExtension, activeLibrary, keyword, libraries, libraryLabelMap, visibleItems],
  );
  const extensionSummary = useMemo(
    () => buildExtensionSummary(data?.byExtension),
    [data],
  );
  const parsedCount = data?.meta?.parsed || 0;
  const totalFiles = data?.totalFiles || 0;
  const parseRate = totalFiles ? `${Math.round((parsedCount / totalFiles) * 100)}%` : '0%';
  const recentCount = useMemo(
    () => countRecentDocuments(filteredItems),
    [filteredItems],
  );
  const ungroupedCount = useMemo(
    () => visibleItems.filter((item) => isUngroupedDocument(item)).length,
    [visibleItems],
  );
  const scanSources = data?.scanRoots || [];
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const paginatedItems = useMemo(
    () => paginateItems(filteredItems, currentPage, PAGE_SIZE),
    [currentPage, filteredItems],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activeExtension, activeLibrary, keyword]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const directoryOptions = useMemo(
    () => buildDirectoryOptions({
      candidateSources,
      scanSources,
      scanRoot: data?.scanRoot,
    }),
    [candidateSources, data?.scanRoot, scanSources],
  );

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
            <LibraryTabs
              libraries={libraries}
              activeLibrary={activeLibrary}
              onSelectLibrary={setActiveLibrary}
              getLibraryDocumentCount={getLibraryDocumentCount}
              visibleItems={visibleItems}
              ungroupedCount={ungroupedCount}
              createDraft={libraryCreateDraft}
              onCreateDraftChange={setLibraryCreateDraft}
              onCreateLibrary={handleCreateLibrary}
              createSubmitting={libraryCreateSubmitting}
            />

            <ScanSourcesPanel
              expanded={scanSourcesExpanded}
              onToggleExpanded={() => setScanSourcesExpanded((current) => !current)}
              candidateSourceLoading={candidateSourceLoading}
              candidateSourceSubmitting={candidateSourceSubmitting}
              selectedCandidatePaths={selectedCandidatePaths}
              onLoadCandidateSources={loadCandidateSources}
              onImportCandidateSources={handleCandidateImportScan}
              scanRootDraft={scanRootDraft}
              onScanRootDraftChange={setScanRootDraft}
              onAddScanSource={addScanSource}
              scanSourceSubmitting={scanSourceSubmitting}
              directoryOptions={directoryOptions}
              data={data}
              scanSources={scanSources}
              onToggleCandidatePath={toggleCandidatePath}
              formatLocalTime={formatLocalTime}
              onSetPrimaryScanSource={setPrimaryScanSource}
              onRemoveScanSource={removeScanSource}
            />

            <DocumentFiltersBar
              totalFiles={totalFiles}
              recentCount={recentCount}
              parseRate={parseRate}
              filteredItems={filteredItems}
              visibleItems={visibleItems}
              activeExtension={activeExtension}
              onSelectExtension={setActiveExtension}
              extensionSummary={extensionSummary}
              keyword={keyword}
              onKeywordChange={setKeyword}
            />

            <DocumentsTable
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={PAGE_SIZE}
              paginatedItems={paginatedItems}
              filteredItems={filteredItems}
              recentNewIds={recentNewIds}
              getDocumentLibraryKeys={getDocumentLibraryKeys}
              libraries={libraries}
              itemLabelMap={libraryLabelMap}
              libraryDrafts={libraryDrafts}
              onLibraryDraftChange={handleLibraryDraftChange}
              expandedLibraryEditorId={expandedLibraryEditorId}
              onOpenLibraryEditor={openLibraryEditor}
              onCloseLibraryEditor={closeLibraryEditor}
              assignmentSubmittingId={assignmentSubmittingId}
              ignoreSubmittingId={ignoreSubmittingId}
              updateDocumentLibraries={updateDocumentLibraries}
              acceptSuggestedGroups={acceptSuggestedGroups}
              ignoreDocument={ignoreDocument}
              formatDocumentBusinessResult={formatDocumentBusinessResult}
              parseMethodLabels={PARSE_METHOD_LABELS}
              onFirstPage={() => setCurrentPage(1)}
              onPrevPage={() => setCurrentPage((page) => Math.max(1, page - 1))}
              onNextPage={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              onLastPage={() => setCurrentPage(totalPages)}
            />
          </section>
        ) : null}
      </main>
    </div>
  );
}
