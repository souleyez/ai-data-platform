'use client';

function normalizePermissionLevel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

function buildSettingsDraft(library, draft) {
  return {
    label: typeof draft?.label === 'string' ? draft.label : (library?.label || library?.name || ''),
    description: typeof draft?.description === 'string' ? draft.description : (library?.description || ''),
    permissionLevel: normalizePermissionLevel(
      draft?.permissionLevel ?? library?.permissionLevel ?? 0,
    ),
  };
}

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
  settingsDrafts,
  onSettingsChange,
  onSaveSettings,
  settingsSubmittingId,
}) {
  return (
    <section className="workbench-toolbar card library-toolbar-card">
      <div className="library-toolbar-head">
        <div>
          <div className="workbench-toolbar-label">知识库分组</div>
          <div className="bot-config-subtle">
            知识库权限等级用于机器人访问控制。机器人等级为 N 时，可访问权限等级大于等于 N 的知识库。
          </div>
        </div>
        <div className="library-inline-create">
          <input
            className="filter-input library-inline-create-name"
            value={createDraft.name}
            onChange={(event) => onCreateDraftChange({
              ...createDraft,
              name: event.target.value,
            })}
            placeholder="新建知识库名称"
          />
          <input
            className="filter-input library-inline-create-level"
            type="number"
            min="0"
            step="1"
            value={normalizePermissionLevel(createDraft.permissionLevel)}
            onChange={(event) => onCreateDraftChange({
              ...createDraft,
              permissionLevel: normalizePermissionLevel(event.target.value),
            })}
            placeholder="权限等级"
          />
          <button
            className="ghost-btn"
            type="button"
            onClick={onCreateLibrary}
            disabled={createSubmitting || !String(createDraft.name || '').trim()}
          >
            {createSubmitting ? '创建中...' : '新建知识库'}
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
        <button
          className={`workbench-tab ${activeLibrary === 'all' ? 'active' : ''}`}
          type="button"
          onClick={() => onSelectLibrary('all')}
        >
          全部文档
        </button>
        <button
          className={`workbench-tab ${activeLibrary === 'ungrouped' ? 'active' : ''}`}
          type="button"
          onClick={() => onSelectLibrary('ungrouped')}
        >
          <span>未分组</span>
          <span className="library-tab-count">{ungroupedCount}</span>
        </button>
      </div>

      <div className="library-admin-panel">
        <div className="library-admin-head">
          <strong>知识库权限等级</strong>
          <span className="bot-config-subtle">0 为最高权限，数字越大权限越低。这里配置的是库级别，不是单个文档级别。</span>
        </div>
        <div className="library-admin-list">
          {libraries.map((library) => {
            const draft = buildSettingsDraft(library, settingsDrafts?.[library.key]);
            const count = getLibraryDocumentCount(library, visibleItems, libraries);
            return (
              <div key={library.key} className="library-admin-card">
                <div className="library-admin-summary">
                  <div>
                    <strong>{library.label}</strong>
                    <div className="library-admin-meta">
                      <span>Key: {library.key}</span>
                      <span>文档数: {count}</span>
                    </div>
                  </div>
                  <span className="library-permission-pill library-permission-pill-strong">L{draft.permissionLevel}</span>
                </div>
                <div className="library-admin-grid">
                  <label className="bot-field">
                    <span>知识库名称</span>
                    <input
                      value={draft.label}
                      onChange={(event) => onSettingsChange(library.key, { label: event.target.value })}
                    />
                  </label>
                  <label className="bot-field">
                    <span>权限等级</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={draft.permissionLevel}
                      onChange={(event) => onSettingsChange(library.key, {
                        permissionLevel: normalizePermissionLevel(event.target.value),
                      })}
                    />
                  </label>
                  <label className="bot-field bot-field-span">
                    <span>描述</span>
                    <textarea
                      rows={2}
                      value={draft.description}
                      onChange={(event) => onSettingsChange(library.key, { description: event.target.value })}
                      placeholder="可选，补充说明这个知识库的资料范围"
                    />
                  </label>
                </div>
                <div className="bot-config-actions">
                  <button
                    className="ghost-btn"
                    type="button"
                    onClick={() => onSaveSettings(library.key)}
                    disabled={settingsSubmittingId === library.key}
                  >
                    {settingsSubmittingId === library.key ? '保存中...' : '保存知识库设置'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
