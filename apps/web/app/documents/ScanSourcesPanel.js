'use client';

function renderExtensions(sampleExtensions) {
  if (!Array.isArray(sampleExtensions) || !sampleExtensions.length) return null;
  return <span>文档类型 {sampleExtensions.join(' / ')}</span>;
}

function renderHotspotHint(candidate) {
  if (candidate.hotspot || !Array.isArray(candidate.hotspots) || !candidate.hotspots.length) return null;
  const names = candidate.hotspots.slice(0, 3).map((item) => item.label).filter(Boolean);
  if (!names.length) return null;
  return (
    <span>热点目录 {names.join(' / ')}{candidate.hotspots.length > names.length ? ' +' : ''}</span>
  );
}

function renderDiscoverySourceChip(candidate) {
  if (candidate.hotspot) {
    return <span className="source-chip" style={{ background: '#fff7ed', color: '#c2410c' }}>热点子目录</span>;
  }
  if (candidate.discoverySource === 'openclaw') {
    return <span className="source-chip" style={{ background: '#eef2ff', color: '#4338ca' }}>OpenClaw 推荐</span>;
  }
  if (candidate.discoverySource === 'manual') {
    return <span className="source-chip" style={{ background: '#f1f5f9', color: '#475569' }}>手动指定</span>;
  }
  if (candidate.discoverySource === 'existing') {
    return <span className="source-chip" style={{ background: '#ecfeff', color: '#0f766e' }}>已加入</span>;
  }
  return <span className="source-chip" style={{ background: '#f8fafc', color: '#475569' }}>系统兜底</span>;
}

function renderDiscoveryExplanation(candidate) {
  const explanation = String(candidate.discoveryExplanation || '').trim();
  if (!explanation) return null;
  return (
    <div style={{ color: '#475569', fontSize: 12, lineHeight: 1.55 }}>
      {explanation}
    </div>
  );
}

export default function ScanSourcesPanel({
  expanded,
  onToggleExpanded,
  candidateSourceLoading,
  candidateSourceSubmitting,
  selectedCandidatePaths,
  onLoadCandidateSources,
  onImportCandidateSources,
  scanRootDraft,
  onScanRootDraftChange,
  onAddScanSource,
  scanSourceSubmitting,
  directoryOptions,
  data,
  scanSources,
  onToggleCandidatePath,
  formatLocalTime,
  onSetPrimaryScanSource,
  onRemoveScanSource,
}) {
  return (
    <section className="card documents-card">
      <div className="panel-header">
        <div>
          <h3>扫描源</h3>
          <p>发现本机候选目录，勾选后加入扫描源并直接扫描入库。</p>
        </div>
        <button className="ghost-btn" type="button" onClick={onToggleExpanded}>
          {expanded ? '收起扫描源' : '展开扫描源'}
        </button>
      </div>

      {expanded ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <strong>本机候选目录发现</strong>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>
                优先通过 OpenClaw 发现更像文档仓库的本机目录，尤其是微信、企业微信、QQ、飞书、钉钉等常见 IM 存储位置，再由项目侧补上真实文件统计、文档类型和热点子目录。
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="ghost-btn" onClick={onLoadCandidateSources} disabled={candidateSourceLoading}>
                {candidateSourceLoading ? '发现中...' : '发现本机候选目录'}
              </button>
              <button className="primary-btn" onClick={onImportCandidateSources} disabled={candidateSourceSubmitting || !selectedCandidatePaths.length}>
                {candidateSourceSubmitting ? '导入中...' : `加入扫描源并扫描 (${selectedCandidatePaths.length})`}
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gap: 8,
              padding: 12,
              borderRadius: 12,
              border: scanRootDraft.trim() ? '1px solid #0f766e' : '1px solid #e2e8f0',
              background: scanRootDraft.trim() ? '#f0fdfa' : '#ffffff',
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>手动指定目录</strong>
              <span style={{ color: '#475569', fontSize: 13 }}>输入本地目录后加入同一批扫描列表</span>
            </div>
            <input
              className="filter-input"
              value={scanRootDraft}
              onChange={(event) => onScanRootDraftChange(event.target.value)}
              placeholder="例如：C:\\docs\\papers"
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="ghost-btn" onClick={onAddScanSource} disabled={scanSourceSubmitting || !scanRootDraft.trim()}>
                {scanSourceSubmitting ? '处理中...' : '加入目录列表'}
              </button>
            </div>
          </div>

          {directoryOptions.length ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {directoryOptions.map((candidate) => (
                <label
                  key={candidate.path}
                  style={{
                    display: 'grid',
                    gap: 6,
                    padding: 12,
                    borderRadius: 12,
                    border: selectedCandidatePaths.includes(candidate.path) ? '1px solid #0f766e' : '1px solid #e2e8f0',
                    background: selectedCandidatePaths.includes(candidate.path) ? '#f0fdfa' : '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input type="checkbox" checked={selectedCandidatePaths.includes(candidate.path)} onChange={() => onToggleCandidatePath(candidate.path)} />
                    <strong>{candidate.label}</strong>
                    <span style={{ color: '#475569', fontSize: 13 }}>{candidate.reason}</span>
                    {renderDiscoverySourceChip(candidate)}
                    {candidate.alreadyAdded && !candidate.hotspot ? <span className="source-chip" style={{ background: '#ecfeff', color: '#0f766e' }}>已加入</span> : null}
                    {candidate.path === data?.scanRoot ? <span className="source-chip" style={{ background: '#eff6ff', color: '#1d4ed8' }}>主目录</span> : null}
                  </div>
                  <div style={{ color: '#0f172a', fontSize: 13, wordBreak: 'break-all' }}>{candidate.path}</div>
                  {renderDiscoveryExplanation(candidate)}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', color: '#64748b', fontSize: 12 }}>
                    <span>预计文件 {candidate.pendingScan ? '待扫描' : `${candidate.fileCount}${candidate.truncated ? '+' : ''}`}</span>
                    <span>最近更新 {formatLocalTime(candidate.latestModifiedAt)}</span>
                    {renderExtensions(candidate.sampleExtensions)}
                    {renderHotspotHint(candidate)}
                    {candidate.path !== data?.scanRoot && candidate.alreadyAdded ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          onSetPrimaryScanSource(candidate.path);
                        }}
                        style={{ border: 'none', background: 'transparent', color: '#475569', cursor: 'pointer', padding: 0 }}
                      >
                        设为主目录
                      </button>
                    ) : null}
                    {candidate.alreadyAdded && scanSources.length > 1 ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          onRemoveScanSource(candidate.path);
                        }}
                        style={{ border: 'none', background: 'transparent', color: '#475569', cursor: 'pointer', padding: 0 }}
                      >
                        移除
                      </button>
                    ) : null}
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <div style={{ color: '#64748b', fontSize: 13 }}>先点击“发现本机候选目录”获取可勾选的本地目录列表。</div>
          )}
        </div>
      ) : null}
    </section>
  );
}
