'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import {
  getDocumentLibraryKeys,
  getLibraryDocumentCount,
  sortLibrariesForDisplay,
} from '../lib/knowledge-libraries';
import useMobileViewport from '../lib/use-mobile-viewport';
import { formatDocumentBusinessResult } from '../lib/types';
import {
  acceptDocumentGroupSuggestions,
  backfillCanonicalDocuments,
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
import LibrarySettingsPanel from './LibrarySettingsPanel';
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
  'existing-markdown': '现成 Markdown',
  'csv-utf8': 'CSV',
  'json-parse': 'JSON',
  'html-strip': 'HTML 清洗',
  mammoth: 'DOCX 提取',
  markitdown: 'MarkItDown',
  'xlsx-sheet-reader': '表格读取',
  'pdf-parse': 'PDF 文本',
  pypdf: 'PyPDF',
  'pdf-auto': 'PDF 自动解析',
  'image-ocr+vlm': '图片 OCR + VLM',
  'presentation-vlm': '演示稿 VLM',
  'pdf-vlm': 'PDF VLM',
  'audio-pending': '音频待进阶解析',
  'ocr-fallback': 'OCR fallback',
  unsupported: '暂不支持',
  error: '解析失败',
};

const PAGE_SIZE = 50;
const DEFAULT_SIDEBAR_SOURCES = [
  { name: '数据集', status: 'success' },
  { name: '数据集分组', status: 'success' },
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
    extractionFieldSet: typeof draft?.extractionFieldSet === 'string'
      ? draft.extractionFieldSet
      : String(library?.extractionFieldSet || 'auto'),
    extractionFallbackSchemaType: typeof draft?.extractionFallbackSchemaType === 'string'
      ? draft.extractionFallbackSchemaType
      : String(library?.extractionFallbackSchemaType || 'auto'),
    extractionPreferredFieldKeys: Array.isArray(draft?.extractionPreferredFieldKeys)
      ? draft.extractionPreferredFieldKeys
      : Array.isArray(library?.extractionPreferredFieldKeys) ? library.extractionPreferredFieldKeys : [],
    extractionRequiredFieldKeys: Array.isArray(draft?.extractionRequiredFieldKeys)
      ? draft.extractionRequiredFieldKeys
      : Array.isArray(library?.extractionRequiredFieldKeys) ? library.extractionRequiredFieldKeys : [],
    extractionFieldAliases: draft?.extractionFieldAliases && typeof draft.extractionFieldAliases === 'object'
      ? draft.extractionFieldAliases
      : (library?.extractionFieldAliases && typeof library.extractionFieldAliases === 'object' ? library.extractionFieldAliases : {}),
    extractionFieldPrompts: draft?.extractionFieldPrompts && typeof draft.extractionFieldPrompts === 'object'
      ? draft.extractionFieldPrompts
      : (library?.extractionFieldPrompts && typeof library.extractionFieldPrompts === 'object' ? library.extractionFieldPrompts : {}),
    extractionFieldNormalizationRules: draft?.extractionFieldNormalizationRules && typeof draft.extractionFieldNormalizationRules === 'object'
      ? draft.extractionFieldNormalizationRules
      : (library?.extractionFieldNormalizationRules && typeof library.extractionFieldNormalizationRules === 'object' ? library.extractionFieldNormalizationRules : {}),
    extractionFieldConflictStrategies: draft?.extractionFieldConflictStrategies && typeof draft.extractionFieldConflictStrategies === 'object'
      ? draft.extractionFieldConflictStrategies
      : (library?.extractionFieldConflictStrategies && typeof library.extractionFieldConflictStrategies === 'object' ? library.extractionFieldConflictStrategies : {}),
    knowledgePagesEnabled: draft?.knowledgePagesEnabled ?? library?.knowledgePagesEnabled ?? false,
    knowledgePagesMode: typeof draft?.knowledgePagesMode === 'string'
      ? draft.knowledgePagesMode
      : String(library?.knowledgePagesMode || 'none'),
  };
}

export default function DocumentsPage() {
  const mobileViewport = useMobileViewport();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [canonicalBackfillLoading, setCanonicalBackfillLoading] = useState(false);
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
  const [currentPage, setCurrentPage] = useState(1);
  const [libraryCreateDraft, setLibraryCreateDraft] = useState('');
  const [libraryCreatePermissionLevel, setLibraryCreatePermissionLevel] = useState(0);
  const [libraryCreateSubmitting, setLibraryCreateSubmitting] = useState(false);
  const [librarySettingsDrafts, setLibrarySettingsDrafts] = useState({});
  const [librarySettingsSubmittingId, setLibrarySettingsSubmittingId] = useState('');
  const [librarySettingsExpanded, setLibrarySettingsExpanded] = useState(false);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError('');
      const normalized = await fetchDocuments();
      setData(normalized);
      return normalized;
    } catch {
      setError('数据集接口暂时不可用');
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
      setSidebarSources(DEFAULT_SIDEBAR_SOURCES);
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

  const handleCanonicalBackfill = async () => {
    if (canonicalBackfillLoading) return;
    try {
      setCanonicalBackfillLoading(true);
      setScanMessage('');
      const json = await backfillCanonicalDocuments(50, false);
      await loadDocuments();
      const matchedCount = Number(json?.matchedCount || json?.data?.matchedCount || 0);
      const queuedCount = Number(json?.queuedCount || json?.data?.queuedCount || 0);
      setScanMessage(
        matchedCount > 0
          ? `已加入 ${queuedCount}/${matchedCount} 份 Canonical 解析回填任务`
          : '当前没有需要回填 Canonical 解析的文档',
      );
    } catch {
      setScanMessage('Canonical 解析回填失败，请稍后重试');
    } finally {
      setCanonicalBackfillLoading(false);
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
      setScanMessage('删除文档失败，请稍后重试');
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
      setScanMessage('更新数据集分组失败，请稍后重试');
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
      setScanMessage(`已新建数据集“${name}”，权限等级 L${permissionLevel}`);
    } catch {
      setScanMessage('新建数据集失败，请稍后重试');
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
      setScanMessage('数据集名称不能为空');
      return;
    }

    try {
      setLibrarySettingsSubmittingId(libraryKey);
      setScanMessage('');
      await updateDocumentLibrary(libraryKey, {
        label,
        description: String(draft.description || '').trim(),
        permissionLevel: normalizePermissionLevel(draft.permissionLevel, 0),
        extractionFieldSet: draft.extractionFieldSet,
        extractionFallbackSchemaType: draft.extractionFallbackSchemaType,
        extractionPreferredFieldKeys: draft.extractionPreferredFieldKeys,
        extractionRequiredFieldKeys: draft.extractionRequiredFieldKeys,
        extractionFieldAliases: draft.extractionFieldAliases,
        extractionFieldPrompts: draft.extractionFieldPrompts,
        extractionFieldNormalizationRules: draft.extractionFieldNormalizationRules,
        extractionFieldConflictStrategies: draft.extractionFieldConflictStrategies,
        knowledgePagesEnabled: Boolean(draft.knowledgePagesEnabled),
        knowledgePagesMode: draft.knowledgePagesMode,
      });
      await loadDocuments();
      setScanMessage(`已更新数据集“${label}”设置`);
    } catch {
      setScanMessage('更新数据集设置失败，请稍后重试');
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

  const allLibraries = useMemo(
    () => sortLibrariesForDisplay(Array.isArray(data?.libraries) ? data.libraries : [], data?.items || []),
    [data],
  );

  const libraries = useMemo(() => {
    if (mobileViewport) return allLibraries;
    return allLibraries.filter((library) => {
      const count = getLibraryDocumentCount(library, data?.items || [], allLibraries);
      return count > 0 || library.key === activeLibrary;
    });
  }, [activeLibrary, allLibraries, data, mobileViewport]);

  const activeLibraryRecord = useMemo(
    () => libraries.find((item) => item.key === activeLibrary) || null,
    [activeLibrary, libraries],
  );

  const activeLibrarySettingsDraft = useMemo(
    () => (activeLibraryRecord
      ? buildLibrarySettingsDraft(activeLibraryRecord, librarySettingsDrafts[activeLibraryRecord.key])
      : null),
    [activeLibraryRecord, librarySettingsDrafts],
  );

  useEffect(() => {
    setLibrarySettingsExpanded(false);
  }, [activeLibrary, mobileViewport]);

  const libraryLabelMap = useMemo(
    () => new Map(allLibraries.map((item) => [item.key, item.label])),
    [allLibraries],
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
      libraries: allLibraries,
      libraryLabelMap,
    }),
    [activeExtension, activeLibrary, allLibraries, keyword, libraryLabelMap, visibleItems],
  );

  const extensionSummary = useMemo(
    () => buildExtensionSummary(data?.byExtension),
    [data],
  );

  const recentCount = useMemo(
    () => countRecentDocuments(visibleItems),
    [visibleItems],
  );

  const parsedCount = data?.meta?.parsed || 0;
  const totalFiles = data?.totalFiles || 0;
  const parseRate = totalFiles ? `${Math.round((parsedCount / totalFiles) * 100)}%` : '0%';
  const ungroupedCount = useMemo(
    () => visibleItems.filter((item) => isUngroupedDocument(item)).length,
    [visibleItems],
  );

  const tableItems = mobileViewport ? visibleItems : filteredItems;
  const totalPages = Math.max(1, Math.ceil(tableItems.length / PAGE_SIZE));
  const paginatedItems = useMemo(
    () => paginateItems(tableItems, currentPage, PAGE_SIZE),
    [currentPage, tableItems],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activeExtension, activeLibrary, keyword, mobileViewport]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className={`app-shell ${mobileViewport ? 'app-shell-documents-simple' : ''}`.trim()}>
      <Sidebar sourceItems={sidebarSources} currentPath="/documents" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>AI 数据集</h2>
          </div>
          <div className="topbar-actions">
            <a className="ghost-btn" href="/#upload-document">添加文档</a>
            <button className="ghost-btn" type="button" onClick={() => void loadDocuments()}>刷新</button>
            {!mobileViewport ? (
              <button
                className="ghost-btn"
                type="button"
                onClick={() => void handleCanonicalBackfill()}
                disabled={canonicalBackfillLoading}
              >
                {canonicalBackfillLoading ? '回填排队中...' : '回填 Canonical 解析'}
              </button>
            ) : null}
            {!mobileViewport ? (
              <button className="primary-btn" type="button" onClick={() => void handlePrimaryScan()} disabled={scanLoading}>
                {scanLoading ? '处理中...' : '立即扫描未分组文档'}
              </button>
            ) : null}
          </div>
        </header>

        {loading ? <p>加载中...</p> : null}
        {error ? <p>{error}</p> : null}
        {scanMessage ? <div className="page-note">{scanMessage}</div> : null}

        {data ? (
          <section className={`documents-layout ${mobileViewport ? 'documents-layout-simple' : ''}`.trim()}>
            {mobileViewport ? (
              <>
                <section className="card documents-card documents-summary-card">
                  <div className="message-refs documents-summary-chips">
                    <span className="source-chip">总数 {totalFiles}</span>
                    <span className="source-chip">新增 {recentCount}</span>
                    <span className="source-chip">解析 {parseRate}</span>
                    <span className="source-chip">数据集 {allLibraries.length}</span>
                  </div>
                </section>

                <section className="card documents-card documents-create-library-card">
                  <div className="panel-header">
                    <div>
                      <h3>新建数据集</h3>
                      <p>这里保留一个轻量创建入口，方便先建数据集再上传文档。</p>
                    </div>
                  </div>
                  <div className="documents-create-library-row">
                    <input
                      className="filter-input"
                      value={libraryCreateDraft}
                      onChange={(event) => setLibraryCreateDraft(event.target.value)}
                      placeholder="输入数据集名称"
                    />
                    <button
                      className="primary-btn"
                      type="button"
                      onClick={() => void handleCreateLibrary()}
                      disabled={libraryCreateSubmitting || !String(libraryCreateDraft || '').trim()}
                    >
                      {libraryCreateSubmitting ? '创建中...' : '新建数据集'}
                    </button>
                  </div>
                </section>
              </>
            ) : (
              <>
                <LibraryTabs
                  libraries={libraries}
                  activeLibrary={activeLibrary}
                  activeLibraryRecord={activeLibraryRecord}
                  onSelectLibrary={setActiveLibrary}
                  getLibraryDocumentCount={getLibraryDocumentCount}
                  visibleItems={visibleItems}
                  ungroupedCount={ungroupedCount}
                  createDraft={libraryCreateDraft}
                  createPermissionLevel={libraryCreatePermissionLevel}
                  onCreateDraftChange={setLibraryCreateDraft}
                  onCreatePermissionLevelChange={setLibraryCreatePermissionLevel}
                  onCreateLibrary={() => void handleCreateLibrary()}
                  createSubmitting={libraryCreateSubmitting}
                  settingsExpanded={librarySettingsExpanded}
                  onToggleSettings={() => setLibrarySettingsExpanded((current) => !current)}
                />

                {librarySettingsExpanded ? (
                  <LibrarySettingsPanel
                    activeLibraryRecord={activeLibraryRecord}
                    activeLibrarySettingsDraft={activeLibrarySettingsDraft}
                    onSettingsChange={handleLibrarySettingChange}
                    onSaveSettings={(libraryKey) => void handleSaveLibrarySettings(libraryKey)}
                    settingsSubmittingId={librarySettingsSubmittingId}
                  />
                ) : null}

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
              </>
            )}

            <DocumentsTable
              simpleMode={mobileViewport}
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={PAGE_SIZE}
              paginatedItems={paginatedItems}
              filteredItems={tableItems}
              recentNewIds={[]}
              getDocumentLibraryKeys={getDocumentLibraryKeys}
              libraries={allLibraries}
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
