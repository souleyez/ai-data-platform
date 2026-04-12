'use client';

function normalizePermissionLevel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

export default function LibraryTabs({
  libraries,
  activeLibrary,
  activeLibraryRecord,
  onSelectLibrary,
  getLibraryDocumentCount,
  visibleItems,
  ungroupedCount,
  createDraft,
  createPermissionLevel,
  onCreateDraftChange,
  onCreatePermissionLevelChange,
  onCreateLibrary,
  createSubmitting,
  settingsExpanded,
  onToggleSettings,
}) {
  const canEditCurrentLibrary = Boolean(activeLibraryRecord);

  return (
    <section className="workbench-toolbar card">
      <div className="library-toolbar-head">
        <div className="library-toolbar-head-main">
          <div className="workbench-toolbar-label">数据集分组</div>
          <button
            className="ghost-btn"
            type="button"
            onClick={onToggleSettings}
            disabled={!canEditCurrentLibrary}
          >
            {settingsExpanded ? '收起当前数据集' : '编辑当前数据集'}
          </button>
        </div>
        <div className="library-inline-create">
          <input
            className="filter-input library-inline-create-name"
            value={createDraft}
            onChange={(event) => onCreateDraftChange(event.target.value)}
            placeholder="新建数据集名称"
          />
          <input
            className="filter-input library-inline-create-level"
            type="number"
            min="0"
            step="1"
            value={normalizePermissionLevel(createPermissionLevel)}
            onChange={(event) => onCreatePermissionLevelChange(normalizePermissionLevel(event.target.value))}
            placeholder="权限等级"
          />
          <button
            className="ghost-btn"
            type="button"
            onClick={onCreateLibrary}
            disabled={createSubmitting || !String(createDraft || '').trim()}
          >
            {createSubmitting ? '创建中...' : '新建数据集'}
          </button>
        </div>
      </div>

      <div className="workbench-toolbar-tabs">
        {libraries.map((library) => (
          <button
            key={library.key}
            className={`workbench-tab ${activeLibrary === library.key ? 'active' : ''}`}
            type="button"
            onClick={() => onSelectLibrary(library.key)}
          >
            <span>{library.label}</span>
            <span className="library-permission-pill">L{normalizePermissionLevel(library.permissionLevel)}</span>
            <span className="library-tab-count">{getLibraryDocumentCount(library, visibleItems, libraries)}</span>
          </button>
        ))}
        <button className={`workbench-tab ${activeLibrary === 'all' ? 'active' : ''}`} type="button" onClick={() => onSelectLibrary('all')}>
          全部文档
        </button>
        <button className={`workbench-tab ${activeLibrary === 'ungrouped' ? 'active' : ''}`} type="button" onClick={() => onSelectLibrary('ungrouped')}>
          <span>未分组</span>
          <span className="library-tab-count">{ungroupedCount}</span>
        </button>
      </div>
    </section>
  );
}
