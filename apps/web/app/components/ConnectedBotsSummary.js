'use client';

const CHANNEL_LABELS = {
  web: '工作台',
  wecom: '企业微信',
  teams: 'Microsoft Teams',
  qq: 'QQ',
  feishu: '飞书',
};

function isConfiguredBinding(binding) {
  if (!binding || binding.enabled === false) return false;
  if (binding.configured === true) return true;
  if (binding.channel === 'web') return true;
  return Boolean(binding.routeKey || binding.tenantId || binding.externalBotId);
}

function getConnectedBindings(item) {
  const bindings = Array.isArray(item?.channelBindings) ? item.channelBindings : [];
  return bindings.filter((binding) => binding?.channel !== 'web' && isConfiguredBinding(binding));
}

function summarizePrompt(item) {
  const prompt = String(item?.systemPromptSummary || item?.systemPrompt || '').trim();
  if (!prompt) return '未设置额外约束';
  return prompt.length > 88 ? `${prompt.slice(0, 88)}...` : prompt;
}

function formatBotChannels(item) {
  const labels = getConnectedBindings(item)
    .map((binding) => CHANNEL_LABELS[binding.channel] || binding.channel)
    .filter(Boolean);
  return labels.join(' / ');
}

function formatLibraryLabel(library) {
  return library?.label || library?.name || library?.key || '未命名文档库';
}

function summarizeVisibleLibraries(item, libraries = []) {
  const visibleLibraryKeys = Array.isArray(item?.visibleLibraryKeys) ? item.visibleLibraryKeys : [];
  if (!visibleLibraryKeys.length) return '未额外限定，按权限等级可见';
  const labels = visibleLibraryKeys
    .map((libraryKey) => (
      libraries.find((library) => library?.key === libraryKey) || { key: libraryKey }
    ))
    .map(formatLibraryLabel);
  if (labels.length <= 3) return labels.join(' / ');
  return `${labels.slice(0, 3).join(' / ')} 等 ${labels.length} 个库`;
}

function summarizeExternalDirectorySources(item) {
  const sources = Array.isArray(item?.externalDirectorySources) ? item.externalDirectorySources : [];
  if (!sources.length) return '未启用外部用户映射';
  const active = sources.filter((source) => source?.enabled !== false);
  if (!active.length) return '外部用户映射已配置但未启用';
  const labels = active.map((source) => {
    const status = source?.syncStatus?.status || 'idle';
    const statusLabel = status === 'success'
      ? '最近同步成功'
      : (status === 'error' ? '最近同步失败' : '未同步');
    return `${source.id} · ${statusLabel}`;
  });
  if (labels.length <= 2) return labels.join(' / ');
  return `${labels.slice(0, 2).join(' / ')} 等 ${labels.length} 个映射`;
}

function formatIntelligenceMode(item) {
  return String(item?.intelligenceMode || '').trim().toLowerCase() === 'full'
    ? '全智能'
    : '普通一问一答';
}

export function filterConnectedBots(items = []) {
  return (Array.isArray(items) ? items : []).filter((item) => (
    item?.enabled !== false && getConnectedBindings(item).length > 0
  ));
}

export default function ConnectedBotsSummary({
  items = [],
  libraries = [],
  emptyTitle = '还没有已连接机器人',
  emptyText = '先在全智能模式中通过对话接入企业微信、Teams、QQ 或飞书机器人，接通后这里会自动显示。',
  compact = false,
}) {
  const connectedBots = filterConnectedBots(items);

  if (!connectedBots.length) {
    return (
      <section className="report-empty-card bot-summary-empty">
        <h4>{emptyTitle}</h4>
        <p>{emptyText}</p>
      </section>
    );
  }

  return (
    <div className={`connected-bot-list ${compact ? 'connected-bot-list-compact' : ''}`}>
      {connectedBots.map((item) => {
        const channels = formatBotChannels(item);
        const accessLevel = Number.isFinite(Number(item?.libraryAccessLevel))
          ? Math.max(0, Math.floor(Number(item.libraryAccessLevel)))
          : 0;

        return (
          <article key={item.id} className="connected-bot-card">
            <div className="connected-bot-head">
              <div>
                <strong>{item.name || item.id}</strong>
                <div className="connected-bot-meta">
                  {channels || '未识别外部渠道'}
                  {item?.isDefault ? ' · 默认机器人' : ''}
                </div>
              </div>
              <span className="library-permission-pill library-permission-pill-strong">
                L{accessLevel}+
              </span>
            </div>
            {item?.description ? <p className="connected-bot-description">{item.description}</p> : null}
            <div className="connected-bot-guidance">
              <span>智能模式</span>
              <strong>{formatIntelligenceMode(item)}</strong>
            </div>
            <div className="connected-bot-guidance">
              <span>自然语言约束</span>
              <strong>{summarizePrompt(item)}</strong>
            </div>
            <div className="connected-bot-guidance">
              <span>指定文档库权限</span>
              <strong>{summarizeVisibleLibraries(item, libraries)}</strong>
            </div>
            <div className="connected-bot-guidance">
              <span>外部用户映射</span>
              <strong>{summarizeExternalDirectorySources(item)}</strong>
            </div>
          </article>
        );
      })}
    </div>
  );
}
