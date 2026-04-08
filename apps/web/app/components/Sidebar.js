'use client';

import { useEffect, useMemo, useState } from 'react';

const DESKTOP_NAV_LINKS = [
  { label: '智能工作台', href: '/' },
  { label: '文档中心', href: '/documents' },
  { label: '数据源中心', href: '/datasources' },
  { label: '报告中心', href: '/reports' },
  { label: '审计中心', href: '/audit' },
];

const MOBILE_NAV_LINKS = [
  { label: '智能工作台', href: '/' },
  { label: '文档中心', href: '/documents' },
  { label: '报告中心', href: '/reports' },
];

const INITIAL_MODEL_STATE = {
  openclaw: {
    installed: false,
    running: false,
    installMode: 'none',
    installedVersion: null,
    gatewayUrl: 'http://127.0.0.1:18789',
    needsInstall: false,
    usesDevBridge: false,
  },
  currentModel: null,
  availableModels: [],
  providers: [],
};

function getRuntimeLabel(openclaw) {
  if (openclaw.running) {
    return `已连接${openclaw.installedVersion ? ` / ${openclaw.installedVersion}` : ''}`;
  }
  if (openclaw.installed) {
    return '已安装，网关未连通';
  }
  return '未安装';
}

function buildProviderDrafts(providers = []) {
  return providers.reduce((drafts, provider) => {
    const selectedMethod = provider.methods?.find((item) => item.selected) || provider.methods?.[0] || null;
    drafts[provider.id] = {
      methodId: selectedMethod?.id || '',
      apiKey: '',
    };
    return drafts;
  }, {});
}

function inputStyle() {
  return {
    width: '100%',
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.32)',
    background: 'rgba(15, 23, 42, 0.72)',
    color: '#e2e8f0',
    padding: '10px 12px',
  };
}

export default function Sidebar({
  sourceItems = [],
  currentPath = '/',
  initialModelState = INITIAL_MODEL_STATE,
}) {
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  const [modelState, setModelState] = useState(initialModelState);
  const [providerDrafts, setProviderDrafts] = useState(() => buildProviderDrafts(initialModelState.providers));
  const [modelBusy, setModelBusy] = useState(false);
  const [modelMessage, setModelMessage] = useState('');

  useEffect(() => {
    let alive = true;

    async function loadModelState() {
      try {
        const response = await fetch('/api/model-config', { cache: 'no-store' });
        const json = await response.json();
        if (!alive) return;
        setModelState({
          openclaw: json.openclaw || INITIAL_MODEL_STATE.openclaw,
          currentModel: json.currentModel || null,
          availableModels: Array.isArray(json.availableModels) ? json.availableModels : [],
          providers: Array.isArray(json.providers) ? json.providers : [],
        });
      } catch {
        if (!alive) return;
        setModelMessage('模型状态读取失败，请稍后重试。');
      }
    }

    loadModelState();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setProviderDrafts(buildProviderDrafts(modelState.providers));
  }, [modelState.providers]);

  const currentModel = useMemo(
    () => modelState.currentModel || modelState.availableModels[0] || null,
    [modelState],
  );

  async function refreshModelState(message = '') {
    try {
      const response = await fetch('/api/model-config', { cache: 'no-store' });
      const json = await response.json();
      setModelState({
        openclaw: json.openclaw || INITIAL_MODEL_STATE.openclaw,
        currentModel: json.currentModel || null,
        availableModels: Array.isArray(json.availableModels) ? json.availableModels : [],
        providers: Array.isArray(json.providers) ? json.providers : [],
      });
      if (message) setModelMessage(message);
    } catch {
      if (message) setModelMessage(message);
    }
  }

  async function submitModelAction(payload, fallbackMessage) {
    setModelBusy(true);
    setModelMessage('');
    try {
      const response = await fetch('/api/model-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.message || fallbackMessage);
      }
      setModelState({
        openclaw: json.openclaw || INITIAL_MODEL_STATE.openclaw,
        currentModel: json.currentModel || null,
        availableModels: Array.isArray(json.availableModels) ? json.availableModels : [],
        providers: Array.isArray(json.providers) ? json.providers : [],
      });
      setModelMessage(json.message || fallbackMessage);
    } catch (error) {
      setModelMessage(error instanceof Error ? error.message : fallbackMessage);
    } finally {
      setModelBusy(false);
    }
  }

  async function handleSelectModel(modelId) {
    if (!modelId) return;
    await submitModelAction(
      { action: 'select-model', modelId },
      '模型切换失败，请稍后重试。',
    );
  }

  async function handleInstallOpenClaw() {
    setModelBusy(true);
    setModelMessage('正在安装模型引擎并启动默认网关...');
    try {
      const response = await fetch('/api/model-config/install', { method: 'POST' });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.message || '模型引擎安装请求失败。');
      }
      await refreshModelState(json.message || '模型引擎已安装。');
    } catch (error) {
      setModelMessage(error instanceof Error ? error.message : '模型引擎安装失败。');
    } finally {
      setModelBusy(false);
    }
  }

  function updateProviderDraft(providerId, patch) {
    setProviderDrafts((current) => ({
      ...current,
      [providerId]: {
        ...(current[providerId] || {}),
        ...patch,
      },
    }));
  }

  async function handleSaveProvider(providerId) {
    const draft = providerDrafts[providerId] || {};
    await submitModelAction(
      {
        action: 'save-provider',
        providerId,
        methodId: draft.methodId,
        apiKey: draft.apiKey,
      },
      '供应商配置保存失败。',
    );
    updateProviderDraft(providerId, { apiKey: '' });
  }

  async function handleLaunchLogin(providerId) {
    const draft = providerDrafts[providerId] || {};
    await submitModelAction(
      {
        action: 'launch-login',
        providerId,
        methodId: draft.methodId,
      },
      '登录窗口拉起失败。',
    );
  }

  return (
    <>
      <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">AI</div>
        <div>
          <h1>智能助手</h1>
          <p>个人知识库，采编写一站式解决</p>
        </div>
      </div>

      <nav className="nav-section">
        <div className="nav-title">工作台</div>
        {DESKTOP_NAV_LINKS.map((item) => {
          const active = currentPath === item.href;
          return (
            <a key={`${item.label}-${item.href}`} href={item.href} className={`nav-item ${active ? 'active' : ''}`}>
              {item.label}
            </a>
          );
        })}
      </nav>

      <section className="side-card">
        <div className="card-title">已连接数据源</div>
        <ul className="source-list">
          {sourceItems.map((item) => (
            <li key={item.name}>
              <span className={`dot ${item.status}`}></span>
              {item.name}
            </li>
          ))}
        </ul>
      </section>

      <section className="side-card compact">
        <div className="card-title">只读模式</div>
        <p>当前系统默认只读：禁止写入、删除、修改客户原系统。</p>
      </section>

      <section className="side-card compact">
        <div className="card-title">使用建议</div>
        <p>本系统是基于 PC 的本地助手，推荐使用 PC 大屏幕打开；移动端更适合查看结果和轻量操作。</p>
      </section>

      <section className="side-card compact model-card" style={{ marginTop: 8 }}>
        <div className="card-title">模型配置</div>
        <p>
          当前模型：
          {currentModel ? ` ${currentModel.provider} / ${currentModel.label}` : ' 未配置'}
        </p>
        <p style={{ marginTop: 8, fontSize: 12, color: '#b7c3d6' }}>
          模型引擎：{getRuntimeLabel(modelState.openclaw)}
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="ghost-btn" type="button" onClick={() => setModelPanelOpen((prev) => !prev)}>
            {modelPanelOpen ? '收起面板' : '打开面板'}
          </button>
          <button className="ghost-btn" type="button" onClick={() => refreshModelState('模型状态已刷新。')} disabled={modelBusy}>
            刷新状态
          </button>
        </div>

        {modelPanelOpen ? (
          <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 12, color: '#cbd5e1' }}>默认模型</label>
              <select
                value={currentModel?.id || ''}
                onChange={(event) => handleSelectModel(event.target.value)}
                disabled={modelBusy || !modelState.availableModels.length}
                style={inputStyle()}
              >
                <option value="" disabled>
                  请选择模型
                </option>
                {modelState.availableModels.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.provider} / {item.label}
                  </option>
                ))}
              </select>
            </div>

            {!modelState.openclaw.installed ? (
              <button
                type="button"
                className="ghost-btn"
                onClick={handleInstallOpenClaw}
                disabled={modelBusy}
                style={{ width: '100%' }}
              >
                {modelBusy ? '安装中...' : '安装模型引擎'}
              </button>
            ) : null}

            <div style={{ fontSize: 12, color: '#b7c3d6', lineHeight: 1.6 }}>
              {modelState.openclaw.usesDevBridge
                ? '当前页面通过本机桥接读取 WSL 里的模型引擎配置与网关。'
                : '当前页面直接读取本机模型引擎配置。'}
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {modelState.providers.map((provider) => {
                const draft = providerDrafts[provider.id] || { methodId: provider.methods?.[0]?.id || '', apiKey: '' };
                const currentMethod = provider.methods.find((item) => item.id === draft.methodId) || provider.methods[0] || null;
                const usesApiKey = currentMethod?.kind === 'apiKey';
                return (
                  <div
                    key={provider.id}
                    style={{
                      border: '1px solid rgba(148, 163, 184, 0.24)',
                      borderRadius: 14,
                      padding: 12,
                      background: 'rgba(15, 23, 42, 0.45)',
                      display: 'grid',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ color: '#f8fafc', fontWeight: 700 }}>{provider.label}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>{provider.description}</div>
                      </div>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: 999,
                          fontSize: 11,
                          background: provider.configured ? 'rgba(34, 197, 94, 0.18)' : 'rgba(148, 163, 184, 0.18)',
                          color: provider.configured ? '#86efac' : '#cbd5e1',
                        }}
                      >
                        {provider.statusText}
                      </span>
                    </div>

                    <select
                      value={draft.methodId}
                      onChange={(event) => updateProviderDraft(provider.id, { methodId: event.target.value })}
                      disabled={modelBusy}
                      style={inputStyle()}
                    >
                      {provider.methods.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>

                    <div style={{ fontSize: 12, color: '#b7c3d6', lineHeight: 1.6 }}>
                      {currentMethod?.description || '请选择配置方式。'}
                    </div>

                    {usesApiKey ? (
                      <>
                        <input
                          type="password"
                          value={draft.apiKey}
                          placeholder="输入 API Key"
                          onChange={(event) => updateProviderDraft(provider.id, { apiKey: event.target.value })}
                          disabled={modelBusy}
                          style={inputStyle()}
                        />
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => handleSaveProvider(provider.id)}
                          disabled={modelBusy}
                        >
                          保存到模型引擎
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => handleLaunchLogin(provider.id)}
                        disabled={modelBusy}
                      >
                        打开登录窗口
                      </button>
                    )}

                    <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                      支持模型：{provider.models.map((item) => item.label).join(' / ')}
                    </div>

                    {provider.id === 'moonshot' ? (
                      <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                        {provider.webSearchConfigured ? 'Kimi 搜索已同步到模型网关。' : '保存 Moonshot API Key 时会同时同步 Kimi 搜索配置。'}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {modelMessage ? (
              <div style={{ fontSize: 12, color: '#93c5fd', lineHeight: 1.6 }}>{modelMessage}</div>
            ) : null}
          </div>
        ) : null}
      </section>
      </aside>

      <nav className="sidebar-mobile-nav" aria-label="移动端底部目录">
        {MOBILE_NAV_LINKS.map((item) => {
          const active = currentPath === item.href;
          return (
            <a
              key={`mobile-${item.label}-${item.href}`}
              href={item.href}
              className={`mobile-nav-item ${active ? 'active' : ''}`}
            >
              <span className="mobile-nav-label">{item.label}</span>
            </a>
          );
        })}
      </nav>
    </>
  );
}

