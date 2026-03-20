import { useEffect, useRef } from 'react';
import { QUICK_ACTIONS, formatOrchestrationLabel, formatSourceLabel } from '../lib/types';

function FormulaTable({ table }) {
  if (!table) return null;

  return (
    <div className="formula-table-wrap">
      <div className="formula-table-head">
        <strong>{table.title}</strong>
        {table.subtitle ? <div className="formula-table-subtitle">{table.subtitle}</div> : null}
      </div>

      <div className="formula-table-scroll">
        <table className="formula-table">
          <thead>
            <tr>
              {table.columns?.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows?.map((row, rowIndex) => (
              <tr key={`${table.title}-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {table.notes?.length ? (
        <div className="formula-table-notes">
          {table.notes.map((note, index) => (
            <div key={`${table.title}-note-${index}`}>{index + 1}. {note}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function ChatPanel({
  messages,
  input,
  isLoading,
  onInputChange,
  onSubmit,
  onQuickAction,
}) {
  const messagesRef = useRef(null);

  useEffect(() => {
    const node = messagesRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="chat-panel card">
      <div className="panel-header">
        <div>
          <h3>对话中心</h3>
          <p>支持企业经营问答、合同归纳、技术文档总结、订单分析</p>
        </div>
        <span className="badge">只读分析</span>
      </div>

      <div className="chat-messages" ref={messagesRef}>
        {messages.map((message, index) => (
          <div className={`message ${message.role}`} key={`${message.role}-${index}`}>
            {message.role === 'assistant' && <div className="avatar">AI</div>}
            <div className={`bubble ${message.role === 'user' ? 'user-bubble' : ''}`}>
              {message.title ? <strong>{message.title}</strong> : null}
              <p>{message.content}</p>
              {message.table ? <FormulaTable table={message.table} /> : null}
              {message.meta ? <div className="message-meta">{message.meta}</div> : null}
              {message.references?.length ? (
                <div className="message-ref-block">
                  <div className="message-ref-title">引用文档</div>
                  <div className="message-refs">
                    {message.references.map((ref) => (
                      <a key={ref.id} href={`/documents/${ref.id}`} className="ref-chip">{ref.name}</a>
                    ))}
                  </div>
                  <div className="message-ref-list">
                    {message.references.map((ref) => (
                      <div key={`${ref.id}-summary`} className="message-ref-item">
                        <strong>{ref.name}</strong>
                        <span>{ref.summary}</span>
                        <em>
                          {ref.category === 'contract'
                            ? `合同风险：${ref.riskLevel || 'unknown'}`
                            : ref.category === 'technical'
                              ? `技术主题：${(ref.topicTags || []).join('、') || '未识别'}`
                              : ref.category}
                        </em>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {message.sources?.length ? (
                <div className="message-extra-block">
                  <div className="message-ref-title">数据来源</div>
                  <div className="message-refs">
                    {message.sources.map((source, index) => (
                      <span key={`${formatSourceLabel(source)}-${index}`} className="source-chip">{formatSourceLabel(source)}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {message.orchestration ? (
                <div className="message-extra-block">
                  <div className="message-ref-title">分析状态</div>
                  <div className="orchestration-chip">{formatOrchestrationLabel(message.orchestration)}</div>
                </div>
              ) : null}
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

      <div className="chat-composer-wrap">
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
    </div>
  );
}
