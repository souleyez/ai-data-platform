'use client';

export default function LibraryTabs({
  libraries,
  activeLibrary,
  onSelectLibrary,
  getLibraryDocumentCount,
  visibleItems,
  ungroupedCount,
}) {
  return (
    <section className="workbench-toolbar card">
      <div className="workbench-toolbar-label">知识库分组</div>
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
