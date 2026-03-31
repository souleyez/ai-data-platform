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
  'text-utf8-bom': 'UTF-8 文本',
  'text-gb18030': 'GB18030 文本',
  'text-utf16le': 'UTF-16 LE 文本',
  'text-utf16be': 'UTF-16 BE 文本',
  'markdown-utf8': 'Markdown',
  'markdown-gb18030': 'Markdown',
  'csv-utf8': 'CSV',
  'json-parse': 'JSON',
  'html-strip': 'HTML 提取',
  mammoth: 'DOCX 提取',
  'xlsx-sheet-reader': '表格读取',
  'pdf-parse': 'PDF 文本',
  pypdf: 'PyPDF',
  'pdf-auto': 'PDF 自动解析',
  'ocr-fallback': 'OCR',
  unsupported: '暂不支持',
  error: '解析失败',
};

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const READER_PAGE_CHARS = 2600;

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

function DetailRow({ label, value }) {
  return (
    <div className="message-ref-item">
      <strong>{label}</strong>
      <span>{value || '-'}</span>
    </div>
  );
}

function joinValues(values) {
  if (!Array.isArray(values) || !values.length) return '-';
  return values.filter(Boolean).join('、');
}

function getDetailStatusLabel(item) {
  if (item.parseStage === 'detailed') return '进阶解析完成';
  switch (item.detailParseStatus) {
    case 'queued':
      return '已进入进阶解析队列';
    case 'processing':
      return '进阶解析进行中';
    case 'failed':
      return '进阶解析失败';
    case 'succeeded':
      return '进阶解析完成';
    default:
      return '仅完成快速解析';
  }
}

function splitDocumentPages(text, maxChars = READER_PAGE_CHARS) {
  const normalized = String(text || '').replace(/\r/g, '').trim();
  if (!normalized) return [];

  const blocks = normalized
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!blocks.length) return [normalized];

  const pages = [];
  let current = '';

  const pushCurrent = () => {
    if (!current.trim()) return;
    pages.push(current.trim());
    current = '';
  };

  for (const block of blocks) {
    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) pushCurrent();

    if (block.length <= maxChars) {
      current = block;
      continue;
    }

    let cursor = 0;
    while (cursor < block.length) {
      const piece = block.slice(cursor, cursor + maxChars).trim();
      if (piece) pages.push(piece);
      cursor += maxChars;
    }
  }

  pushCurrent();
  return pages.length ? pages : [normalized];
}

function renderStructuredProfile(item) {
  const profile = item?.structuredProfile || {};
  const schemaType = item?.schemaType || 'generic';

  if (schemaType === 'contract') {
    return (
      <div className="message-ref-list">
        <DetailRow label="合同编号" value={profile.contractNo || item?.contractFields?.contractNo} />
        <DetailRow label="合同金额" value={profile.amount || item?.contractFields?.amount} />
        <DetailRow label="付款条款" value={profile.paymentTerms || item?.contractFields?.paymentTerms} />
        <DetailRow label="履约期限" value={profile.duration || item?.contractFields?.duration} />
        <DetailRow label="主题标签" value={joinValues(profile.topicTags || item?.topicTags)} />
      </div>
    );
  }

  if (schemaType === 'resume') {
    return (
      <div className="message-ref-list">
        <DetailRow label="候选人" value={profile.candidateName || item?.resumeFields?.candidateName} />
        <DetailRow label="目标岗位" value={profile.targetRole || item?.resumeFields?.targetRole} />
        <DetailRow label="当前岗位" value={profile.currentRole || item?.resumeFields?.currentRole} />
        <DetailRow label="工作年限" value={profile.yearsOfExperience || item?.resumeFields?.yearsOfExperience} />
        <DetailRow label="教育背景" value={profile.education || item?.resumeFields?.education} />
        <DetailRow label="专业" value={profile.major || item?.resumeFields?.major} />
        <DetailRow label="技能" value={joinValues(profile.skills || item?.resumeFields?.skills)} />
        <DetailRow label="亮点" value={joinValues(profile.highlights || item?.resumeFields?.highlights)} />
      </div>
    );
  }

  if (schemaType === 'formula') {
    return (
      <div className="message-ref-list">
        <DetailRow label="文档类型" value="奶粉配方 / 营养资料" />
        <DetailRow label="关注主题" value={joinValues(profile.focus || profile.topicTags || item?.topicTags)} />
        <DetailRow label="摘要" value={profile.summary || item?.summary} />
      </div>
    );
  }

  if (schemaType === 'paper') {
    return (
      <div className="message-ref-list">
        <DetailRow label="文档类型" value="学术论文" />
        <DetailRow label="研究主题" value={joinValues(profile.focus || profile.topicTags || item?.topicTags)} />
        <DetailRow label="摘要" value={profile.summary || item?.summary} />
      </div>
    );
  }

  if (schemaType === 'technical') {
    return (
      <div className="message-ref-list">
        <DetailRow label="文档类型" value="技术文档" />
        <DetailRow label="关注主题" value={joinValues(profile.focus || profile.topicTags || item?.topicTags)} />
        <DetailRow label="摘要" value={profile.summary || item?.summary} />
      </div>
    );
  }

  if (schemaType === 'report') {
    return (
      <div className="message-ref-list">
        <DetailRow label="文档类型" value="业务报表" />
        <DetailRow label="报告主题" value={joinValues(profile.focus || profile.topicTags || item?.topicTags)} />
        <DetailRow label="摘要" value={profile.summary || item?.summary} />
      </div>
    );
  }

  return (
    <div className="message-ref-list">
      <DetailRow label="Schema 类型" value={schemaType} />
      <DetailRow label="主题标签" value={joinValues(profile.topicTags || item?.topicTags)} />
      <DetailRow label="摘要" value={profile.summary || item?.summary} />
    </div>
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
  const [pageIndex, setPageIndex] = useState(0);

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
        // keep fallback
      }
    }

    void loadDetail();
    void loadDatasources();
  }, [documentId]);

  const currentGroups = useMemo(() => data?.confirmedGroups || data?.groups || [], [data]);
  const isImageDocument = useMemo(() => IMAGE_EXTENSIONS.has(String(data?.ext || '').toLowerCase()), [data]);
  const filePreviewUrl = useMemo(
    () => (documentId && isImageDocument ? buildApiUrl(`/api/documents/file?id=${encodeURIComponent(documentId)}`) : ''),
    [documentId, isImageDocument],
  );
  const fullText = useMemo(() => String(data?.fullText || data?.excerpt || '').trim(), [data]);
  const readerPages = useMemo(() => splitDocumentPages(fullText), [fullText]);
  const currentPageText = readerPages[pageIndex] || '';

  useEffect(() => {
    setPageIndex(0);
  }, [documentId, fullText]);

  const highlightedText = useMemo(() => {
    if (!keyword.trim() || !currentPageText) return currentPageText;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return currentPageText.replace(new RegExp(escaped, 'gi'), (match) => `<<<HIT>>>${match}<<<END>>>`);
  }, [currentPageText, keyword]);

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/documents" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>文档详情</h2>
            <p>快速解析负责尽快入库，进阶解析负责补充高质量结构化结果和证据块。</p>
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
                <span className="source-chip">业务分类：{getPrimaryCategoryLabel(meta?.bizCategory || data?.bizCategory)}</span>
                <span className="source-chip">知识库：{currentGroups.length ? currentGroups.map(getDocumentGroupLabel).join('、') : '未分组'}</span>
                <span className="source-chip">解析状态：{data.parseStatus || '-'}</span>
                <span className="source-chip">解析方式：{PARSE_METHOD_LABELS[data.parseMethod] || data.parseMethod || '-'}</span>
                <span className="source-chip">解析阶段：{data.parseStage || '-'}</span>
                <span className="source-chip">结构类型：{data.schemaType || 'generic'}</span>
                <span className="source-chip">提取字符：{data.extractedChars ?? 0}</span>
                {data.retentionStatus === 'structured-only' ? <span className="source-chip">仅保留结构化结果</span> : null}
              </div>
            </section>

            <section className="document-reader-layout">
              <div className="document-reader-main">
                <section className="card documents-card">
                  <div className="panel-header">
                    <div>
                      <h3>文档原文</h3>
                      <p>当前用于检索、问答和生成输出的正文内容。</p>
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
                  {isImageDocument && filePreviewUrl ? (
                    <div className="document-preview-wrap">
                      <img
                        src={filePreviewUrl}
                        alt={data.title || data.name || 'document preview'}
                        className="document-image-preview"
                      />
                    </div>
                  ) : null}
                  {readerPages.length > 1 ? (
                    <div className="document-reader-pagination">
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => setPageIndex((value) => Math.max(0, value - 1))}
                        disabled={pageIndex <= 0}
                      >
                        上一页
                      </button>
                      <span className="page-note">第 {pageIndex + 1} / {readerPages.length} 页</span>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => setPageIndex((value) => Math.min(readerPages.length - 1, value + 1))}
                        disabled={pageIndex >= readerPages.length - 1}
                      >
                        下一页
                      </button>
                    </div>
                  ) : null}
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
                <DetailCard title="解析进度">
                  <div className="message-ref-list">
                    <DetailRow label="当前阶段" value={data.parseStage === 'detailed' ? '进阶解析' : '快速解析'} />
                    <DetailRow label="进阶状态" value={getDetailStatusLabel(data)} />
                    <DetailRow label="任务入队时间" value={data.detailParseQueuedAt || '-'} />
                    <DetailRow label="完成时间" value={data.detailParsedAt || '-'} />
                    <DetailRow label="云端增强时间" value={data.cloudStructuredAt || '-'} />
                    <DetailRow label="云端增强模型" value={data.cloudStructuredModel || '-'} />
                    <DetailRow label="尝试次数" value={String(data.detailParseAttempts ?? 0)} />
                    {data.detailParseError ? <DetailRow label="失败原因" value={data.detailParseError} /> : null}
                  </div>
                </DetailCard>

                <DetailCard title="摘要">
                  <div className="summary-cell" style={{ maxWidth: 'none' }}>{data.summary || '-'}</div>
                </DetailCard>

                <DetailCard title="结构化视图">
                  {renderStructuredProfile(data)}
                </DetailCard>

                <DetailCard title="意图槽位">
                  <div className="message-ref-list">
                    <DetailRow label="人群" value={joinValues(data.intentSlots?.audiences)} />
                    <DetailRow label="成分" value={joinValues(data.intentSlots?.ingredients)} />
                    <DetailRow label="菌株" value={joinValues(data.intentSlots?.strains)} />
                    <DetailRow label="功效" value={joinValues(data.intentSlots?.benefits)} />
                    <DetailRow label="剂量 / 指标" value={joinValues([...(data.intentSlots?.doses || []), ...(data.intentSlots?.metrics || [])])} />
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

                <DetailCard title="关系与结论">
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

                <DetailCard title="证据块">
                  <div className="message-ref-list">
                    {(data.evidenceChunks || []).slice(0, 6).map((chunk) => (
                      <div key={chunk.id} className="message-ref-item">
                        <strong>{chunk.title || `片段 ${chunk.order + 1}`}</strong>
                        <span>{chunk.text}</span>
                      </div>
                    ))}
                    {!data.evidenceChunks?.length ? <div className="page-note" style={{ marginBottom: 0 }}>当前没有切分出的证据块。</div> : null}
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
