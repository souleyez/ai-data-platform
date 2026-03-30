'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { buildApiUrl } from '../lib/config';
import {
  clearStoredAccessKey,
  isValidAccessKeyCode,
  loadStoredAccessKey,
  normalizeAccessKeyCode,
  persistAccessKey,
} from '../lib/access-client';

const AccessSessionContext = createContext({
  accessKey: '',
  clearAccessKey: () => {},
});

export function useAccessSession() {
  return useContext(AccessSessionContext);
}

async function readAccessStatus() {
  const response = await fetch(buildApiUrl('/api/access-keys/status'), {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('failed_to_load_access_key_status');
  }

  return response.json();
}

async function verifyAccessCode(code) {
  const response = await fetch(buildApiUrl('/api/access-keys/verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error || 'invalid_access_key');
  }

  return json;
}

async function bootstrapAccessCode(payload) {
  const response = await fetch(buildApiUrl('/api/access-keys'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error || 'failed_to_create_access_key');
  }

  return json;
}

export default function AccessGate({ children }) {
  const [phase, setPhase] = useState('checking');
  const [accessKey, setAccessKey] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [setupCodeInput, setSetupCodeInput] = useState('');
  const [setupLabelInput, setSetupLabelInput] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const clearAccessKey = useCallback(() => {
    clearStoredAccessKey();
    setAccessKey('');
    setCodeInput('');
    setMessage('');
    setPhase('locked');
  }, []);

  useEffect(() => {
    let alive = true;

    async function bootstrapState() {
      setPhase('checking');
      setMessage('');

      try {
        const status = await readAccessStatus();
        if (!alive) return;

        if (!status?.initialized) {
          clearStoredAccessKey();
          setAccessKey('');
          setPhase('setup');
          return;
        }

        const storedKey = loadStoredAccessKey();
        if (!storedKey) {
          setPhase('locked');
          return;
        }

        const verified = await verifyAccessCode(storedKey);
        if (!alive) return;

        persistAccessKey(storedKey);
        setAccessKey(storedKey);
        setMessage(verified?.item?.label ? `当前密钥：${verified.item.label}` : '');
        setPhase('ready');
      } catch {
        if (!alive) return;
        clearStoredAccessKey();
        setAccessKey('');
        setPhase('locked');
      }
    }

    void bootstrapState();
    return () => {
      alive = false;
    };
  }, []);

  async function handleUnlock(event) {
    event.preventDefault();
    const normalizedCode = normalizeAccessKeyCode(codeInput);
    if (!isValidAccessKeyCode(normalizedCode)) {
      setMessage('请输入 4 到 8 位数字密钥。');
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      const verified = await verifyAccessCode(normalizedCode);
      persistAccessKey(normalizedCode);
      setAccessKey(normalizedCode);
      setCodeInput('');
      setMessage(verified?.item?.label ? `已通过：${verified.item.label}` : '');
      setPhase('ready');
    } catch {
      clearStoredAccessKey();
      setAccessKey('');
      setMessage('密钥无效，请重新输入。');
    } finally {
      setBusy(false);
    }
  }

  async function handleSetup(event) {
    event.preventDefault();
    const normalizedCode = normalizeAccessKeyCode(setupCodeInput);
    if (normalizedCode && !isValidAccessKeyCode(normalizedCode)) {
      setMessage('自定义密钥需要是 4 到 8 位数字。');
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      const created = await bootstrapAccessCode({
        code: normalizedCode || undefined,
        label: String(setupLabelInput || '').trim() || undefined,
      });
      const nextCode = created?.item?.code || normalizedCode;
      persistAccessKey(nextCode);
      setAccessKey(nextCode);
      setSetupCodeInput('');
      setSetupLabelInput('');
      setMessage(`初始化完成，当前密钥：${nextCode}`);
      setPhase('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '初始化失败，请重试。');
    } finally {
      setBusy(false);
    }
  }

  const sessionValue = useMemo(
    () => ({
      accessKey,
      clearAccessKey,
    }),
    [accessKey, clearAccessKey],
  );

  if (phase === 'ready') {
    return (
      <AccessSessionContext.Provider value={sessionValue}>
        <div className="access-utility-bar">
          <a className="ghost-btn access-utility-link" href="/admin/keys">
            密钥后台
          </a>
          <button className="ghost-btn" type="button" onClick={clearAccessKey}>
            切换密钥
          </button>
        </div>
        {children}
      </AccessSessionContext.Provider>
    );
  }

  return (
    <div className="access-gate-shell">
      <section className="card access-gate-card">
        <div className="access-gate-badge">最小权限</div>
        <h1>{phase === 'setup' ? '初始化访问密钥' : '输入访问密钥'}</h1>
        <p className="access-gate-copy">
          {phase === 'checking'
            ? '正在检查密钥状态。'
            : phase === 'setup'
              ? '系统还没有密钥。先创建一个数字密钥，后续会长存在当前浏览器。'
              : '进入主页面前先输入数字密钥。验证通过后会长存在当前浏览器。'}
        </p>

        {phase === 'checking' ? (
          <div className="access-gate-meta">请稍候…</div>
        ) : phase === 'setup' ? (
          <form className="access-gate-form" onSubmit={handleSetup}>
            <label className="access-gate-field">
              <span>名称</span>
              <input
                className="access-gate-input"
                type="text"
                value={setupLabelInput}
                onChange={(event) => setSetupLabelInput(event.target.value)}
                placeholder="例如：管理员"
              />
            </label>

            <label className="access-gate-field">
              <span>数字密钥</span>
              <input
                className="access-gate-input"
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={setupCodeInput}
                onChange={(event) => setSetupCodeInput(normalizeAccessKeyCode(event.target.value))}
                placeholder="留空自动生成 6 位数字"
              />
            </label>

            <div className="access-gate-actions">
              <button className="primary-btn" type="submit" disabled={busy}>
                {busy ? '创建中…' : '创建并进入'}
              </button>
            </div>
          </form>
        ) : (
          <form className="access-gate-form" onSubmit={handleUnlock}>
            <label className="access-gate-field">
              <span>数字密钥</span>
              <input
                className="access-gate-input"
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={codeInput}
                onChange={(event) => setCodeInput(normalizeAccessKeyCode(event.target.value))}
                placeholder="请输入 4 到 8 位数字"
              />
            </label>

            <div className="access-gate-actions">
              <button className="primary-btn" type="submit" disabled={busy}>
                {busy ? '验证中…' : '进入系统'}
              </button>
              <a className="ghost-btn access-utility-link" href="/admin/keys">
                密钥后台
              </a>
            </div>
          </form>
        )}

        {message ? <div className="access-gate-meta">{message}</div> : null}
      </section>
    </div>
  );
}
