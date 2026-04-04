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
  activeLibrarySettingsDraft,
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
  onSettingsChange,
  onSaveSettings,
  settingsSubmittingId,
}) {
  return (
    <section className="workbench-toolbar card">
      <div className="library-toolbar-head">
        <div className="workbench-toolbar-label">知识库分组</div>
        <div className="library-inline-create">
          <input
            className="filter-input library-inline-create-name"
            value={createDraft}
            onChange={(event) => onCreateDraftChange(event.target.value)}
            placeholder="新建分组名称"
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
            {createSubmitting ? '创建中...' : '新建分组'}
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

      {activeLibraryRecord && activeLibrarySettingsDraft ? (
        <div className="library-settings-inline">
          <div className="library-settings-inline-head">
            <strong>当前知识库设置</strong>
            <span className="bot-config-subtle">这里仅补充知识库权限等级和说明，不改原有文档中心结构。</span>
          </div>
          <div className="library-settings-inline-grid">
            <label className="bot-field">
              <span>知识库名称</span>
              <input
                value={activeLibrarySettingsDraft.label}
                onChange={(event) => onSettingsChange(activeLibraryRecord.key, { label: event.target.value })}
              />
            </label>
            <label className="bot-field">
              <span>权限等级</span>
              <input
                type="number"
                min="0"
                step="1"
                value={normalizePermissionLevel(activeLibrarySettingsDraft.permissionLevel)}
                onChange={(event) => onSettingsChange(activeLibraryRecord.key, {
                  permissionLevel: normalizePermissionLevel(event.target.value),
                })}
              />
            </label>
            <label className="bot-field bot-field-span">
              <span>描述</span>
              <textarea
                rows={2}
                value={activeLibrarySettingsDraft.description}
                onChange={(event) => onSettingsChange(activeLibraryRecord.key, { description: event.target.value })}
                placeholder="可选，补充这个知识库的资料范围"
              />
            </label>
          </div>
          <div className="bot-config-actions">
            <button
              className="ghost-btn"
              type="button"
              onClick={() => onSaveSettings(activeLibraryRecord.key)}
              disabled={settingsSubmittingId === activeLibraryRecord.key}
            >
              {settingsSubmittingId === activeLibraryRecord.key ? '保存中...' : '保存知识库设置'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
