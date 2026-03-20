'use client';

import { useEffect, useMemo, useState } from 'react';
import { NAV_ITEMS } from '../lib/types';

const NAV_LINKS = {
  智能问答: '/',
  文档中心: '/documents',
  数据源管理: '/datasources',
  报表中心: '/reports',
  审计日志: '/audit',
};

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
};

function getRuntimeLabel(openclaw) {
  if (openclaw.running) {
    return `已连接${openclaw.installedVersion ? ` · ${openclaw.installedVersion}` : ''}`;
  }

  if (openclaw.installed) {
    return '已安装，网关未连通';
  }

  return '未安装';
}

export default function Sidebar({ sourceItems = [], currentPath = '/' }) {
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  const [modelState, setModelState] = useState(INITIAL_MODEL_STATE);
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

  const currentModel = useMemo(() => modelState.currentModel || modelState.availableModels[0] || null, [modelState]);

  async function refreshModelState(message = '') {
    try {
      const response = await fetch('/api/model-config', { cache: 'no-store' });
      const json = await response.json();
      setModelState({
        openclaw: json.openclaw || INITIAL_MODEL_STATE.openclaw,
        currentModel: json.currentModel || null,
        availableModels: Array.isArray(json.availableModels) ? json.availableModels : [],
      });
      setModelMessage(message);
    } catch {
      if (message) setModelMessage(message);
    }
  }

  async function handleSelectModel(modelId) {
    setModelBusy(true);
    setModelMessage('');

    try {
      const response = await fetch('/api/model-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.message || '模型切换失败');
      }

      setModelState({
        openclaw: json.openclaw || INITIAL_MODEL_STATE.openclaw,
        currentModel: json.currentModel || null,
        availableModels: Array.isArray(json.availableModels) ? json.availableModels : [],
      });
      setModelMessage(json.message || '模型已切换。');
    } catch (error) {
      setModelMessage(error instanceof Error ? error.message : '模型切换失败，请稍后重试。');
    } finally {
      setModelBusy(false);
    }
  }

async function handleInstallOpenClaw() {
  setModelBusy(true);
  setModelMessage('正在安装云端模型服务，并启动默认网关...');

    try {
      const response = await fetch('/api/model-config/install', { method: 'POST' });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.message || 'install_openclaw_failed');
      }

      await refreshModelState(json.message || '云端模型服务已安装完成。');
    } catch (error) {
      setModelMessage(error instanceof Error ? error.message : '云端模型服务安装失败。');
    } finally {
      setModelBusy(false);
    }
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">AI</div>
        <div>
          <h1>数据分析中台</h1>
          <p>企业智能分析工作台</p>
        </div>
      </div>

      <nav className="nav-section">
        <div className="nav-title">工作台</div>
        {NAV_ITEMS.map((item) => {
          const href = NAV_LINKS[item] || '#';
          const active = href !== '#' && currentPath === href;
          return (
            <a key={item} href={href} className={`nav-item ${active ? 'active' : ''}`}>
              {item}
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

      <section className="side-card compact model-card" style={{ marginTop: 8 }}>
        <div className="card-title">模型配置</div>
        <p>
          当前模型：
          {currentModel ? ` ${currentModel.provider} / ${currentModel.label}` : ' 未配置'}
        </p>
        <p style={{ marginTop: 8, fontSize: 12, color: '#b7c3d6' }}>
          云端模型：{getRuntimeLabel(modelState.openclaw)}
        </p>
        <button
          className="ghost-btn"
          type="button"
          style={{ marginTop: 10, width: '100%' }}
          onClick={() => setModelPanelOpen((prev) => !prev)}
        >
          {modelPanelOpen ? '收起模型面板' : '打开模型面板'}
        </button>

        {modelPanelOpen ? (
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            {modelState.availableModels.length ? (
              modelState.availableModels.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="ghost-btn"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    borderColor: item.id === currentModel?.id ? '#93c5fd' : undefined,
                    background: item.id === currentModel?.id ? '#eff6ff' : '#fff',
                    opacity: modelBusy ? 0.72 : 1,
                  }}
                  onClick={() => handleSelectModel(item.id)}
                  disabled={modelBusy}
                >
                  <div style={{ fontWeight: 700 }}>{item.label}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>{item.provider}</div>
                </button>
              ))
            ) : (
              <div style={{ fontSize: 12, color: '#b7c3d6', lineHeight: 1.6 }}>
                当前还没有读取到云端模型列表。
              </div>
            )}

            {!modelState.openclaw.installed ? (
              <button
                type="button"
                className="ghost-btn"
                onClick={handleInstallOpenClaw}
                disabled={modelBusy}
                style={{ width: '100%', marginTop: 4 }}
              >
                {modelBusy ? '安装中...' : '安装云端模型服务'}
              </button>
            ) : null}

            <div style={{ fontSize: 12, color: '#b7c3d6', lineHeight: 1.6 }}>
              {modelState.openclaw.usesDevBridge
                ? '当前为开发机模式：页面通过本机桥接接入云端模型服务。'
                : '当前为直连模式：项目 API 直接访问云端模型服务网关。'}
            </div>

            <div style={{ fontSize: 12, color: '#b7c3d6', lineHeight: 1.6 }}>
              系统仍可独立运行：即使未安装云端模型服务，也会保留本地AI兜底能力。
            </div>

            {modelMessage ? (
              <div style={{ fontSize: 12, color: '#60a5fa', lineHeight: 1.6 }}>{modelMessage}</div>
            ) : null}
          </div>
        ) : null}
      </section>
    </aside>
  );
}
