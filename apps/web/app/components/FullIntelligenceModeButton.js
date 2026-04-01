'use client';

import { useEffect, useMemo, useState } from 'react';

async function readJson(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function normalizeMessage(message) {
  const value = String(message || '').trim();
  if (!value) return '操作失败，请稍后再试。';
  if (value === 'invalid access key code') return '密钥需为 4-8 位数字。';
  if (value === 'invalid access key') return '密钥不正确。';
  if (value === 'full mode already initialized') return '全智能模式已经初始化。';
  return value;
}

export default function FullIntelligenceModeButton() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState('service');
  const [initialized, setInitialized] = useState(false);
  const [notice, setNotice] = useState('');

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

  const buttonLabel = useMemo(() => {
    if (loading) return '读取中...';
    if (mode === 'full') return '全智能模式已启用';
    return '全智能模式';
  }, [loading, mode]);

  const statusLabel = useMemo(() => {
    if (notice) return notice;
    if (mode === 'full') return '已开放 OpenClaw 完整本机能力边界';
    if (!initialized) return '首次点击后设置 4-8 位数字密钥';
    return '当前为服务智能模式';
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

  async function handleClick() {
    if (loading || submitting) return;
    if (mode === 'full') {
      setNotice('全智能模式已启用。');
      return;
    }

    const setupMode = !initialized;
    const code = window.prompt(
      setupMode ? '首次启用全智能模式，请设置 4-8 位数字密钥' : '请输入全智能模式密钥（4-8 位数字）',
      '',
    );
    if (code === null) return;

    setSubmitting(true);
    try {
      if (setupMode) {
        await submitCode('/api/intelligence-mode/setup-full', {
          code,
          label: '全智能模式',
        });
      } else {
        await submitCode('/api/intelligence-mode/enable-full', { code });
      }
      await refreshStatus();
      setNotice('全智能模式已启用。');
    } catch (error) {
      setNotice(normalizeMessage(error instanceof Error ? error.message : String(error)));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mode-entry-wrap">
      <button
        type="button"
        className={`ghost-btn mode-entry-btn ${mode === 'full' ? 'mode-entry-btn-active' : ''}`}
        onClick={handleClick}
        disabled={loading || submitting}
      >
        {submitting ? '处理中...' : buttonLabel}
      </button>
      <span className="mode-entry-status">{statusLabel}</span>
    </div>
  );
}
