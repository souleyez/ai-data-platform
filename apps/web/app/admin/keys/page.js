'use client';

import { useEffect, useState } from 'react';
import { useAccessSession } from '../../components/AccessGate';
import { buildApiUrl } from '../../lib/config';
import { normalizeAccessKeyCode } from '../../lib/access-client';

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function buildAccessHeaders(accessKey) {
  return accessKey ? { 'x-access-key': accessKey } : {};
}

export default function AccessKeyAdminPage() {
  const { accessKey, clearAccessKey } = useAccessSession();
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [draft, setDraft] = useState({
    label: '',
    code: '',
  });

  async function loadKeys() {
    if (!accessKey) return;

    try {
      const response = await fetch(buildApiUrl('/api/access-keys'), {
        cache: 'no-store',
        headers: buildAccessHeaders(accessKey),
      });
      const json = await response.json().catch(() => ({}));
      if (response.status === 401) {
        clearAccessKey();
        return;
      }
      if (!response.ok) throw new Error(json?.error || 'load_access_keys_failed');
      setItems(Array.isArray(json?.items) ? json.items : []);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载密钥失败。');
    }
  }

  useEffect(() => {
    void loadKeys();
  }, [accessKey]);

  async function handleCreate(event) {
    event.preventDefault();
    if (!accessKey) return;

    try {
      setBusy('create');
      setMessage('');
      setError('');

      const response = await fetch(buildApiUrl('/api/access-keys'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildAccessHeaders(accessKey),
        },
        body: JSON.stringify({
          label: String(draft.label || '').trim() || undefined,
          code: normalizeAccessKeyCode(draft.code) || undefined,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (response.status === 401) {
        clearAccessKey();
        return;
      }
      if (!response.ok) throw new Error(json?.error || 'create_access_key_failed');

      setDraft({ label: '', code: '' });
      setMessage(`已创建密钥：${json?.item?.code || '-'}`);
      await loadKeys();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建密钥失败。');
    } finally {
      setBusy('');
    }
  }

  async function handleDelete(item) {
    if (!accessKey) return;
    if (!window.confirm(`确认删除密钥 ${item.code} 吗？`)) return;

    try {
      setBusy(`delete:${item.id}`);
      setMessage('');
      setError('');

      const response = await fetch(buildApiUrl(`/api/access-keys/${encodeURIComponent(item.id)}`), {
        method: 'DELETE',
        headers: buildAccessHeaders(accessKey),
      });
      const json = await response.json().catch(() => ({}));
      if (response.status === 401) {
        clearAccessKey();
        return;
      }
      if (!response.ok) throw new Error(json?.error || 'delete_access_key_failed');

      setMessage(`已删除密钥：${item.code}`);
      if (item.code === accessKey) {
        clearAccessKey();
        return;
      }
      await loadKeys();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除密钥失败。');
    } finally {
      setBusy('');
    }
  }

  return (
    <main className="access-admin-page">
      <section className="card access-admin-hero">
        <div>
          <div className="access-gate-badge">后台</div>
          <h1>密钥管理</h1>
          <p>只保留创建、查看、删除三件事。留空可自动生成 6 位数字密钥。</p>
        </div>
        <a className="ghost-btn access-utility-link" href="/">
          返回主页
        </a>
      </section>

      <section className="card access-admin-card">
        <h2>创建密钥</h2>
        <form className="access-admin-form" onSubmit={handleCreate}>
          <label className="access-gate-field">
            <span>名称</span>
            <input
              className="access-gate-input"
              type="text"
              value={draft.label}
              onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
              placeholder="例如：运营、演示、管理员"
            />
          </label>

          <label className="access-gate-field">
            <span>数字密钥</span>
            <input
              className="access-gate-input"
              type="text"
              inputMode="numeric"
              maxLength={8}
              value={draft.code}
              onChange={(event) => setDraft((prev) => ({ ...prev, code: normalizeAccessKeyCode(event.target.value) }))}
              placeholder="留空自动生成"
            />
          </label>

          <div className="access-gate-actions">
            <button className="primary-btn" type="submit" disabled={busy === 'create'}>
              {busy === 'create' ? '创建中…' : '创建密钥'}
            </button>
          </div>
        </form>

        {message ? <div className="access-gate-meta">{message}</div> : null}
        {error ? <div className="access-error-meta">{error}</div> : null}
      </section>

      <section className="card access-admin-card">
        <div className="access-admin-header">
          <h2>已创建密钥</h2>
          <button className="ghost-btn" type="button" onClick={() => void loadKeys()}>
            刷新
          </button>
        </div>

        <div className="access-key-list">
          {items.length ? (
            items.map((item) => (
              <article key={item.id} className="access-key-item">
                <div>
                  <div className="access-key-code">{item.code}</div>
                  <div className="access-key-label">{item.label || '未命名密钥'}</div>
                  <div className="access-key-meta">创建于 {formatDateTime(item.createdAt)}</div>
                </div>

                <button
                  className="ghost-btn"
                  type="button"
                  disabled={busy === `delete:${item.id}`}
                  onClick={() => void handleDelete(item)}
                >
                  {busy === `delete:${item.id}` ? '删除中…' : '删除'}
                </button>
              </article>
            ))
          ) : (
            <div className="access-gate-meta">当前还没有密钥。</div>
          )}
        </div>
      </section>
    </main>
  );
}
