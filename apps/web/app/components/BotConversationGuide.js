'use client';

import ConnectedBotsSummary from './ConnectedBotsSummary';

function formatLibraryLevelList(libraries = []) {
  if (!Array.isArray(libraries) || !libraries.length) return '当前还没有可见知识库。';
  return libraries
    .map((library) => {
      const label = library?.label || library?.name || library?.key || '未命名知识库';
      const level = Number.isFinite(Number(library?.permissionLevel))
        ? Math.max(0, Math.floor(Number(library.permissionLevel)))
        : 0;
      return `${label} = L${level}`;
    })
    .join('，');
}

export default function BotConversationGuide({
  items = [],
  libraries = [],
  manageEnabled = false,
}) {
  return (
    <div className="bot-conversation-guide">
      <div className="bot-conversation-guide-card">
        <strong>机器人接入改为对话式配置</strong>
        <p>
          在全智能模式下，直接通过对话告诉智能助手你要接入哪个渠道、机器人名称、文档权限等级和约束要求。
          不再要求你手动填表。
        </p>
      </div>

      <div className="bot-conversation-guide-card">
        <strong>建议你这样说</strong>
        <ul className="bot-conversation-guide-list">
          <li>帮我接一个企业微信机器人，命名为销售助理，只能看 L1 及以上知识库。</li>
          <li>给 Teams 机器人增加约束：回答更简洁，优先引用合同库。</li>
          <li>把飞书机器人权限改成 2，并且不要查看未分组文档。</li>
        </ul>
      </div>

      <div className="bot-conversation-guide-card">
        <strong>当前知识库权限等级</strong>
        <p>{formatLibraryLevelList(libraries)}</p>
      </div>

      <div className="bot-conversation-guide-card">
        <strong>当前已连接机器人</strong>
        <ConnectedBotsSummary
          items={items}
          compact
          emptyTitle="还没有已连接的第三方机器人"
          emptyText={manageEnabled
            ? '直接在对话里提出接入需求，智能助手会按渠道、权限等级和约束逐步引导你。'
            : '先用全智能模式密钥解锁，再通过对话接入新的机器人。'}
        />
      </div>
    </div>
  );
}
