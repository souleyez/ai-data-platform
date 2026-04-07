import {
  buildRunResultItems,
  buildTelemetryItems,
  DatasourceTag,
  formatDateTime,
  formatDurationMs,
  RUN_STATUS_LABELS,
} from './datasource-page-support';

export default function DatasourceRunCard({ run }) {
  const telemetryItems = buildTelemetryItems(run);
  const resultItems = buildRunResultItems(run);
  const stability = run.stability || null;

  return (
    <article className="datasource-run-card">
      <div className="datasource-run-head">
        <strong>{run.datasourceName || run.datasourceId}</strong>
        <DatasourceTag tone={run.status === 'success' ? 'success-tag' : run.status === 'failed' ? 'danger-tag' : 'neutral-tag'}>
          {RUN_STATUS_LABELS[run.status] || run.status}
        </DatasourceTag>
      </div>
      <div className="datasource-managed-meta">
        <span>开始：{formatDateTime(run.startedAt)}</span>
        <span>结束：{formatDateTime(run.finishedAt)}</span>
        <span>知识库：{(run.libraryLabels || []).join('、') || '未绑定'}</span>
      </div>
      <div className="datasource-managed-meta">
        <span>发现 {run.discoveredCount || 0}</span>
        <span>采集 {run.capturedCount || 0}</span>
        <span>入库 {run.ingestedCount || 0}</span>
        <span>耗时 {formatDurationMs(run.durationMs)}</span>
      </div>
      {telemetryItems.length ? (
        <div className="datasource-managed-meta">
          {telemetryItems.map((telemetry) => (
            <span key={`${run.id}-${telemetry.key}`}>{telemetry.label} {telemetry.value}</span>
          ))}
        </div>
      ) : null}
      {stability?.badges?.length ? (
        <div className="datasource-managed-meta">
          {stability.badges.map((badge) => (
            <DatasourceTag key={`${run.id}-${badge.label}`} tone={badge.tone}>{badge.label}</DatasourceTag>
          ))}
        </div>
      ) : null}
      {stability?.note ? <div className="datasource-run-summary">{stability.note}</div> : null}
      {run.summary ? <div className="datasource-run-summary">{run.summary}</div> : null}
      {resultItems.length ? (
        <div className="capture-result-list">
          {resultItems.map((doc) => (
            <div key={doc.id} className="capture-result-item">
              <strong>{doc.label}</strong>
              {doc.summary ? <p>{doc.summary}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
      {run.errorMessage ? <div className="datasource-run-error">{run.errorMessage}</div> : null}
    </article>
  );
}
