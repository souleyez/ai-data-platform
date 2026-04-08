'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { sortLibrariesForDisplay, getDocumentLibraryKeys } from '../lib/knowledge-libraries';
import { formatDocumentBusinessResult } from '../lib/types';
import { fetchDocuments } from './api';
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
  const [currentPage, setCurrentPage] = useState(1);

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
