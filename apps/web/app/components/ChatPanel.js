'use client';

import { useEffect, useRef, useState } from 'react';
import IngestFeedback from './IngestFeedback';
import {
  buildOrchestrationDebugChips,
  buildOrchestrationDebugDetails,
  formatSourceLabel,
} from '../lib/types';

function sanitizeReadableText(content) {
  return String(content || '')
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, '').trim())
    .replace(/^[ \t]*[#*|]{1,}[ \t]*/gm, '')
    .replace(/[ \t]*\|[ \t]*/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const HIGHLIGHT_PATTERN = /《[^》\n]{1,40}》|“[^”\n]{1,40}”|"[^"\n]{1,40}"|【[^】\n]{1,40}】|\b\d+(?:\.\d+)?(?:%|GB|MB|KB|ms|s|m|h)\b|\d+(?:\.\d+)?(?:元|年|月|日|周|天|次|份|条|星)|(?:结论|重点|建议|风险|下一步|注意|说明|结果|原因|方案|状态|动作|引用|时间|满意度|评分|星级)(?:[:：])/g;

function splitLongParagraph(part) {
  const compact = String(part || '').replace(/\n+/g, ' ').trim();
  if (!compact) return [];
  if (compact.length <= 120) return [compact];

  const sentences = compact
    .split(/(?<=[。！？!?；;])/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (sentences.length < 2) return [compact];

  const segments = [];
  let current = '';
  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
      continue;
    }
    if ((current + sentence).length > 90) {
      segments.push(current.trim());
      current = sentence;
      continue;
    }
    current += sentence;
  }
  if (current.trim()) segments.push(current.trim());
  return segments.length ? segments : [compact];
}

function buildDisplayParagraphs(content) {
  return sanitizeReadableText(content)
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      if (/\n/.test(part)) {
        return part
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
      }
      return splitLongParagraph(part);
    });
}

function renderHighlightedText(part, role) {
  if (role !== 'assistant') return part;
  const text = String(part || '');
  const matches = Array.from(text.matchAll(HIGHLIGHT_PATTERN));
  if (!matches.length) return text;

  const nodes = [];
  let cursor = 0;
  matches.forEach((match, index) => {
    const highlighted = match[0];
    const start = match.index ?? 0;
    if (start > cursor) {
      nodes.push(<span key={`plain-${index}`}>{text.slice(cursor, start)}</span>);
    }
    nodes.push(<span className="message-highlight" key={`highlight-${index}`}>{highlighted}</span>);
    cursor = start + highlighted.length;
  });
  if (cursor < text.length) {
    nodes.push(<span key="plain-tail">{text.slice(cursor)}</span>);
  }
  return nodes;
}

function renderParagraphs(content, role) {
  return buildDisplayParagraphs(content).map((part, index) => (
    <p className="message-paragraph" key={`paragraph-${index}`}>
      {renderHighlightedText(part, role)}
    </p>
  ));
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

function TemplateConfirmationCard({ confirmation, disabled, onConfirm }) {
  if (!confirmation?.options?.length) return null;

  return (
    <div className="template-confirm-card">
      <div className="template-confirm-head">
        <strong>{confirmation.title || '请先确认执行方式'}</strong>
        {confirmation.description ? <div className="template-confirm-desc">{confirmation.description}</div> : null}
      </div>
      <div className="template-confirm-options">
        {confirmation.options.map((option) => (
          <article className="template-confirm-option" key={option.key || option.title}>
            <div className="template-confirm-option-title">{option.title}</div>
            <div className="template-confirm-option-desc">{option.description}</div>
            <button
              type="button"
              className="ghost-btn"
              disabled={disabled}
              onClick={() => onConfirm?.(option)}
            >
              {disabled ? '处理中...' : '按此继续'}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

export default function ChatPanel({
  compact = false,
  panelClassName = '',
  singlePageMode = false,
  showVoiceAction = false,
  scopeLabel = '',
  scopeMeta = '',
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
  onConfirmTemplateOption,
  chatDebugAvailable = false,
  chatDebugDetailsEnabled = false,
  onToggleChatDebugDetails,
}) {
  const messagesRef = useRef(null);
  const composerRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    const node = messagesRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = String(window.location.hash || '').replace(/^#/, '');
    if (!hash || (hash !== 'chat-composer' && hash !== 'upload-document')) return;

    window.requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
      textareaRef.current?.focus();
    });
  }, []);

  return (
    <div className={`chat-panel card ${compact ? 'chat-panel-compact' : ''} ${panelClassName}`.trim()}>
      {chatDebugAvailable ? (
        <div className="chat-debug-toolbar">
          <button
            type="button"
            className={`ghost-btn chat-debug-toggle ${chatDebugDetailsEnabled ? 'is-active' : ''}`.trim()}
            onClick={() => onToggleChatDebugDetails?.()}
          >
            {chatDebugDetailsEnabled ? '关闭供料调试' : '开启供料调试'}
          </button>
        </div>
      ) : null}
      {scopeLabel ? (
        <div className={`chat-scope-strip ${compact ? 'chat-scope-strip-compact' : ''}`.trim()}>
          <span className="chat-scope-kicker">默认资料范围</span>
          <strong className="chat-scope-title">{scopeLabel}</strong>
          {scopeMeta ? <span className="chat-scope-meta">{scopeMeta}</span> : null}
        </div>
      ) : null}
      <div className="chat-messages" ref={messagesRef}>
        {messages.map((message, index) => (
          <div className={`message ${message.role}`} key={message.id || `${message.role}-${index}`}>
            {message.role === 'assistant' && <div className="avatar">AI</div>}
            <div className={`bubble ${message.role === 'user' ? 'user-bubble' : ''}`}>
              {message.title ? <strong>{message.title}</strong> : null}
              <div className="message-content-block">{renderParagraphs(message.content, message.role)}</div>
              {message.table ? <FormulaTable table={message.table} /> : null}

              {message.confirmation ? (
                <TemplateConfirmationCard
                  confirmation={message.confirmation}
                  disabled={isLoading}
                  onConfirm={onConfirmTemplateOption}
                />
              ) : null}

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
                  fallbackLink={!singlePageMode}
                />
              ) : null}

              {message.meta ? <div className="message-meta">{message.meta}</div> : null}

              {message.role === 'assistant' && message.orchestration ? (
                (() => {
                  const chips = buildOrchestrationDebugChips(message.orchestration);
                  const details = buildOrchestrationDebugDetails(message.orchestration);
                  if (!chips.length && !details.length) return null;
                  return (
                    <>
                      {chips.length ? (
                        <div className="message-orchestration-block">
                          {chips.map((chip) => (
                            <span
                              key={chip.key}
                              className={`orchestration-chip ${chip.tone ? `orchestration-chip-${chip.tone}` : ''}`.trim()}
                            >
                              {chip.label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {chatDebugDetailsEnabled && details.length ? (
                        <details className="message-debug-details">
                          <summary>查看供料详情</summary>
                          <div className="message-debug-details-list">
                            {details.map((item) => (
                              <div className="message-debug-details-item" key={item.key}>
                                <strong>{item.label}</strong>
                                <span>{item.value}</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      ) : null}
                    </>
                  );
                })()
              ) : null}

              {message.references?.length ? (
                <div className="message-ref-block">
                  <div className="message-ref-title">引用文档</div>
                  <div className="message-refs">
                    {message.references.map((ref) => (
                      singlePageMode ? (
                        <span key={ref.id} className="ref-chip">{ref.name}</span>
                      ) : (
                        <a key={ref.id} href={`/documents/${ref.id}`} className="ref-chip">{ref.name}</a>
                      )
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

      <div id="chat-composer" className="chat-composer-wrap" ref={composerRef}>
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(event) => onUploadFilesSelected(Array.from(event.target.files || []))}
        />

        <div className="chat-input-row">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (!isLoading) onSubmit(input);
              }
            }}
            placeholder="直接提问。普通对话默认只做资料供给；只有命中按数据集/库输出时，系统才会先让你确认按模型理解输出还是按数据集/库进入静态页编辑。"
          />
          <div className="chat-input-side-actions">
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
            {showVoiceAction ? (
              <button
                type="button"
                className="ghost-btn voice-inline-btn"
                aria-label="语音输入"
              >
                语音
              </button>
            ) : null}
            <button className="primary-btn send-btn" onClick={() => onSubmit(input)} disabled={isLoading}>
              {isLoading ? '思考中...' : '发送'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
