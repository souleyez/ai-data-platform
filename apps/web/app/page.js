'use client';

import { useMemo, useState } from 'react';
import TrendChart from './components/TrendChart';
import { initialMessages, scenarios, sourceItems } from './lib/mock-data';

export default function HomePage() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [activeScenario, setActiveScenario] = useState('order');
  const [isLoading, setIsLoading] = useState(false);

  const panel = useMemo(() => scenarios[activeScenario], [activeScenario]);

  const submitQuestion = async (value) => {
    const text = value.trim();
    if (!text || isLoading) return;

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: text }),
      });

      if (!response.ok) {
        throw new Error('mock api failed');
      }

      const data = await response.json();
      setActiveScenario(data.scenario || 'default');
      setMessages((prev) => [...prev, data.message]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '模拟接口暂时不可用，请稍后重试。',
          meta: '来源：mock API / 错误回退',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (prompt) => submitQuestion(prompt);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">AI</div>
          <div>
            <h1>数据分析中台</h1>
            <p>OpenClaw 定制版</p>
          </div>
        </div>

        <nav className="nav-section">
          <div className="nav-title">工作台</div>
          <a className="nav-item active">智能问答</a>
          <a className="nav-item">文档中心</a>
          <a className="nav-item">数据源管理</a>
          <a className="nav-item">报表中心</a>
          <a className="nav-item">审计日志</a>
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
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>企业智能分析助手</h2>
            <p>面向文档、数据库、订单、流程和商城数据的统一问答与报表分析</p>
          </div>
          <div className="topbar-actions">
            <button className="ghost-btn" onClick={() => { setMessages(initialMessages); setActiveScenario('order'); }}>
              新建会话
            </button>
            <button className="primary-btn">生成日报</button>
          </div>
        </header>

        <section className="workspace-grid">
          <div className="chat-panel card">
            <div className="panel-header">
              <div>
                <h3>对话中心</h3>
                <p>支持企业经营问答、合同归纳、技术文档总结、订单分析</p>
              </div>
              <span className="badge">只读分析</span>
            </div>

            <div className="chat-messages">
              {messages.map((message, index) => (
                <div className={`message ${message.role}`} key={`${message.role}-${index}`}>
                  {message.role === 'assistant' && <div className="avatar">AI</div>}
                  <div className={`bubble ${message.role === 'user' ? 'user-bubble' : ''}`}>
                    {message.title ? <strong>{message.title}</strong> : null}
                    <p>{message.content}</p>
                    {message.meta ? <div className="message-meta">{message.meta}</div> : null}
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

            <div className="quick-actions">
              <button onClick={() => handleQuickAction('请做订单趋势分析')}>订单趋势分析</button>
              <button onClick={() => handleQuickAction('请归纳合同风险')}>合同风险归纳</button>
              <button onClick={() => handleQuickAction('请汇总技术文档主题')}>技术文档汇总</button>
              <button onClick={() => handleQuickAction('请生成本周经营周报')}>生成周报</button>
            </div>

            <div className="chat-input-row">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="输入问题，例如：最近30天哪些客户订单下滑最明显？"
              />
              <button className="primary-btn send-btn" onClick={() => submitQuestion(input)} disabled={isLoading}>
                {isLoading ? '分析中' : '发送'}
              </button>
            </div>
          </div>

          <div className="insight-panel">
            <section className="card stats-grid">
              {panel.stats.map((stat) => (
                <div className="stat-card" key={stat.label}>
                  <div className="stat-label">{stat.label}</div>
                  <div className="stat-value">{stat.value}</div>
                  <div className={`stat-trend ${stat.tone}`}>{stat.trend}</div>
                </div>
              ))}
            </section>

            <section className="card chart-card">
              <div className="panel-header">
                <div>
                  <h3>{panel.chartTitle}</h3>
                  <p>{panel.chartSubtitle}</p>
                </div>
              </div>
              <TrendChart bars={panel.chartBars} title={panel.chartTitle} />
            </section>

            <section className="card table-card">
              <div className="panel-header">
                <div>
                  <h3>{panel.tableTitle}</h3>
                  <p>{panel.tableSubtitle}</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>编号</th>
                    <th>对象</th>
                    <th>摘要</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {panel.rows.map((row) => (
                    <tr key={row.code}>
                      <td>{row.code}</td>
                      <td>{row.customer}</td>
                      <td>{row.risk}</td>
                      <td>
                        <span className={`tag ${row.tone}`}>{row.level}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
