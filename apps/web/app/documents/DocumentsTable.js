'use client';

function renderCanonicalSource(item) {
  const source = String(item?.canonicalSource || '').trim();
  const label = (() => {
    switch (source) {
      case 'existing-markdown':
        return '现成 MD';
      case 'markitdown':
        return 'MarkItDown';
      case 'full-text':
        return '旧正文';
      case 'none':
        return '未生成';
      default:
        return '';
    }
  })();
  if (!label) return null;

  const color = source === 'none' || item?.markdownError
    ? '#b91c1c'
    : source === 'full-text'
      ? '#92400e'
      : '#166534';

  return (
    <span style={{ fontSize: 12, color }}>
      canonical: {label}
    </span>
  );
}

function renderParseStage(item, parseMethodLabels) {
  const methodLabel = parseMethodLabels[item.parseMethod] || item.parseMethod || '-';
  const stageLabel = item.parseStage === 'detailed' ? '进阶解析' : '快速解析';
  const isFailed = item.parseStatus === 'error' || item.detailParseStatus === 'failed';
  const detailErrorLabel = item.detailParseError === 'ocr-text-not-extracted'
    ? 'OCR 未提取到文本'
    : item.detailParseError === 'parse-error'
      ? '解析失败'
      : item.detailParseError;
  const detailStatusLabel = (() => {
    switch (item.detailParseStatus) {
      case 'queued':
        return '深度任务待处理';
      case 'processing':
        return '深度任务处理中';
      case 'failed':
        return '深度任务失败';
      case 'succeeded':
        return '深度任务完成';
      default:
        return '';
    }
  })();

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span style={isFailed ? { color: '#b91c1c', fontWeight: 600 } : undefined}>{item.parseStatus || '-'}</span>
      <span style={{ fontSize: 12, color: '#64748b' }}>{methodLabel}</span>
      <span style={{ fontSize: 12, color: '#64748b' }}>{stageLabel}</span>
      {renderCanonicalSource(item)}
      {detailStatusLabel ? (
        <span style={{ fontSize: 12, color: item.detailParseStatus === 'failed' ? '#b91c1c' : '#475569' }}>
          {detailStatusLabel}
        </span>
      ) : null}
      {detailErrorLabel ? (
        <span style={{ fontSize: 12, color: '#b91c1c' }}>{detailErrorLabel}</span>
      ) : null}
    </div>
  );
}

function canReparseDocument(item) {
  return item?.parseStatus === 'error' || item?.detailParseStatus === 'failed';
}

export default function DocumentsTable({
  simpleMode = false,
  currentPage,
  totalPages,
  pageSize,
  paginatedItems,
  filteredItems,
  recentNewIds,
  getDocumentLibraryKeys,
  libraries,
  itemLabelMap,
  libraryDrafts,
  onLibraryDraftChange,
  expandedLibraryEditorId,
  onOpenLibraryEditor,
  onCloseLibraryEditor,
  assignmentSubmittingId,
  ignoreSubmittingId,
  reparseSubmittingId,
  updateDocumentLibraries,
  acceptSuggestedGroups,
  ignoreDocument,
  reparseDocument,
  formatDocumentBusinessResult,
  parseMethodLabels,
  onFirstPage,
  onPrevPage,
  onNextPage,
  onLastPage,
}) {
  return (
    <section className="card table-card">
      <div className="panel-header">
        <div>
          <h3>文档列表</h3>
          <p>
            {simpleMode
              ? '这里只保留文档列表和详情入口。文档治理与高级操作暂时收起。'
              : '上传后先进入快速解析，进阶解析会在后台继续完成。失败文档可在列表里直接手动重新解析。'}
          </p>
        </div>
        <div className="table-pagination-summary">
          <span>{`第 ${currentPage} / ${totalPages} 页`}</span>
          <span>{`每页 ${pageSize} 条`}</span>
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
            <th>数据集分组</th>
            <th>解析</th>
            <th>业务结果</th>
            <th>摘要</th>
          </tr>
        </thead>
        <tbody>
          {paginatedItems.map((item) => {
            const groups = item.confirmedGroups || item.groups || [];
            const suggestedGroups = item.confirmedGroups?.length ? [] : (item.suggestedGroups || []);
            const effectiveGroups = getDocumentLibraryKeys(item, libraries);
            const availableLibraries = libraries.filter((library) => library.key !== 'ungrouped' && !effectiveGroups.includes(library.key));
            const draftValue = libraryDrafts[item.id] || availableLibraries[0]?.key || '';

            return (
              <tr key={item.id} style={recentNewIds.includes(item.id) ? { background: '#f0fdf4' } : undefined}>
                <td className="document-name-cell">
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <a href={`/documents/${item.id}`}>{item.name}</a>
                      {recentNewIds.includes(item.id) ? (
                        <span className="source-chip" style={{ background: '#dcfce7', color: '#166534' }}>新增</span>
                      ) : null}
                    </div>
                    {!simpleMode ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {canReparseDocument(item) ? (
                          <button
                            type="button"
                            className="ghost-btn compact-inline-btn"
                            onClick={() => reparseDocument(item.id)}
                            disabled={reparseSubmittingId === item.id}
                          >
                            {reparseSubmittingId === item.id ? '重新解析中..' : '重新解析'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="ghost-btn compact-inline-btn"
                          onClick={() => ignoreDocument(item.id)}
                          disabled={ignoreSubmittingId === item.id}
                        >
                          {ignoreSubmittingId === item.id ? '删除中..' : '删除'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </td>

                <td className="library-cell">
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {effectiveGroups.length ? effectiveGroups.map((group) => {
                        const matchedLibrary = libraries.find((library) => library.key === group);
                        const removable = groups.includes(group) && matchedLibrary?.key !== 'ungrouped';
                        return (
                          <span key={group} className="source-chip" style={{ gap: 8 }}>
                            {itemLabelMap.get(group) || group}
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
                      }) : <span style={{ color: '#64748b' }}>未加入数据集分组</span>}
                    </div>

                    {!simpleMode && suggestedGroups.length ? (
                      <div style={{ display: 'grid', gap: 8 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {suggestedGroups.map((group) => (
                            <span key={`suggested-${item.id}-${group}`} className="source-chip" style={{ background: '#fff7ed', borderColor: '#fdba74' }}>
                              建议: {itemLabelMap.get(group) || group}
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
                            {assignmentSubmittingId === item.id ? '接受中..' : '接受建议'}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {!simpleMode && availableLibraries.length ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {expandedLibraryEditorId === item.id ? (
                          <>
                            <select
                              className="filter-input"
                              style={{ minWidth: 160, maxWidth: 220 }}
                              value={draftValue}
                              onChange={(event) => onLibraryDraftChange(item.id, event.target.value)}
                            >
                              {availableLibraries.map((library) => (
                                <option key={library.key} value={library.key}>{library.label}</option>
                              ))}
                            </select>
                            <button
                              className="ghost-btn"
                              type="button"
                              disabled={!draftValue || assignmentSubmittingId === item.id}
                              onClick={async () => {
                                await updateDocumentLibraries(item.id, [...groups, draftValue]);
                                onCloseLibraryEditor();
                              }}
                            >
                              {assignmentSubmittingId === item.id ? '保存中..' : '确认'}
                            </button>
                            <button
                              className="ghost-btn"
                              type="button"
                              onClick={onCloseLibraryEditor}
                              disabled={assignmentSubmittingId === item.id}
                            >
                              取消
                            </button>
                          </>
                        ) : (
                          <button className="ghost-btn compact-inline-btn" type="button" onClick={() => onOpenLibraryEditor(item.id)}>
                            添加
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </td>

                <td className="summary-cell">
                  {renderParseStage(item, parseMethodLabels)}
                </td>
                <td className="summary-cell">{formatDocumentBusinessResult(item)}</td>
                <td className="summary-cell excerpt-cell">
                  <a href={`/documents/${item.id}`} title="查看解析详情">
                    {item.summary || '-'}
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="table-pagination">
        <button className="ghost-btn" type="button" onClick={onFirstPage} disabled={currentPage === 1}>首页</button>
        <button className="ghost-btn" type="button" onClick={onPrevPage} disabled={currentPage === 1}>上一页</button>
        <span className="table-pagination-text">
          {`显示 ${filteredItems.length ? ((currentPage - 1) * pageSize) + 1 : 0} - ${Math.min(currentPage * pageSize, filteredItems.length)} / ${filteredItems.length}`}
        </span>
        <button className="ghost-btn" type="button" onClick={onNextPage} disabled={currentPage >= totalPages}>下一页</button>
        <button className="ghost-btn" type="button" onClick={onLastPage} disabled={currentPage >= totalPages}>末页</button>
      </div>
    </section>
  );
}
