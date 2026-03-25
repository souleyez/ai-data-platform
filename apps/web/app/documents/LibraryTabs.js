'use client';

export default function LibraryTabs({
  libraries,
  activeLibrary,
  onSelectLibrary,
  getLibraryDocumentCount,
  visibleItems,
  ungroupedCount,
  createDraft,
  onCreateDraftChange,
  onCreateLibrary,
  createSubmitting,
}) {
  return (
    <section className="workbench-toolbar card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="workbench-toolbar-label">知识库分组</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="filter-input"
            style={{ minWidth: 180 }}
            value={createDraft}
            onChange={(event) => onCreateDraftChange(event.target.value)}
            placeholder="新建分组名称"
          />
          <button
            className="ghost-btn"
            type="button"
            onClick={onCreateLibrary}
            disabled={createSubmitting || !createDraft.trim()}
          >
            {createSubmitting ? '创建中...' : '新建分组'}
          </button>
        </div>
      </div>
      <div className="workbench-toolbar-tabs">
        {libraries.map((library) => (
          <button
            key={library.key}
            className={`workbench-tab ${activeLibrary === library.key ? 'active' : ''}`}
            onClick={() => onSelectLibrary(library.key)}
          >
            <span>{library.label}</span>
            <span className="library-tab-count">{getLibraryDocumentCount(library, visibleItems, libraries)}</span>
          </button>
        ))}
        <button className={`workbench-tab ${activeLibrary === 'all' ? 'active' : ''}`} onClick={() => onSelectLibrary('all')}>
          全部文档
        </button>
        <button className={`workbench-tab ${activeLibrary === 'ungrouped' ? 'active' : ''}`} onClick={() => onSelectLibrary('ungrouped')}>
          <span>未分组</span>
          <span className="library-tab-count">{ungroupedCount}</span>
        </button>
      </div>
    </section>
  );
}
