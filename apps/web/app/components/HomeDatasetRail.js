'use client';

import { useMemo, useState } from 'react';
import { orderLibrariesWithSelectedFirst } from '../lib/home-dataset-rail-order.mjs';

function normalizePermissionLevel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

function summarizeActiveGrant(grant) {
  const libraryKeys = Array.isArray(grant?.libraryKeys) ? grant.libraryKeys : [];
  if (!libraryKeys.length) return '当前活动密钥已启用';
  return `当前活动密钥已启用，已解锁 ${libraryKeys.length} 个数据集`;
}

export default function HomeDatasetRail({
  libraries = [],
  totalDocuments = 0,
  selectedKeys = [],
  unlockedKeys = [],
  datasetSecretState = null,
  onToggleLibrary,
  onClearSelection,
  onCreateLibrary,
  onRequestUnlock,
  creating = false,
  showClearChip = true,
  clearChipLabel,
  clearChipActive = false,
  createPlaceholder = '新建数据集',
  createButtonLabel = '增加分组',
  selectionSummaryLabel,
  createHintText = '',
}) {
  const [draft, setDraft] = useState('');
  const selectedSet = new Set(selectedKeys);
  const unlockedSet = new Set(unlockedKeys);
  const activeGrant = datasetSecretState?.activeGrant || null;
  const resolvedCreateHint = String(createHintText || '').trim() || (
    activeGrant
      ? `${summarizeActiveGrant(activeGrant)}，后续新建分组会自动沿用这把密钥。`
      : '当前未输入密钥，新建分组将是公共的，打开网页的用户都能查看和使用。'
  );
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
      <div className="home-dataset-create-hint">{resolvedCreateHint}</div>

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
          const locked = library?.secretProtected && !unlockedSet.has(library.key);
          return (
            <button
              key={library.key}
              type="button"
              className={`workbench-tab home-dataset-rail-item ${active ? 'active' : ''} ${locked ? 'is-locked' : ''}`.trim()}
              onClick={() => (locked ? onRequestUnlock?.(library) : onToggleLibrary?.(library.key))}
            >
              <span className="home-dataset-rail-accent" aria-hidden="true" />
              <span className="home-dataset-rail-item-label">{library.label || library.name || library.key}</span>
              {library?.secretProtected ? (
                <span className="library-permission-pill">{locked ? '需密钥' : '已解锁'}</span>
              ) : null}
              <span className="library-permission-pill">L{normalizePermissionLevel(library.permissionLevel)}</span>
              <span className="library-tab-count">{Number(library.documentCount || 0)}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
