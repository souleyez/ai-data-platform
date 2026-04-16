'use client';

import { useMemo, useState } from 'react';
import { orderLibrariesWithSelectedFirst } from '../lib/home-dataset-rail-order.mjs';

function normalizePermissionLevel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

export default function HomeDatasetRail({
  libraries = [],
  totalDocuments = 0,
  selectedKeys = [],
  onToggleLibrary,
  onClearSelection,
  onCreateLibrary,
  creating = false,
  showClearChip = true,
  clearChipLabel,
  clearChipActive = false,
  createPlaceholder = '新建数据集',
  createButtonLabel = '增加分组',
  selectionSummaryLabel,
}) {
  const [draft, setDraft] = useState('');
  const selectedSet = new Set(selectedKeys);
  const orderedLibraries = useMemo(
    () => orderLibrariesWithSelectedFirst(libraries, selectedKeys),
    [libraries, selectedKeys],
  );

  async function handleCreate(event) {
    event.preventDefault();
    const name = draft.trim();
    if (!name || creating) return;
    const created = await onCreateLibrary?.(name);
    if (created !== false) {
      setDraft('');
    }
  }

  return (
    <aside className="card home-dataset-rail">
      <form className="home-dataset-create" onSubmit={(event) => { void handleCreate(event); }}>
        <input
          className="filter-input home-dataset-create-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={createPlaceholder}
          disabled={creating}
        />
        <button className="ghost-btn compact-inline-btn" type="submit" disabled={creating || !draft.trim()}>
          {creating ? '创建中...' : createButtonLabel}
        </button>
      </form>

      <div className="home-dataset-rail-summary">
        {showClearChip ? (
          <button
            type="button"
            className={`source-chip home-dataset-summary-chip ${clearChipActive ? 'active' : ''}`.trim()}
            onClick={onClearSelection}
          >
            {clearChipLabel || `全部文档 ${totalDocuments}`}
          </button>
        ) : null}
        <span className="source-chip">{selectionSummaryLabel || `已选 ${selectedKeys.length}`}</span>
      </div>

      <div className="home-dataset-rail-list">
        {orderedLibraries.map((library) => {
          const active = selectedSet.has(library.key);
          return (
            <button
              key={library.key}
              type="button"
              className={`workbench-tab home-dataset-rail-item ${active ? 'active' : ''}`.trim()}
              onClick={() => onToggleLibrary?.(library.key)}
            >
              <span className="home-dataset-rail-accent" aria-hidden="true" />
              <span className="home-dataset-rail-item-label">{library.label || library.name || library.key}</span>
              <span className="library-permission-pill">L{normalizePermissionLevel(library.permissionLevel)}</span>
              <span className="library-tab-count">{Number(library.documentCount || 0)}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
