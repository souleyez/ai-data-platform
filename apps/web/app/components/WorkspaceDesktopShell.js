'use client';

import { useMemo } from 'react';
import FullIntelligenceModeButton from './FullIntelligenceModeButton';
import HomeDatasetRail from './HomeDatasetRail';
import HomeWorkspaceToolbar from './HomeWorkspaceToolbar';

function sortLibrariesForRail(libraries = []) {
  function getAuditScore(library) {
    return Number(
      library?.auditQualityScore
      ?? library?.qualityScore
      ?? library?.referenceCount
      ?? library?.citationCount
      ?? ((Number(library?.answerReferenceCount || 0) * 2) + Number(library?.reportReferenceCount || 0))
      ?? 0,
    ) || 0;
  }

  return [...libraries].sort((a, b) => {
    const auditDiff = getAuditScore(b) - getAuditScore(a);
    if (auditDiff !== 0) return auditDiff;
    const countDiff = Number(b?.documentCount || 0) - Number(a?.documentCount || 0);
    if (countDiff !== 0) return countDiff;
    return String(a?.label || a?.name || a?.key || '').localeCompare(
      String(b?.label || b?.name || b?.key || ''),
      'zh-CN',
    );
  });
}

export default function WorkspaceDesktopShell({
  currentPath,
  sourceItems = [],
  libraries = [],
  totalDocuments = 0,
  selectedKeys = [],
  unlockedKeys = [],
  onToggleLibrary,
  onRequestUnlock,
  onClearSelection,
  onCreateLibrary,
  creating = false,
  railShowClearChip = true,
  railClearChipLabel,
  railSelectionSummaryLabel,
  railCreatePlaceholder = '新建数据集',
  railCreateButtonLabel = '增加分组',
  fullIntelligenceSlot = null,
  children,
}) {
  const orderedLibraries = useMemo(() => sortLibrariesForRail(libraries), [libraries]);

  return (
    <div className="home-shell">
      <main className="home-main-panel">
        <HomeWorkspaceToolbar
          currentPath={currentPath}
          sourceItems={sourceItems}
          fullIntelligenceSlot={
            fullIntelligenceSlot ?? (
              <FullIntelligenceModeButton compact showSystemConstraints={false} />
            )
          }
        />

        <section className="workspace-desktop-grid">
          <HomeDatasetRail
            libraries={orderedLibraries}
            totalDocuments={totalDocuments}
            selectedKeys={selectedKeys}
            unlockedKeys={unlockedKeys}
            onToggleLibrary={onToggleLibrary}
            onRequestUnlock={onRequestUnlock}
            onClearSelection={onClearSelection}
            onCreateLibrary={onCreateLibrary}
            creating={creating}
            showClearChip={railShowClearChip}
            clearChipLabel={railClearChipLabel}
            selectionSummaryLabel={railSelectionSummaryLabel}
            createPlaceholder={railCreatePlaceholder}
            createButtonLabel={railCreateButtonLabel}
          />

          <section className="workspace-main-stage">
            {children}
          </section>
        </section>
      </main>
    </div>
  );
}
