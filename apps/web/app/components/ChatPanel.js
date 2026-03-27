'use client';

import { useEffect, useRef, useState } from 'react';
import IngestFeedback from './IngestFeedback';
import { formatOrchestrationLabel, formatSourceLabel } from '../lib/types';

function sanitizeReadableText(content) {
  return String(content || '')
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, '').trim())
    .replace(/^[ \t]*[#*|]{1,}[ \t]*/gm, '')
    .replace(/[ \t]*\|[ \t]*/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderParagraphs(content) {
  return sanitizeReadableText(content)
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => <p key={`paragraph-${index}`}>{part}</p>);
}

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
              {(table.columns || []).map((column) => <th key={column}>{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {(table.rows || []).map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {row.map((cell, cellIndex) => <td key={`cell-${rowIndex}-${cellIndex}`}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CredentialRequestCard({ request, onSubmit, disabled }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!username.trim() || !password) return;
        onSubmit?.({ username: username.trim(), password, remember });
        setPassword('');
      }}
      style={{
        marginTop: 12,
        padding: '12px 14px',
        borderRadius: 14,
        border: '1px solid rgba(37,99,235,0.18)',
        background: 'rgba(239,246,255,0.72)',
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 700 }}>安全登录采集</div>
      <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
        站点：{request.origin || request.url}
        <br />
        账号密码不会写入聊天记录，只用于这次登录采集。
      </div>
      <input
        className="filter-input"
        placeholder="登录账号"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        disabled={disabled}
      />
      <input
        className="filter-input"
        placeholder="登录密码"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={disabled}
      />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569' }}>
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
          disabled={disabled}
        />
        记住该站点账号密码
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="primary-btn" type="submit" disabled={disabled || !username.trim() || !password}>
          {disabled ? '提交中...' : '提交登录信息'}
        </button>
        {request.maskedUsername ? <span className="message-meta">已保存账号：{request.maskedUsername}</span> : null}
      </div>
    </form>
  );
}

export default function ChatPanel({
  messages,
  input,
  isLoading,
  onInputChange,
  onSubmit,
  uploadInputRef,
  uploadLoading,
  onUploadFilesSelected,
  availableLibraries,
  selectedManualLibraries,
  onChangeManualLibrary,
  onAcceptGroupSuggestion,
  onAssignLibrary,
  groupSaving,
  onSubmitCredential,
}) {
  const messagesRef = useRef(null);

  useEffect(() => {
    const node = messagesRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="chat-panel card">
      <div className="chat-messages" ref={messagesRef}>
        {messages.map((message, index) => (
          <div className={`message ${message.role}`} key={message.id || `${message.role}-${index}`}>
            {message.role === 'assistant' && <div className="avatar">AI</div>}
            <div className={`bubble ${message.role === 'user' ? 'user-bubble' : ''}`}>
              {message.title ? <strong>{message.title}</strong> : null}
              <div className="message-content-block">{renderParagraphs(message.content)}</div>
              {message.table ? <FormulaTable table={message.table} /> : null}

              {message.credentialRequest ? (
                <CredentialRequestCard
                  request={message.credentialRequest}
                  onSubmit={(credentials) => onSubmitCredential?.(message.id, credentials)}
                  disabled={isLoading}
                />
              ) : null}

              {message.ingestFeedback ? (
                <IngestFeedback
                  feedback={message.ingestFeedback}
                  availableLibraries={availableLibraries}
                  selectedManualLibraries={selectedManualLibraries}
                  onChangeManualLibrary={onChangeManualLibrary}
                  onAcceptGroupSuggestion={onAcceptGroupSuggestion}
                  onAssignLibrary={onAssignLibrary}
                  groupSaving={groupSaving}
                  fallbackLink
                />
              ) : null}

              {message.meta ? <div className="message-meta">{message.meta}</div> : null}

              {message.references?.length ? (
                <div className="message-ref-block">
                  <div className="message-ref-title">引用文档</div>
                  <div className="message-refs">
                    {message.references.map((ref) => (
                      <a key={ref.id} href={`/documents/${ref.id}`} className="ref-chip">{ref.name}</a>
                    ))}
                  </div>
                </div>
              ) : null}

              {message.sources?.length ? (
                <div className="message-extra-block">
                  <div className="message-ref-title">数据来源</div>
                  <div className="message-refs">
                    {message.sources.map((source, sourceIndex) => (
                      <span key={`${formatSourceLabel(source)}-${sourceIndex}`} className="source-chip">
                        {formatSourceLabel(source)}
                      </span>
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
        <div className="chat-composer-actions">
          <input
            ref={uploadInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(event) => onUploadFilesSelected(Array.from(event.target.files || []))}
          />
          <button
            type="button"
            className="ghost-btn upload-inline-btn"
            onClick={() => {
              if (!uploadLoading && uploadInputRef.current) {
                uploadInputRef.current.value = '';
                uploadInputRef.current.click();
              }
            }}
            disabled={uploadLoading}
          >
            {uploadLoading ? '上传解析中...' : '上传文件'}
          </button>
        </div>

        <div className="chat-input-row">
          <textarea
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (!isLoading) onSubmit(input);
              }
            }}
            placeholder="输入问题。系统会先正常问答；当你明确要求基于库内文件产出结果时，会自动补充必要信息后再按库输出。"
          />
          <button className="primary-btn send-btn" onClick={() => onSubmit(input)} disabled={isLoading}>
            {isLoading ? '思考中...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
}
