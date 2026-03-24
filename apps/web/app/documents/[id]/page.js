'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import { buildApiUrl } from '../../lib/config';
import { normalizeDatasourceResponse, normalizeDocumentDetailResponse } from '../../lib/types';
import { sourceItems } from '../../lib/mock-data';
import { getDocumentGroupLabel, getPrimaryCategoryLabel } from '../../lib/document-taxonomy';

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

function DetailCard({ title, children }) {
  return (
    <section className="card documents-card">
      <div className="panel-header">
        <div><h3>{title}</h3></div>
      </div>
      {children}
    </section>
  );
}

export default function DocumentDetailPage() {
  const params = useParams();
  const documentId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    async function loadDetail() {
      if (!documentId) return;

      try {
        setLoading(true);
        setError('');
        const response = await fetch(buildApiUrl(`/api/documents/detail?id=${encodeURIComponent(documentId)}`), { cache: 'no-store' });
        if (!response.ok) throw new Error('load detail failed');
        const json = await response.json();
        const normalized = normalizeDocumentDetailResponse(json);
        setData(normalized.item);
        setMeta(normalized.meta);
      } catch {
        setError('文档详情加载失败');
      } finally {
        setLoading(false);
      }
    }

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

    loadDetail();
    loadDatasources();
  }, [documentId]);

  const currentGroups = useMemo(() => data?.confirmedGroups || data?.groups || [], [data]);
  const fullText = useMemo(() => String(data?.fullText || data?.excerpt || '').trim(), [data]);
  const highlightedText = useMemo(() => {
    if (!keyword.trim() || !fullText) return fullText;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return fullText.replace(new RegExp(escaped, 'gi'), (match) => `<<<HIT>>>${match}<<<END>>>`);
  }, [fullText, keyword]);

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/documents" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>文档详情</h2>
            <p>以原文阅读为主，其它信息只保留必要摘要和结构化结果。</p>
          </div>
          <div className="topbar-actions">
            <a href="/documents" className="ghost-btn back-link">返回文档中心</a>
          </div>
        </header>

        {loading ? <p>加载中...</p> : null}
        {error ? <p>{error}</p> : null}

        {data ? (
          <section className="documents-layout">
            <section className="card table-card">
              <div className="panel-header">
                <div>
                  <h3>{data.name}</h3>
                  <p>{data.path}</p>
                </div>
              </div>
              <div className="message-refs">
                <span className="source-chip">业务类：{getPrimaryCategoryLabel(meta?.bizCategory)}</span>
                <span className="source-chip">知识库：{currentGroups.length ? currentGroups.map(getDocumentGroupLabel).join('、') : '未分组'}</span>
                <span className="source-chip">解析状态：{data.parseStatus || '-'}</span>
                <span className="source-chip">解析方式：{PARSE_METHOD_LABELS[data.parseMethod] || data.parseMethod || '-'}</span>
                <span className="source-chip">提取字符：{data.extractedChars ?? 0}</span>
                {data.retentionStatus === 'structured-only' ? <span className="source-chip">仅保留结构化数据</span> : null}
              </div>
            </section>

            <section className="document-reader-layout">
              <div className="document-reader-main">
                <section className="card documents-card">
                  <div className="panel-header">
                    <div>
                      <h3>文档原文</h3>
                      <p>这里显示当前可用于问答和输出的正文内容。</p>
                    </div>
                    <div style={{ minWidth: 260 }}>
                      <input
                        className="filter-input"
                        value={keyword}
                        onChange={(event) => setKeyword(event.target.value)}
                        placeholder="搜索原文关键词..."
                      />
                    </div>
                  </div>
                  <div className="document-raw-view">
                    {highlightedText
                      ? highlightedText.split('<<<HIT>>>').map((segment, index) => {
                        if (!segment.includes('<<<END>>>')) return <span key={index}>{segment}</span>;
                        const [hit, rest] = segment.split('<<<END>>>');
                        return (
                          <span key={index}>
                            <mark>{hit}</mark>
                            {rest}
                          </span>
                        );
                      })
                      : '当前没有可展示的正文内容。'}
                  </div>
                </section>
              </div>

              <aside className="document-reader-aside">
                <DetailCard title="摘要">
                  <div className="summary-cell" style={{ maxWidth: 'none' }}>{data.summary || '-'}</div>
                </DetailCard>

                <DetailCard title="结构化结果">
                  <div className="message-ref-list">
                    <div className="message-ref-item"><strong>主题标签</strong><span>{data.topicTags?.join('、') || '-'}</span></div>
                    <div className="message-ref-item"><strong>合同编号</strong><span>{data.contractFields?.contractNo || '-'}</span></div>
                    <div className="message-ref-item"><strong>合同金额</strong><span>{data.contractFields?.amount || '-'}</span></div>
                    <div className="message-ref-item"><strong>付款条款</strong><span>{data.contractFields?.paymentTerms || '-'}</span></div>
                    <div className="message-ref-item"><strong>期限</strong><span>{data.contractFields?.duration || '-'}</span></div>
                  </div>
                </DetailCard>

                <DetailCard title="意图槽位">
                  <div className="message-ref-list">
                    <div className="message-ref-item"><strong>人群</strong><span>{data.intentSlots?.audiences?.join('、') || '-'}</span></div>
                    <div className="message-ref-item"><strong>成分</strong><span>{data.intentSlots?.ingredients?.join('、') || '-'}</span></div>
                    <div className="message-ref-item"><strong>菌株</strong><span>{data.intentSlots?.strains?.join('、') || '-'}</span></div>
                    <div className="message-ref-item"><strong>功效</strong><span>{data.intentSlots?.benefits?.join('、') || '-'}</span></div>
                    <div className="message-ref-item"><strong>剂量/指标</strong><span>{[...(data.intentSlots?.doses || []), ...(data.intentSlots?.metrics || [])].join('、') || '-'}</span></div>
                  </div>
                </DetailCard>

                <DetailCard title="实体抽取">
                  <div className="message-refs" style={{ gap: 8 }}>
                    {(data.entities || []).slice(0, 24).map((entity, index) => (
                      <span key={`${entity.type}-${entity.text}-${index}`} className="source-chip">
                        {entity.type}: {entity.text}
                      </span>
                    ))}
                    {!data.entities?.length ? <div className="page-note" style={{ marginBottom: 0 }}>当前还没有抽取到实体。</div> : null}
                  </div>
                </DetailCard>

                <DetailCard title="关系/结论">
                  <div className="message-ref-list">
                    {(data.claims || []).slice(0, 10).map((claim, index) => (
                      <div key={`${claim.subject}-${claim.predicate}-${claim.object}-${index}`} className="message-ref-item">
                        <strong>{claim.subject}</strong>
                        <span>{claim.predicate} {claim.object}</span>
                      </div>
                    ))}
                    {!data.claims?.length ? <div className="page-note" style={{ marginBottom: 0 }}>当前还没有抽取到关系或结论。</div> : null}
                  </div>
                </DetailCard>

                <DetailCard title="证据片段">
                  <div className="message-ref-list">
                    {(data.evidenceChunks || []).slice(0, 6).map((chunk) => (
                      <div key={chunk.id} className="message-ref-item">
                        <strong>{chunk.title || `片段 ${chunk.order + 1}`}</strong>
                        <span>{chunk.text}</span>
                      </div>
                    ))}
                    {!data.evidenceChunks?.length ? <div className="page-note" style={{ marginBottom: 0 }}>当前没有切分出的证据片段。</div> : null}
                  </div>
                </DetailCard>
              </aside>
            </section>
          </section>
        ) : null}
      </main>
    </div>
  );
}
