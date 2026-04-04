'use client';

const CHANNEL_LABELS = {
  web: 'Web',
  wecom: '企业微信',
  teams: 'Microsoft Teams',
  qq: 'QQ',
  feishu: '飞书',
};

function summarizeChannels(item) {
  const channels = Array.isArray(item?.channelBindings) ? item.channelBindings : [];
  return channels
    .filter((binding) => binding?.enabled)
    .map((binding) => CHANNEL_LABELS[binding.channel] || binding.channel)
    .join(' / ');
}

export default function BotSelector({
  items = [],
  value = '',
  onChange,
  loading = false,
}) {
  if (!items.length && !loading) return null;

  const current = items.find((item) => item?.id === value) || items.find((item) => item?.isDefault) || items[0] || null;
  const channelSummary = summarizeChannels(current);

  return (
    <div className="bot-selector-card">
      <label className="bot-selector-label" htmlFor="home-bot-selector">当前 Bot</label>
      <select
        id="home-bot-selector"
        className="filter-input bot-selector-input"
        value={current?.id || ''}
        onChange={(event) => onChange?.(event.target.value)}
        disabled={loading || !items.length}
      >
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      {current ? (
        <div className="bot-selector-meta">
          <strong>{current.name}</strong>
          {current.description ? <span>{current.description}</span> : null}
          {channelSummary ? <span>渠道：{channelSummary}</span> : null}
        </div>
      ) : (
        <div className="bot-selector-meta">
          <span>{loading ? '正在读取 Bot 列表...' : '当前没有可用 Bot。'}</span>
        </div>
      )}
    </div>
  );
}
