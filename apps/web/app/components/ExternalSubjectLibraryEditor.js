'use client';

import { useEffect, useMemo, useState } from 'react';

function toggleListValue(values, value) {
  const next = new Set(Array.isArray(values) ? values : []);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return [...next];
}

function formatLibraryLabel(library) {
  const label = library?.label || library?.name || library?.key || '未命名文档库';
  const permissionLevel = Number.isFinite(Number(library?.permissionLevel))
    ? Math.max(0, Math.floor(Number(library.permissionLevel)))
    : 0;
  return `${label} · L${permissionLevel}`;
}

export default function ExternalSubjectLibraryEditor({
  subject,
  preview,
  libraries = [],
  manageEnabled = false,
  saving = false,
  onSave,
}) {
  const [visibleLibraryKeys, setVisibleLibraryKeys] = useState([]);
  const sortedLibraries = useMemo(
    () => [...libraries].sort((a, b) => String(a?.label || a?.key || '').localeCompare(String(b?.label || b?.key || ''), 'zh-CN')),
    [libraries],
  );

  useEffect(() => {
    setVisibleLibraryKeys(Array.isArray(subject?.visibleLibraryKeys) ? subject.visibleLibraryKeys : []);
  }, [subject]);

  if (!subject) {
    return (
      <div className="bot-config-subtle">
        先在左侧搜索并选择一个外部用户或用户组，再配置它可见的文档库。
      </div>
    );
  }

  return (
    <div className="connected-bot-editor-card">
      <div className="connected-bot-head">
        <div>
          <strong>{subject.name || subject.subjectId}</strong>
          <div className="connected-bot-meta">
            {subject.subjectType === 'group' ? '用户组' : '用户'} · {subject.subjectId}
          </div>
        </div>
        <button
          type="button"
          className="primary-btn"
          disabled={!manageEnabled || saving}
          onClick={() => onSave?.(visibleLibraryKeys)}
        >
          {saving ? '保存中...' : '保存权限'}
        </button>
      </div>

      <div className="bot-config-subtle">
        当前直接授权：{visibleLibraryKeys.length ? visibleLibraryKeys.join(' / ') : '未直接授权'}
      </div>
      <div className="bot-config-subtle">
        当前最终生效：{Array.isArray(preview?.effectiveVisibleLibraryKeys) && preview.effectiveVisibleLibraryKeys.length
          ? preview.effectiveVisibleLibraryKeys.join(' / ')
          : (preview?.isDenied ? `拒绝访问（${preview.denyReason || 'no_assignment'}）` : '未计算')}
      </div>

      {subject.subjectType === 'user' && Array.isArray(subject.groups) && subject.groups.length ? (
        <div className="bot-config-subtle">
          所属用户组：{subject.groups.map((item) => item.name || item.id).join(' / ')}
        </div>
      ) : null}
      {subject.subjectType === 'group' && Array.isArray(subject.members) && subject.members.length ? (
        <div className="bot-config-subtle">
          成员：{subject.members.map((item) => item.name || item.id).join(' / ')}
        </div>
      ) : null}

      <div className="bot-chip-group">
        <div className="bot-chip-group-title">可见文档库</div>
        <div className="bot-chip-grid">
          {sortedLibraries.map((library) => {
            const active = visibleLibraryKeys.includes(library.key);
            return (
              <label key={library.key} className={`bot-chip ${active ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={active}
                  disabled={!manageEnabled}
                  onChange={() => setVisibleLibraryKeys((prev) => toggleListValue(prev, library.key))}
                />
                <span>{formatLibraryLabel(library)}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
