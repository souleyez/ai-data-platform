'use client';

import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { buildApiUrl } from '../lib/config';
import { normalizeDatasourceResponse } from '../lib/types';
import { sourceItems } from '../lib/mock-data';

const auditItems = [
  {
    id: 'audit-001',
    time: '最近一次会话',
    action: '文档问答',
    target: '技术文档目录',
    result: '只读成功',
    note: '返回来源、引用与编排状态。',
  },
  {
    id: 'audit-002',
    time: '最近一次扫描',
    action: '文档扫描',
    target: '本地文档目录',
    result: '已完成',
    note: '执行了第一版文本提取与分类。',
  },
  {
    id: 'audit-003',
    time: '当前模式',
    action: '数据源访问',
    target: '数据库 / 文档 / Web源',
    result: 'read-only',
    note: '未开放写入、删除、改动客户原系统。',
  },
];

function StatCard({ label, value, subtle }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {subtle ? <div className="stat-trend neutral">{subtle}</div> : null}
    </div>
  );
}

export default function AuditPage() {
  const [sidebarSources, setSidebarSources] = useState(sourceItems);

  useEffect(() => {
    async function loadDatasources() {
      try {
        const response = await fetch(buildApiUrl('/api/datasources'));
        if (!response.ok) throw new Error('load datasources failed');
        const json = await response.json();
        const normalized = normalizeDatasourceResponse(json);
        if (normalized.items.length) setSidebarSources(normalized.items);
      } catch {
        // keep local fallback
      }
    }
    loadDatasources();
  }, []);

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/audit" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>审计日志</h2>
            <p>第一版先展示系统级只读访问痕迹与说明，后续可再接入更细粒度的请求追踪、用户标识和导出能力。</p>
          </div>
        </header>

        <section className="documents-layout">
          <section className="card stats-grid">
            <StatCard label="模式" value="read-only" subtle="全局保护" />
            <StatCard label="审计项" value={String(auditItems.length)} subtle="当前骨架页" />
            <StatCard label="写操作" value="0" subtle="默认禁用" />
          </section>

          <section className="card table-card">
            <div className="panel-header">
              <div>
                <h3>审计记录</h3>
                <p>当前先放系统级摘要记录，等后面再把真实请求日志或操作流水接进来。</p>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>动作</th>
                  <th>对象</th>
                  <th>结果</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {auditItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.time}</td>
                    <td>{item.action}</td>
                    <td>{item.target}</td>
                    <td><span className={`tag ${item.result === '只读成功' || item.result === '已完成' ? 'up-tag' : 'neutral-tag'}`}>{item.result}</span></td>
                    <td className="summary-cell">{item.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </section>
      </main>
    </div>
  );
}
