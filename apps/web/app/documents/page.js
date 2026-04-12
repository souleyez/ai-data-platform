'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import WorkspaceDesktopShell from '../components/WorkspaceDesktopShell';
import {
  getDocumentLibraryKeys,
  getLibraryDocumentCount,
  sortLibrariesForDisplay,
} from '../lib/knowledge-libraries';
import useMobileViewport from '../lib/use-mobile-viewport';
import { formatDocumentBusinessResult } from '../lib/types';
import {
  acceptDocumentGroupSuggestions,
  createDocumentLibrary,
  fetchDatasources,
  fetchDocuments,
  ignoreDocuments,
  reparseDocuments,
  saveDocumentGroups,
  updateDocumentLibrary,
} from './api';
import DocumentFiltersBar from './DocumentFiltersBar';
import DocumentsTable from './DocumentsTable';
import LibrarySettingsPanel from './LibrarySettingsPanel';
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

function describeLibraryStructuring(library) {
  const fieldSet = String(library?.extractionFieldSet || 'auto').trim() || 'auto';
  const fallback = String(library?.extractionFallbackSchemaType || 'auto').trim() || 'auto';
  const requiredCount = Array.isArray(library?.extractionRequiredFieldKeys) ? library.extractionRequiredFieldKeys.length : 0;
  const preferredCount = Array.isArray(library?.extractionPreferredFieldKeys) ? library.extractionPreferredFieldKeys.length : 0;
  const parts = [];
  parts.push(fieldSet === 'auto' ? '系统自动结构化' : `字段集 ${fieldSet}`);
  if (fallback !== 'auto') parts.push(`回退 ${fallback}`);
  if (requiredCount) parts.push(`${requiredCount} 个必填字段`);
  if (preferredCount) parts.push(`${preferredCount} 个优先字段`);
  return parts.join(' · ');
}

function normalizePermissionLevel(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.floor(numeric));
}

function isDocumentParseFailed(item) {
  return item?.parseStatus === 'error' || item?.detailParseStatus === 'failed';
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
  const [error, setError] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [sidebarSources, setSidebarSources] = useState(DEFAULT_SIDEBAR_SOURCES);
  const [keyword, setKeyword] = useState('');
  const [activeExtension, setActiveExtension] = useState('all');
  const [activeLibrary, setActiveLibrary] = useState('all');
  const [selectedLibraries, setSelectedLibraries] = useState([]);
  const [assignmentSubmittingId, setAssignmentSubmittingId] = useState('');
  const [ignoreSubmittingId, setIgnoreSubmittingId] = useState('');
  const [reparseSubmittingId, setReparseSubmittingId] = useState('');
  const [libraryDrafts, setLibraryDrafts] = useState({});
  const [expandedLibraryEditorId, setExpandedLibraryEditorId] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [libraryCreateDraft, setLibraryCreateDraft] = useState('');
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

  const handleCreateLibrary = async (draftValue = libraryCreateDraft) => {
    const name = String(draftValue || '').trim();
    const permissionLevel = 0;
    if (!name || libraryCreateSubmitting) return;
    try {
      setLibraryCreateSubmitting(true);
      setScanMessage('');
      const created = await createDocumentLibrary(name, '', permissionLevel);
      setLibraryCreateDraft('');
      await loadDocuments();
      if (created?.item?.key) {
        setActiveLibrary(created.item.key);
        setSelectedLibraries((current) => (
          current.includes(created.item.key) ? current : [...current, created.item.key]
        ));
      }
      setScanMessage(`已新建数据集“${name}”`);
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

  const libraries = allLibraries;

  const selectedLibraryRecords = useMemo(
    () => allLibraries.filter((item) => selectedLibraries.includes(item.key)),
    [allLibraries, selectedLibraries],
  );

  const activeLibraryRecord = useMemo(
    () => (mobileViewport
      ? libraries.find((item) => item.key === activeLibrary) || null
      : (selectedLibraryRecords.length === 1 ? selectedLibraryRecords[0] : null)),
    [activeLibrary, libraries, mobileViewport, selectedLibraryRecords],
  );

  const activeLibrarySettingsDraft = useMemo(
    () => (activeLibraryRecord
      ? buildLibrarySettingsDraft(activeLibraryRecord, librarySettingsDrafts[activeLibraryRecord.key])
      : null),
    [activeLibraryRecord, librarySettingsDrafts],
  );

  useEffect(() => {
    setLibrarySettingsExpanded(false);
  }, [activeLibrary, mobileViewport, selectedLibraries]);

  const libraryLabelMap = useMemo(
    () => new Map(allLibraries.map((item) => [item.key, item.label])),
    [allLibraries],
  );

  const visibleItems = useMemo(
    () => buildVisibleItems(data?.items || []),
    [data],
  );

  const selectedLibraryDetails = useMemo(
    () => selectedLibraryRecords.map((library) => ({
      key: library.key,
      label: library.label,
      permissionLevel: normalizePermissionLevel(library.permissionLevel, 0),
      documentCount: getLibraryDocumentCount(library, visibleItems, allLibraries),
      description: String(library.description || '').trim(),
      structuring: describeLibraryStructuring(library),
    })),
    [allLibraries, selectedLibraryRecords, visibleItems],
  );

  const filteredItems = useMemo(
    () => buildFilteredItems({
      visibleItems,
      keyword,
      activeExtension,
      activeLibrary,
      selectedLibraries: mobileViewport ? [] : selectedLibraries,
      libraries: allLibraries,
      libraryLabelMap,
    }),
    [activeExtension, activeLibrary, allLibraries, keyword, libraryLabelMap, mobileViewport, selectedLibraries, visibleItems],
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
  const failedCount = useMemo(
    () => tableItems.filter((item) => isDocumentParseFailed(item)).length,
    [tableItems],
  );
  const inventoryScopeLabel = useMemo(() => {
    if (mobileViewport) {
      if (activeLibrary === 'ungrouped') return '未分组';
      if (activeLibrary !== 'all') {
        return libraries.find((item) => item.key === activeLibrary)?.label || '当前数据集';
      }
      return '全部数据集';
    }
    if (!selectedLibraryDetails.length) return '全部数据集';
    if (selectedLibraryDetails.length === 1) return selectedLibraryDetails[0].label;
    return `${selectedLibraryDetails.length} 个数据集`;
  }, [activeLibrary, libraries, mobileViewport, selectedLibraryDetails]);
  const totalPages = Math.max(1, Math.ceil(tableItems.length / PAGE_SIZE));
  const paginatedItems = useMemo(
    () => paginateItems(tableItems, currentPage, PAGE_SIZE),
    [currentPage, tableItems],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activeExtension, activeLibrary, keyword, mobileViewport, selectedLibraries]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  if (!mobileViewport) {
    return (
      <WorkspaceDesktopShell
        currentPath="/documents"
        sourceItems={sidebarSources}
        libraries={allLibraries}
        totalDocuments={totalFiles}
        selectedKeys={selectedLibraries}
        onToggleLibrary={(libraryKey) => {
          setSelectedLibraries((current) => (
            current.includes(libraryKey)
              ? current.filter((item) => item !== libraryKey)
              : [...current, libraryKey]
          ));
        }}
        onClearSelection={() => setSelectedLibraries([])}
        onCreateLibrary={handleCreateLibrary}
        creating={libraryCreateSubmitting}
      >
        {loading ? <p>加载中...</p> : null}
        {error ? <p>{error}</p> : null}
        {scanMessage ? <div className="page-note">{scanMessage}</div> : null}

        <div className="workspace-page-actions" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
          {activeLibraryRecord ? (
            <button
              className="ghost-btn"
              type="button"
              onClick={() => setLibrarySettingsExpanded((current) => !current)}
            >
              {librarySettingsExpanded ? '收起当前数据集编辑' : '编辑当前数据集'}
            </button>
          ) : null}
        </div>

        {librarySettingsExpanded && activeLibraryRecord ? (
          <LibrarySettingsPanel
            activeLibraryRecord={activeLibraryRecord}
            activeLibrarySettingsDraft={activeLibrarySettingsDraft}
            onSettingsChange={handleLibrarySettingChange}
            onSaveSettings={(libraryKey) => void handleSaveLibrarySettings(libraryKey)}
            settingsSubmittingId={librarySettingsSubmittingId}
          />
        ) : null}

        {selectedLibraryDetails.length ? (
          <section className="card documents-card dataset-selection-panel">
            <div className="panel-header">
              <div>
                <h3>{selectedLibraryDetails.length === 1 ? '当前数据集' : '当前数据集分组'}</h3>
                <p>{selectedLibraryDetails.length === 1 ? '当前文档列表默认收口到这个数据集。' : `当前同时选中了 ${selectedLibraryDetails.length} 个数据集，下面会合并显示它们的文档。`}</p>
              </div>
            </div>
            <div className="dataset-selection-grid">
              {selectedLibraryDetails.map((library) => (
                <article key={library.key} className="dataset-selection-card">
                  <div className="dataset-selection-head">
                    <strong>{library.label}</strong>
                    <span className="library-permission-pill">L{library.permissionLevel}</span>
                  </div>
                  <div className="dataset-selection-meta">
                    <span>{library.documentCount} 份文档</span>
                    <span>{library.structuring}</span>
                  </div>
                  {library.description ? (
                    <div className="dataset-selection-description">{library.description}</div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <DocumentFiltersBar
          totalFiles={totalFiles}
          recentCount={recentCount}
          parseRate={parseRate}
          filteredItems={filteredItems}
          visibleItems={visibleItems}
          failedCount={failedCount}
          scopeLabel={inventoryScopeLabel}
          activeExtension={activeExtension}
          onSelectExtension={setActiveExtension}
          extensionSummary={extensionSummary}
          keyword={keyword}
          onKeywordChange={setKeyword}
        />

        {data ? (
          <DocumentsTable
            simpleMode={false}
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
        ) : null}
      </WorkspaceDesktopShell>
    );
  }

  return (
    <div className="app-shell app-shell-documents-simple">
      <Sidebar sourceItems={sidebarSources} currentPath="/documents" />
      <main className="main-panel">
        {loading ? <p>加载中...</p> : null}
        {error ? <p>{error}</p> : null}
        {scanMessage ? <div className="page-note">{scanMessage}</div> : null}

        {data ? (
          <section className="documents-layout documents-layout-simple">
            <section className="card documents-card documents-summary-card">
              <div className="message-refs documents-summary-chips">
                <span className="source-chip">范围 {inventoryScopeLabel}</span>
                <span className="source-chip">总数 {totalFiles}</span>
                <span className="source-chip">新增 {recentCount}</span>
                <span className="source-chip">解析 {parseRate}</span>
                <span className="source-chip">失败 {failedCount}</span>
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

            <DocumentsTable
              simpleMode
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
