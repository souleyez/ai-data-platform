import Sidebar from '../../components/Sidebar';
import DocumentAnalysisPanel from '../DocumentAnalysisPanel';
import { buildBackendApiUrl, buildApiUrl } from '../../lib/config';
import { sourceItems } from '../../lib/mock-data';
import { getDocumentGroupLabel } from '../../lib/document-taxonomy';

export const dynamic = 'force-dynamic';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const TEXT_PREVIEW_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json']);

function resolveDocumentId(params) {
  const raw = params?.id;
  return Array.isArray(raw) ? raw[0] : raw || '';
}

function joinGroups(groups) {
  return Array.isArray(groups) && groups.length
    ? groups.map(getDocumentGroupLabel).join('、')
    : '未分组';
}

export default async function DocumentPreviewPage({ params }) {
  const documentId = resolveDocumentId(params);
  if (!documentId) return null;

  let item = null;
  let meta = null;
  let feedbackSnapshot = null;
  let libraryKnowledge = [];

  try {
    const response = await fetch(
      buildBackendApiUrl(`/api/documents/detail?id=${encodeURIComponent(documentId)}`),
      { cache: 'no-store' },
    );

    if (response.ok) {
      const json = await response.json();
      item = json?.item || null;
      meta = json?.meta || null;
      feedbackSnapshot = json?.feedbackSnapshot || null;
      libraryKnowledge = Array.isArray(json?.libraryKnowledge) ? json.libraryKnowledge : [];
    }
  } catch {
    item = null;
  }

  if (!item) {
    return (
      <div className="app-shell">
        <Sidebar sourceItems={sourceItems} currentPath="/documents" />
        <main className="main-panel">
          <header className="topbar">
            <div>
              <h2>文件预览</h2>
              <p>未找到对应文档，请返回文档中心重试。</p>
            </div>
            <div className="topbar-actions">
              <a href="/documents" className="ghost-btn back-link">返回文档中心</a>
            </div>
          </header>
        </main>
      </div>
    );
  }

  const ext = String(item.ext || '').toLowerCase();
  const isImage = IMAGE_EXTENSIONS.has(ext);
  const isTextPreview = TEXT_PREVIEW_EXTENSIONS.has(ext);
  const isPdf = ext === '.pdf';
  const canPreview = isImage || isTextPreview || isPdf;
  const sourceAvailable = item?.sourceAvailable !== false;
  const previewUrl = canPreview ? buildApiUrl(`/api/documents/preview?id=${encodeURIComponent(documentId)}`) : '';
  const downloadUrl = buildApiUrl(`/api/documents/download?id=${encodeURIComponent(documentId)}`);

  const previewHint = sourceAvailable
    ? (canPreview
      ? '当前直接预览原文件，右上角可下载。'
      : '当前文件类型不支持浏览器内原件预览，请直接下载查看。')
    : '原始文件未同步到当前服务器，下方展示已解析内容和摘要。';

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sourceItems} currentPath="/documents" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>文件预览</h2>
            <p>{item.name}</p>
          </div>
          <div className="topbar-actions">
            {sourceAvailable ? (
              <a href={downloadUrl} className="ghost-btn" download>下载原文件</a>
            ) : (
              <span className="ghost-btn disabled-btn" aria-disabled="true">原文件暂不可下载</span>
            )}
            <a href="/documents" className="ghost-btn back-link">返回文档中心</a>
          </div>
        </header>

        <section className="card table-card">
          <div className="message-refs">
            <span className="source-chip">知识库：{joinGroups(item.confirmedGroups || item.groups || [])}</span>
            <span className="source-chip">文件类型：{item.ext || '-'}</span>
          </div>
          <div className="preview-meta-line">{item.path}</div>
        </section>

        <section className="card documents-card">
          <div className="panel-header">
            <div>
              <h3>原文件预览</h3>
              <p>{previewHint}</p>
            </div>
          </div>

          {isImage && canPreview && previewUrl ? (
            <div className="document-preview-wrap">
              <img
                src={previewUrl}
                alt={item.title || item.name || 'document preview'}
                className="document-image-preview document-image-preview-large"
              />
            </div>
          ) : null}

          {!isImage && canPreview && previewUrl ? (
            <div className="document-file-frame-wrap">
              <iframe
                src={previewUrl}
                title={item.name || 'document preview'}
                className="document-file-frame"
              />
            </div>
          ) : null}

          {!canPreview ? (
            <div className="document-preview-empty">
              <p>当前文件类型暂不支持浏览器内原件预览。</p>
              {sourceAvailable ? (
                <a href={downloadUrl} className="ghost-btn" download>下载原文件</a>
              ) : null}
            </div>
          ) : null}
        </section>

        <DocumentAnalysisPanel item={item} feedbackSnapshot={feedbackSnapshot} libraryKnowledge={libraryKnowledge} />
      </main>
    </div>
  );
}
