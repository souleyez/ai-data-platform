'use client';

import { useMemo, useState } from 'react';
import { NAV_ITEMS } from '../lib/types';

const NAV_LINKS = {
  智能问答: '/',
  文档中心: '/documents',
  数据源管理: '/datasources',
  报表中心: '/reports',
  审计日志: '/audit',
};

const MODEL_OPTIONS = [
  { id: 'github-copilot/gpt-5.4', label: 'GPT-5.4', provider: 'GitHub Copilot', active: true },
  { id: 'github-copilot/gpt-4o', label: 'GPT-4o', provider: 'GitHub Copilot' },
  { id: 'openclaw/openai-compatible', label: 'OpenClaw 外接模型', provider: '演示入口' },
];

export default function Sidebar({ sourceItems = [], currentPath = '/' }) {
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState('github-copilot/gpt-5.4');
  const currentModel = useMemo(() => MODEL_OPTIONS.find((item) => item.id === selectedModel) || MODEL_OPTIONS[0], [selectedModel]);

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
            <a key={item} href={href} className={`nav-item ${active ? 'active' : ''}`}>{item}</a>
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
        <p>当前模型：{currentModel.provider} / {currentModel.label}</p>
        <button className="ghost-btn" type="button" style={{ marginTop: 10, width: '100%' }} onClick={() => setModelPanelOpen((prev) => !prev)}>
          {modelPanelOpen ? '收起模型面板' : '打开模型面板'}
        </button>
        {modelPanelOpen ? (
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            {MODEL_OPTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="ghost-btn"
                style={{
                  width: '100%',
                  textAlign: 'left',
                  borderColor: item.id === selectedModel ? '#93c5fd' : undefined,
                  background: item.id === selectedModel ? '#eff6ff' : '#fff',
                }}
                onClick={() => setSelectedModel(item.id)}
              >
                <div style={{ fontWeight: 700 }}>{item.label}{item.active ? '（当前接入）' : ''}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>{item.provider}</div>
              </button>
            ))}
            <div style={{ fontSize: 12, color: '#b7c3d6', lineHeight: 1.5 }}>
              当前为前端演示入口，点击后只切换展示状态，不真正修改后端模型。
            </div>
          </div>
        ) : null}
      </section>
    </aside>
  );
}
