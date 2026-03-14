'use client';

import { useState } from 'react';
import ChatPanel from './components/ChatPanel';
import InsightPanel from './components/InsightPanel';
import Sidebar from './components/Sidebar';
import { buildApiUrl } from './lib/config';
import { normalizeChatResponse } from './lib/types';
import { initialMessages, scenarios, sourceItems } from './lib/mock-data';

export default function HomePage() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [activeScenario, setActiveScenario] = useState('order');
  const [panel, setPanel] = useState(scenarios.order);
  const [isLoading, setIsLoading] = useState(false);

  const submitQuestion = async (value) => {
    const text = value.trim();
    if (!text || isLoading) return;

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(buildApiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
      });

      if (!response.ok) throw new Error('mock api failed');

      const data = await response.json();
      const normalized = normalizeChatResponse(data, scenarios.default);
      setActiveScenario(normalized.scenario);
      setPanel(normalized.panel || scenarios[normalized.scenario] || scenarios.default);
      setMessages((prev) => [...prev, normalized.message]);
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

  const resetConversation = () => {
    setMessages(initialMessages);
    setActiveScenario('order');
    setPanel(scenarios.order);
    setInput('');
  };

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sourceItems} />

      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>企业智能分析助手</h2>
            <p>面向文档、数据库、订单、流程和商城数据的统一问答与报表分析</p>
          </div>
          <div className="topbar-actions">
            <button className="ghost-btn" onClick={resetConversation}>新建会话</button>
            <button className="primary-btn">生成日报</button>
          </div>
        </header>

        <section className="workspace-grid">
          <ChatPanel
            messages={messages}
            input={input}
            isLoading={isLoading}
            onInputChange={setInput}
            onSubmit={submitQuestion}
            onQuickAction={submitQuestion}
          />
          <InsightPanel panel={panel} />
        </section>
      </main>
    </div>
  );
}
