import {
  buildFormFromDefinition,
  buildTelemetryItems,
  DatasourceTag,
  formatDurationMs,
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
  const stability = item.stability || null;
  const accessState = item.accessState || null;

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
          {stability?.badges?.length ? (
            <div className="datasource-managed-meta">
              {stability.badges.map((badge) => (
                <DatasourceTag key={`${item.id}-${badge.label}`} tone={badge.tone}>{badge.label}</DatasourceTag>
              ))}
              {stability.latestDurationMs ? <span>最近耗时：{formatDurationMs(stability.latestDurationMs)}</span> : null}
            </div>
          ) : null}
          {accessState?.supportsSessionReuse ? (
            <div className="datasource-managed-meta">
              <DatasourceTag tone={accessState.hasStoredSession ? 'success-tag' : 'neutral-tag'}>
                {accessState.hasStoredSession ? '已缓存会话' : '未缓存会话'}
              </DatasourceTag>
              {accessState.maskedUsername ? <span>账号：{accessState.maskedUsername}</span> : null}
              {accessState.sessionUpdatedAt ? <span>会话更新时间：{formatRelative(accessState.sessionUpdatedAt)}</span> : null}
            </div>
          ) : null}
          {stability?.note ? <p>{stability.note}</p> : null}
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
          {accessState?.supportsSessionReuse ? (
            <button className="ghost-btn" type="button" disabled={busyId === `${item.id}:clearSession`} onClick={() => onManagedAction(item, 'clearSession')}>清除会话</button>
          ) : null}
          {accessState?.canForceRelogin ? (
            <button className="ghost-btn" type="button" disabled={busyId === `${item.id}:forceRelogin`} onClick={() => onManagedAction(item, 'forceRelogin')}>强制重登</button>
          ) : null}
          <button className="ghost-btn" type="button" disabled={busyId === `${item.id}:delete`} onClick={() => onManagedAction(item, 'delete')}>删除</button>
        </div>
      </div>
    </article>
  );
}
