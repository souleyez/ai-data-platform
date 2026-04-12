'use client';

import { useEffect, useMemo, useState } from 'react';

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function normalizeMessage(message) {
  const value = String(message || '').trim();
  if (!value) return '操作失败，请稍后再试。';
  if (value === 'invalid access key code') return '密钥需要是 4-8 位数字。';
  if (value === 'invalid access key') return '密钥不正确。';
  if (value === 'full mode already initialized') return '全智能模式已经初始化。';
  if (value === 'full mode access key is required') return '需要先输入全智能模式密钥。';
  return value;
}

export default function FullIntelligenceModeButton({
  systemConstraints = '',
  onSystemConstraintsChange,
  botConfigSlot = null,
  onAccessStateChange,
  showSystemConstraints = true,
  compact = false,
}) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState('service');
  const [initialized, setInitialized] = useState(false);
  const [notice, setNotice] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCode, setModalCode] = useState('');
  const [modalUnlocked, setModalUnlocked] = useState(false);
  const [modalError, setModalError] = useState('');

  async function refreshStatus() {
    setLoading(true);
    try {
      const response = await fetch('/api/intelligence-mode', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await readJson(response);
      if (!response.ok) {
        throw new Error(normalizeMessage(payload?.error));
      }
      setMode(String(payload?.mode || 'service'));
      setInitialized(Boolean(payload?.accessKeys?.initialized));
      setNotice('');
    } catch (error) {
      setNotice(normalizeMessage(error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  useEffect(() => {
    if (!modalOpen) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape' && !submitting) {
        setModalOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen, submitting]);

  const buttonLabel = useMemo(() => {
    if (loading) return '读取中...';
    if (mode === 'full') return '退出全智能模式';
    return '开启全智能模式';
  }, [loading, mode]);

  const statusLabel = useMemo(() => {
    if (notice) return notice;
    if (mode === 'full') return '当前已是全智能模式，再点一次会直接退出到普通对话模式。';
    if (!initialized) return '首次启用时需要先设置 4-8 位数字密钥。';
    return '当前为普通对话模式。';
  }, [initialized, mode, notice]);

  async function submitCode(path, payload) {
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await readJson(response);
    if (!response.ok) {
      throw new Error(normalizeMessage(data?.error));
    }
    setMode(String(data?.mode || 'service'));
    setInitialized(Boolean(data?.accessKeys?.initialized));
  }

  function resetModal(unlocked = false) {
    setModalCode('');
    setModalError('');
    setModalUnlocked(unlocked);
  }

  async function handleDisable() {
    setSubmitting(true);
    try {
      const response = await fetch('/api/intelligence-mode/disable-full', {
        method: 'POST',
      });
      const payload = await readJson(response);
      if (!response.ok) {
        throw new Error(normalizeMessage(payload?.error));
      }
      setMode(String(payload?.mode || 'service'));
      setInitialized(Boolean(payload?.accessKeys?.initialized));
      setModalUnlocked(false);
      setNotice('已退出全智能模式，当前回到普通对话模式。');
      await onAccessStateChange?.();
    } catch (error) {
      setNotice(normalizeMessage(error instanceof Error ? error.message : String(error)));
    } finally {
      setSubmitting(false);
    }
  }

  function openUnlockModal() {
    resetModal(false);
    setModalOpen(true);
    setNotice('');
  }

  async function handleUnlock() {
    if (submitting) return;

    const code = String(modalCode || '').trim();
    if (!code) {
      setModalError('请输入全智能模式密钥。');
      return;
    }

    setSubmitting(true);
    setModalError('');
    try {
      if (initialized) {
        await submitCode('/api/intelligence-mode/enable-full', { code });
      } else {
        await submitCode('/api/intelligence-mode/setup-full', {
          code,
          label: '全智能模式',
        });
      }
      await onAccessStateChange?.();
      setModalUnlocked(true);
      setNotice('全智能模式已启用。');
    } catch (error) {
      setModalError(normalizeMessage(error instanceof Error ? error.message : String(error)));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClick() {
    if (loading || submitting) return;
    if (mode === 'full') {
      await handleDisable();
      return;
    }
    openUnlockModal();
  }

  return (
    <>
      <div className="mode-entry-wrap">
        <button
          type="button"
          className={`ghost-btn mode-entry-btn ${mode === 'full' ? 'mode-entry-btn-active' : ''} ${compact ? 'mode-entry-btn-compact' : ''}`.trim()}
          onClick={handleClick}
          disabled={loading || submitting}
        >
          {submitting ? '处理中...' : buttonLabel}
        </button>
        {!compact ? <span className="mode-entry-status">{statusLabel}</span> : null}
      </div>

      {modalOpen ? (
        <div
          className="mode-modal-backdrop"
          onClick={() => {
            if (!submitting) setModalOpen(false);
          }}
        >
          <div className="mode-modal card" onClick={(event) => event.stopPropagation()}>
            <div className="mode-modal-head">
              <div>
                <strong>{initialized ? '输入全智能模式密钥' : '设置全智能模式密钥'}</strong>
                <div className="mode-modal-subtitle">
                  只有通过密钥验证后，才会开放系统限制和机器人对话式配置入口。
                </div>
              </div>
              <button
                type="button"
                className="mode-modal-close"
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                aria-label="关闭"
              >
                ×
              </button>
            </div>

            {!modalUnlocked ? (
              <div className="mode-modal-body">
                <label className="mode-modal-label" htmlFor="full-mode-code">
                  {initialized ? '全智能模式密钥' : '设置 4-8 位数字密钥'}
                </label>
                <input
                  id="full-mode-code"
                  className="filter-input mode-modal-input"
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  value={modalCode}
                  onChange={(event) => setModalCode(event.target.value)}
                  placeholder={initialized ? '输入已有密钥' : '例如 1234'}
                  disabled={submitting}
                />
                {modalError ? <div className="mode-modal-error">{modalError}</div> : null}
                <div className="mode-modal-actions">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => setModalOpen(false)}
                    disabled={submitting}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={handleUnlock}
                    disabled={submitting}
                  >
                    {submitting ? '处理中...' : initialized ? '验证并启用' : '设置并启用'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mode-modal-body">
                <div className="mode-modal-unlocked-banner">
                  全智能模式已开启。现在可以直接通过对话引导接入新机器人、设置文档权限等级和自然语言约束。
                </div>
                {showSystemConstraints ? (
                  <div className="chat-constraints-card mode-modal-constraints">
                    <div className="chat-constraints-head">
                      <strong>系统对话限制</strong>
                      <span>明确写清楚要做什么、不要做什么。关闭全智能模式不会自动清空这份限制。</span>
                    </div>
                    <textarea
                      className="chat-constraints-input"
                      value={systemConstraints}
                      onChange={(event) => onSystemConstraintsChange?.(event.target.value)}
                      placeholder="例如：不要自动生成表格；优先参考合同库；回答尽量简短；不要建议未确认的系统动作。"
                    />
                  </div>
                ) : null}
                {botConfigSlot}
                <div className="mode-modal-actions">
                  {showSystemConstraints ? (
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => onSystemConstraintsChange?.('')}
                      disabled={submitting}
                    >
                      清空限制
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => setModalOpen(false)}
                    disabled={submitting}
                  >
                    完成
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
