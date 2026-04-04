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
  fetchDatasources,
  fetchDocuments,
  ignoreDocuments,
  reparseDocuments,
  reclusterUngroupedDocuments,
  saveDocumentGroups,
  updateDocumentLibrary,
} from './api';
import DocumentFiltersBar from './DocumentFiltersBar';
import DocumentsTable from './DocumentsTable';
import LibraryTabs from './LibraryTabs';
import {
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
  { name: '知识库分组', status: 'success' },
];

function normalizePermissionLevel(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.floor(numeric));
}

function buildLibrarySettingsDraft(library, draft) {
  return {
    label: typeof draft?.label === 'string' ? draft.label : String(library?.label || library?.name || ''),
    description: typeof draft?.description === 'string' ? draft.description : String(library?.description || ''),
    permissionLevel: normalizePermissionLevel(
      draft?.permissionLevel ?? library?.permissionLevel ?? 0,
      0,
    ),
  };
}

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
  const [reparseSubmittingId, setReparseSubmittingId] = useState('');
  const [libraryDrafts, setLibraryDrafts] = useState({});
  const [expandedLibraryEditorId, setExpandedLibraryEditorId] = useState('');
  const [recentNewIds, setRecentNewIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [libraryCreateDraft, setLibraryCreateDraft] = useState('');
  const [libraryCreatePermissionLevel, setLibraryCreatePermissionLevel] = useState(0);
  const [libraryCreateSubmitting, setLibraryCreateSubmitting] = useState(false);
  const [librarySettingsDrafts, setLibrarySettingsDrafts] = useState({});
  const [librarySettingsSubmittingId, setLibrarySettingsSubmittingId] = useState('');

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError('');
      const normalized = await fetchDocuments();
      setData(normalized);
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
    void loadDocuments();
    void loadDatasources();
  }, []);

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

  const reparseDocument = async (itemId) => {
    if (!itemId || reparseSubmittingId) return;
    try {
      setReparseSubmittingId(itemId);
      const json = await reparseDocuments([{ id: itemId }]);
      await loadDocuments();
      setScanMessage(json.message || '文档已重新解析');
    } catch {
      setScanMessage('重新解析失败，请稍后重试');
    } finally {
      setReparseSubmittingId('');
    }
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
    const permissionLevel = normalizePermissionLevel(libraryCreatePermissionLevel, 0);
    if (!name || libraryCreateSubmitting) return;
    try {
      setLibraryCreateSubmitting(true);
      setScanMessage('');
      const created = await createDocumentLibrary(name, '', permissionLevel);
      setLibraryCreateDraft('');
      setLibraryCreatePermissionLevel(0);
      await loadDocuments();
      setActiveLibrary(created?.item?.key || 'all');
      setScanMessage(`已新建知识库分组“${name}”，权限等级 L${permissionLevel}`);
    } catch {
      setScanMessage('新建知识库分组失败，请稍后重试');
    } finally {
      setLibraryCreateSubmitting(false);
    }
  };

  const handleLibrarySettingChange = (libraryKey, patch) => {
    setLibrarySettingsDrafts((current) => ({
      ...current,
      [libraryKey]: {
        ...(current[libraryKey] || {}),
        ...patch,
      },
    }));
  };

  const handleSaveLibrarySettings = async (libraryKey) => {
    if (!libraryKey || librarySettingsSubmittingId) return;
    const library = (data?.libraries || []).find((item) => item.key === libraryKey);
    if (!library) return;
    const draft = buildLibrarySettingsDraft(library, librarySettingsDrafts[libraryKey]);
    const label = String(draft.label || '').trim();
    if (!label) {
      setScanMessage('知识库名称不能为空');
      return;
    }

    try {
      setLibrarySettingsSubmittingId(libraryKey);
      setScanMessage('');
      await updateDocumentLibrary(libraryKey, {
        label,
        description: String(draft.description || '').trim(),
        permissionLevel: normalizePermissionLevel(draft.permissionLevel, 0),
      });
      await loadDocuments();
      setScanMessage(`已更新知识库“${label}”的权限等级`);
    } catch {
      setScanMessage('更新知识库设置失败，请稍后重试');
    } finally {
      setLibrarySettingsSubmittingId('');
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

  const activeLibraryRecord = useMemo(
    () => libraries.find((item) => item.key === activeLibrary) || null,
    [activeLibrary, libraries],
  );

  const activeLibrarySettingsDraft = useMemo(
    () => (activeLibraryRecord ? buildLibrarySettingsDraft(activeLibraryRecord, librarySettingsDrafts[activeLibraryRecord.key]) : null),
    [activeLibraryRecord, librarySettingsDrafts],
  );

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
            <a className="ghost-btn" href="/#upload-document">上传文档</a>
            <button className="ghost-btn" type="button" onClick={() => void loadDocuments()}>刷新</button>
            <button className="primary-btn" type="button" onClick={() => void handlePrimaryScan()} disabled={scanLoading}>
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
              activeLibraryRecord={activeLibraryRecord}
              activeLibrarySettingsDraft={activeLibrarySettingsDraft}
              onSelectLibrary={setActiveLibrary}
              getLibraryDocumentCount={getLibraryDocumentCount}
              visibleItems={visibleItems}
              ungroupedCount={ungroupedCount}
              createDraft={libraryCreateDraft}
              createPermissionLevel={libraryCreatePermissionLevel}
              onCreateDraftChange={setLibraryCreateDraft}
              onCreatePermissionLevelChange={setLibraryCreatePermissionLevel}
              onCreateLibrary={handleCreateLibrary}
              createSubmitting={libraryCreateSubmitting}
              onSettingsChange={handleLibrarySettingChange}
              onSaveSettings={handleSaveLibrarySettings}
              settingsSubmittingId={librarySettingsSubmittingId}
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
              reparseSubmittingId={reparseSubmittingId}
              updateDocumentLibraries={updateDocumentLibraries}
              acceptSuggestedGroups={acceptSuggestedGroups}
              ignoreDocument={ignoreDocument}
              reparseDocument={reparseDocument}
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
