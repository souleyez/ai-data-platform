import {
  buildFormFromDefinition,
  buildTelemetryItems,
  formatRelative,
  KIND_LABELS,
  SCHEDULE_LABELS,
  STATUS_LABELS,
} from './datasource-page-support';

export default function DatasourceManagedCard({
  item,
  definition,
  busyId,
  onEdit,
  onCopyPublicPath,
  onManagedAction,
}) {
  const runtime = item.runtime || item;
  const telemetryItems = buildTelemetryItems(runtime);

  return (
    <article className="datasource-managed-card">
      <div className="datasource-managed-head">
        <div className="datasource-managed-info">
          <strong>{item.name}</strong>
          <div className="datasource-managed-meta">
            <span>{KIND_LABELS[item.kind] || item.kind}</span>
            <span>{STATUS_LABELS[item.status] || item.status}</span>
            <span>{item.scheduleLabel || SCHEDULE_LABELS[item.schedule?.kind] || '手动'}</span>
          </div>
          <div className="datasource-managed-meta">
            <span>知识库：{(item.targetLibraries || []).map((entry) => entry.label).join('、') || '未绑定'}</span>
            <span>最近：{formatRelative(runtime.lastRunAt || item.lastRunAt)}</span>
          </div>
          {telemetryItems.length ? (
            <div className="datasource-managed-meta">
              {telemetryItems.map((telemetry) => (
                <span key={`${item.id}-${telemetry.key}`}>{telemetry.label} {telemetry.value}</span>
              ))}
            </div>
          ) : null}
          {runtime.lastSummary || item.lastSummary ? <p>{runtime.lastSummary || item.lastSummary}</p> : null}
        </div>
        <div className="datasource-managed-actions">
          <button className="ghost-btn" type="button" onClick={() => onEdit(buildFormFromDefinition(definition || item))}>编辑</button>
          {item.publicPath ? (
            <button className="ghost-btn" type="button" onClick={() => onCopyPublicPath(item)}>复制外链</button>
          ) : (
            <button className="ghost-btn" type="button" disabled={busyId === `${item.id}:run`} onClick={() => onManagedAction(item, 'run')}>立即采集</button>
          )}
          {item.status === 'active' ? (
            <button className="ghost-btn" type="button" disabled={busyId === `${item.id}:pause`} onClick={() => onManagedAction(item, 'pause')}>暂停</button>
          ) : (
            <button className="ghost-btn" type="button" disabled={busyId === `${item.id}:activate`} onClick={() => onManagedAction(item, 'activate')}>启用</button>
          )}
          <button className="ghost-btn" type="button" disabled={busyId === `${item.id}:delete`} onClick={() => onManagedAction(item, 'delete')}>删除</button>
        </div>
      </div>
    </article>
  );
}
