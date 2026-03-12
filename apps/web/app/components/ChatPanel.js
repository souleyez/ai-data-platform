import { QUICK_ACTIONS } from '../lib/types';

export default function ChatPanel({
  messages,
  input,
  isLoading,
  onInputChange,
  onSubmit,
  onQuickAction,
}) {
  return (
    <div className="chat-panel card">
      <div className="panel-header">
        <div>
          <h3>对话中心</h3>
          <p>支持企业经营问答、合同归纳、技术文档总结、订单分析</p>
        </div>
        <span className="badge">只读分析</span>
      </div>

      <div className="chat-messages">
        {messages.map((message, index) => (
          <div className={`message ${message.role}`} key={`${message.role}-${index}`}>
            {message.role === 'assistant' && <div className="avatar">AI</div>}
            <div className={`bubble ${message.role === 'user' ? 'user-bubble' : ''}`}>
              {message.title ? <strong>{message.title}</strong> : null}
              <p>{message.content}</p>
              {message.meta ? <div className="message-meta">{message.meta}</div> : null}
            </div>
            {message.role === 'user' && <div className="avatar user-avatar">U</div>}
          </div>
        ))}

        {isLoading ? (
          <div className="message assistant">
            <div className="avatar">AI</div>
            <div className="bubble loading-bubble">
              <span className="loading-dot"></span>
              <span className="loading-dot"></span>
              <span className="loading-dot"></span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="quick-actions">
        {QUICK_ACTIONS.map((item) => (
          <button key={item.label} onClick={() => onQuickAction(item.prompt)}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="chat-input-row">
        <textarea
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder="输入问题，例如：最近30天哪些客户订单下滑最明显？"
        />
        <button className="primary-btn send-btn" onClick={() => onSubmit(input)} disabled={isLoading}>
          {isLoading ? '分析中' : '发送'}
        </button>
      </div>
    </div>
  );
}
