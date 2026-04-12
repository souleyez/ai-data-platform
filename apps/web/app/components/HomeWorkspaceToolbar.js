'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchModelConfig, updateModelConfig } from '../home-api';
import ThemeToggleButton from './ThemeToggleButton';

const DESKTOP_NAV_LINKS = [
  { label: '智能会话', href: '/' },
  { label: '数据集', href: '/documents' },
  { label: '采集源', href: '/datasources' },
  { label: '报表', href: '/reports' },
  { label: '审计', href: '/audit' },
];

const INITIAL_MODEL_STATE = {
  openclaw: {
    installed: false,
    running: false,
    installedVersion: null,
  },
  currentModel: null,
  availableModels: [],
  providers: [],
};

function getRuntimeLabel(openclaw) {
  if (openclaw?.running) return '已连接';
  if (openclaw?.installed) return '网关未连通';
  return '未安装';
}

export default function HomeWorkspaceToolbar({
  sourceItems = [],
  initialModelState = INITIAL_MODEL_STATE,
  fullIntelligenceSlot = null,
  currentPath = '/',
}) {
  const [modelState, setModelState] = useState(initialModelState);
  const [modelBusy, setModelBusy] = useState(false);
  const [modelMessage, setModelMessage] = useState('');

  useEffect(() => {
    let alive = true;

    async function loadModelState() {
      try {
        const json = await fetchModelConfig();
        if (!alive) return;
        setModelState({
          openclaw: json.openclaw || INITIAL_MODEL_STATE.openclaw,
          currentModel: json.currentModel || null,
          availableModels: Array.isArray(json.availableModels) ? json.availableModels : [],
          providers: Array.isArray(json.providers) ? json.providers : [],
        });
      } catch {
        if (!alive) return;
        setModelMessage('模型状态读取失败');
      }
    }

    void loadModelState();
    return () => {
      alive = false;
    };
  }, []);

  const currentModel = useMemo(
    () => modelState.currentModel || modelState.availableModels[0] || null,
    [modelState],
  );

  async function refreshModelState(message = '') {
    try {
      const json = await fetchModelConfig();
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

  async function handleSelectModel(modelId) {
    if (!modelId || modelBusy) return;
    setModelBusy(true);
    setModelMessage('');
    try {
      const json = await updateModelConfig({ action: 'select-model', modelId });
      setModelState({
        openclaw: json.openclaw || INITIAL_MODEL_STATE.openclaw,
        currentModel: json.currentModel || null,
        availableModels: Array.isArray(json.availableModels) ? json.availableModels : [],
        providers: Array.isArray(json.providers) ? json.providers : [],
      });
      setModelMessage(json.message || '模型已切换');
    } catch (error) {
      setModelMessage(error instanceof Error ? error.message : '模型切换失败');
    } finally {
      setModelBusy(false);
    }
  }

  return (
    <header className="card home-toolbar">
      <div className="home-toolbar-left">
        <a href="/" className="home-toolbar-brand">
          <span className="home-toolbar-brand-mark">AI</span>
          <span className="home-toolbar-brand-name">智能助手</span>
        </a>
        <nav className="home-toolbar-nav" aria-label="桌面导航">
          {DESKTOP_NAV_LINKS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`home-toolbar-nav-link ${item.href === currentPath ? 'active' : ''}`}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="home-toolbar-right">
        <ThemeToggleButton compact />

        <div className="home-toolbar-flyout">
          <button type="button" className="ghost-btn home-toolbar-flyout-trigger">
            已连接数据源
            <span className="library-tab-count">{sourceItems.length}</span>
          </button>
          <div className="home-toolbar-flyout-panel">
            <div className="home-toolbar-flyout-title">已连接数据源</div>
            <div className="home-toolbar-source-list">
              {sourceItems.map((item) => (
                <div key={item.name} className="home-toolbar-source-item">
                  <span className={`dot ${item.status}`}></span>
                  <span>{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="home-toolbar-flyout">
          <button type="button" className="ghost-btn home-toolbar-flyout-trigger">
            模型连接
            <span className="library-tab-count">{modelState.availableModels.length || 1}</span>
          </button>
          <div className="home-toolbar-flyout-panel">
            <div className="home-toolbar-flyout-title">模型连接</div>
            <div className="home-toolbar-model-line">
              <strong>运行状态</strong>
              <span>{getRuntimeLabel(modelState.openclaw)}</span>
            </div>
            <div className="home-toolbar-model-line">
              <strong>当前模型</strong>
              <span>{currentModel ? `${currentModel.provider} / ${currentModel.label}` : '未配置'}</span>
            </div>
            <div className="home-toolbar-model-line">
              <strong>本机已配置</strong>
              <select
                className="home-toolbar-model-select"
                value={currentModel?.id || ''}
                onChange={(event) => {
                  void handleSelectModel(event.target.value);
                }}
                disabled={modelBusy || !modelState.availableModels.length}
              >
                <option value="" disabled>选择模型</option>
                {modelState.availableModels.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.provider} / {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="home-toolbar-model-actions">
              <button
                type="button"
                className="ghost-btn compact-inline-btn"
                onClick={() => { void refreshModelState('模型状态已刷新'); }}
                disabled={modelBusy}
              >
                刷新
              </button>
            </div>
            {modelMessage ? <div className="home-toolbar-model-message">{modelMessage}</div> : null}
          </div>
        </div>

        <div className="home-toolbar-mode-slot">
          {fullIntelligenceSlot}
        </div>
      </div>
    </header>
  );
}
