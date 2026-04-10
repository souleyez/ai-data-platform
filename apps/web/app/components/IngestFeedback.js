'use client';

export default function IngestFeedback({
  feedback,
  onAcceptGroupSuggestion,
  onAssignLibrary,
  selectedManualLibraries,
  onChangeManualLibrary,
  availableLibraries = [],
  groupSaving = false,
  fallbackLink = true,
}) {
  if (!feedback) return null;

  const items = Array.isArray(feedback.ingestItems) ? feedback.ingestItems : [];

  return (
    <div
      style={{
        marginTop: 12,
        padding: '12px 14px',
        borderRadius: 14,
        border: '1px solid rgba(148,163,184,0.2)',
        background: 'rgba(15,23,42,0.04)',
      }}
    >
      <div style={{ fontWeight: 600 }}>{feedback.message}</div>

      {feedback.summary ? (
        <div style={{ marginTop: 6, fontSize: 13, color: '#64748b' }}>
          共 {feedback.summary.total} 项，成功 {feedback.summary.successCount} 项，失败 {feedback.summary.failedCount} 项
          {typeof feedback.summary.collectedCount === 'number' ? `，本次抓取 ${feedback.summary.collectedCount} 篇` : ''}
        </div>
      ) : null}

      {items.length ? (
        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                padding: '10px 12px',
                border: '1px solid rgba(148,163,184,0.22)',
                borderRadius: 12,
                background: '#fff',
              }}
            >
              <div style={{ fontSize: 12, color: '#64748b' }}>{item.sourceName}</div>

              {item.status === 'success' ? (
                <>
                  <div style={{ marginTop: 6, fontWeight: 700, fontSize: 15 }}>
                    {item.preview?.title || '-'}
                  </div>

                  {item.preview?.summary ? (
                    <div style={{ marginTop: 6, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                      {item.preview.summary}
                    </div>
                  ) : null}

                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="source-chip">
                      解析类型：{item.preview?.docType || '-'}
                    </span>
                    {item.groupSuggestion?.suggestedGroups?.length ? (
                      item.groupSuggestion.suggestedGroups.map((group) => (
                        <span key={group.key} className="source-chip">
                          {item.groupSuggestion?.accepted ? '已归入知识库：' : '推荐知识库：'}
                          {group.label}
                        </span>
                      ))
                    ) : (
                      <span className="source-chip">默认：未分组</span>
                    )}
                  </div>

                  <div style={{ marginTop: 8, fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
                    {item.groupSuggestion?.basis || item.recommendation?.reason || '已完成知识库分组建议。'}
                  </div>

                  {item.groupSuggestion?.suggestedGroups?.length && !item.groupSuggestion?.accepted ? (
                    <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        className="ghost-btn"
                        type="button"
                        onClick={() => onAcceptGroupSuggestion?.(item.id)}
                        disabled={groupSaving}
                      >
                        采纳推荐分组
                      </button>
                    </div>
                  ) : null}

                  <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                      className="filter-input"
                      style={{ minWidth: 190, maxWidth: 260 }}
                      value={selectedManualLibraries?.[item.id] || ''}
                      onChange={(event) => onChangeManualLibrary?.(item.id, event.target.value)}
                      disabled={groupSaving || !availableLibraries.length}
                    >
                      <option value="">手动加入指定知识库</option>
                      {availableLibraries.map((library) => (
                        <option key={library.key} value={library.key}>{library.label}</option>
                      ))}
                    </select>
                    <button
                      className="ghost-btn"
                      type="button"
                      onClick={() => onAssignLibrary?.(item.id)}
                      disabled={groupSaving || !selectedManualLibraries?.[item.id]}
                    >
                      加入指定分组
                    </button>
                    {!availableLibraries.length ? (
                      <span style={{ fontSize: 13, color: '#64748b' }}>先去文档中心创建知识库分组。</span>
                    ) : null}
                  </div>
                </>
              ) : (
                <div style={{ marginTop: 6, color: '#b91c1c' }}>
                  处理失败：{item.errorMessage || '未知错误'}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {fallbackLink ? (
        <a href="/documents" className="ref-chip" style={{ display: 'inline-block', marginTop: 12 }}>
          前往文档中心
        </a>
      ) : null}
    </div>
  );
}
