'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { sortLibrariesForDisplay, getDocumentLibraryKeys } from '../lib/knowledge-libraries';
import { formatDocumentBusinessResult } from '../lib/types';
import { createDocumentLibrary, fetchDocuments } from './api';
import DocumentsTable from './DocumentsTable';
import { buildVisibleItems, countRecentDocuments, paginateItems } from './selectors';

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

export default function DocumentsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [libraryDraft, setLibraryDraft] = useState('');
  const [creatingLibrary, setCreatingLibrary] = useState(false);

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

  useEffect(() => {
    void loadDocuments();
  }, []);

  const libraries = useMemo(
    () => sortLibrariesForDisplay(Array.isArray(data?.libraries) ? data.libraries : [], data?.items || []),
    [data],
  );

  const libraryLabelMap = useMemo(
    () => new Map(libraries.map((item) => [item.key, item.label])),
    [libraries],
  );

  const visibleItems = useMemo(
    () => buildVisibleItems(data?.items || []),
    [data],
  );

  const recentCount = useMemo(
    () => countRecentDocuments(visibleItems),
    [visibleItems],
  );

  const parsedCount = data?.meta?.parsed || 0;
  const totalFiles = data?.totalFiles || 0;
  const parseRate = totalFiles ? `${Math.round((parsedCount / totalFiles) * 100)}%` : '0%';
  const totalPages = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE));
  const paginatedItems = useMemo(
    () => paginateItems(visibleItems, currentPage, PAGE_SIZE),
    [currentPage, visibleItems],
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  async function handleCreateLibrary() {
    const name = String(libraryDraft || '').trim();
    if (!name || creatingLibrary) return;
    try {
      setCreatingLibrary(true);
      setMessage('');
      await createDocumentLibrary(name, '', 0);
      setLibraryDraft('');
      await loadDocuments();
      setMessage(`已新建知识库“${name}”`);
    } catch (createError) {
      setMessage(createError instanceof Error ? createError.message : '新建知识库失败');
    } finally {
      setCreatingLibrary(false);
    }
  }

  return (
    <div className="app-shell app-shell-documents-simple">
      <Sidebar sourceItems={DEFAULT_SIDEBAR_SOURCES} currentPath="/documents" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>AI 知识库</h2>
            <p>文档页只保留上传入口和文档列表，移动端不再展开知识库治理工具栏。</p>
          </div>
          <div className="topbar-actions">
            <a className="ghost-btn" href="/#upload-document">添加文档</a>
            <button className="ghost-btn" type="button" onClick={() => void loadDocuments()}>刷新</button>
          </div>
        </header>

        {loading ? <p>加载中...</p> : null}
        {error ? <p>{error}</p> : null}
        <div className="page-note">
          本系统是基于 PC 的本地助手，推荐使用 PC 大屏幕打开；移动端建议用于查看和轻量处理。
        </div>
        {message ? <div className="page-note">{message}</div> : null}

        {data ? (
          <section className="documents-layout documents-layout-simple">
            <section className="card documents-card documents-summary-card">
              <div className="message-refs documents-summary-chips">
                <span className="source-chip">总数 {totalFiles}</span>
                <span className="source-chip">新增 {recentCount}</span>
                <span className="source-chip">解析 {parseRate}</span>
                <span className="source-chip">知识库 {libraries.length}</span>
              </div>
            </section>

            <section className="card documents-card documents-create-library-card">
              <div className="panel-header">
                <div>
                  <h3>新建知识库</h3>
                  <p>这里保留一个轻量创建入口，方便先建库再上传文档。</p>
                </div>
              </div>
              <div className="documents-create-library-row">
                <input
                  className="filter-input"
                  value={libraryDraft}
                  onChange={(event) => setLibraryDraft(event.target.value)}
                  placeholder="输入知识库名称"
                />
                <button
                  className="primary-btn"
                  type="button"
                  onClick={() => void handleCreateLibrary()}
                  disabled={creatingLibrary || !String(libraryDraft || '').trim()}
                >
                  {creatingLibrary ? '创建中...' : '新建知识库'}
                </button>
              </div>
            </section>

            <DocumentsTable
              simpleMode
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={PAGE_SIZE}
              paginatedItems={paginatedItems}
              filteredItems={visibleItems}
              recentNewIds={[]}
              getDocumentLibraryKeys={getDocumentLibraryKeys}
              libraries={libraries}
              itemLabelMap={libraryLabelMap}
              libraryDrafts={{}}
              onLibraryDraftChange={() => {}}
              expandedLibraryEditorId=""
              onOpenLibraryEditor={() => {}}
              onCloseLibraryEditor={() => {}}
              assignmentSubmittingId=""
              ignoreSubmittingId=""
              reparseSubmittingId=""
              updateDocumentLibraries={async () => {}}
              acceptSuggestedGroups={async () => {}}
              ignoreDocument={async () => {}}
              reparseDocument={async () => {}}
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
