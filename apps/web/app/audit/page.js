'use client';

import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { buildApiUrl } from '../lib/config';
import { normalizeDatasourceResponse } from '../lib/types';
import { sourceItems } from '../lib/mock-data';

const auditLogs = [
  {
    id: 'audit-001',
    time: '2026-03-19 14:10',
    actor: '系统自动',
    action: '自动抓取',
    target: '品玩 OpenClaw 专题',
    result: '成功',
    note: '抓取 1 个网页并写入文档库。',
  },
  {
    id: 'audit-002',
    time: '2026-03-19 13:45',
    actor: '用户',
    action: '修改分组',
    target: '研究资料 A.pdf',
    result: '成功',
    note: '新增分组：脑健康。',
  },
  {
    id: 'audit-003',
    time: '2026-03-19 12:50',
    actor: '用户',
    action: '确认分类',
    target: '合同样本 B.docx',
    result: '成功',
    note: '业务分类确认：合同协议。',
  },
  {
    id: 'audit-004',
    time: '2026-03-18 18:40',
    actor: '系统自动',
    action: '生成报表',
    target: '合同风险汇总-晨会版',
    result: '成功',
    note: '输出 1 份 PPT 记录。',
  },
];

const reportReferences = [
  {
    id: 'ref-001',
    report: '经营周报-2026W12',
    document: '华东区域订单分析-近30天',
    datasource: 'ERP 订单库',
    referencedAt: '2026-03-19 09:20',
    note: '用于订单趋势和区域增长分析。',
  },
  {
    id: 'ref-002',
    report: '合同风险汇总-晨会版',
    document: '采购合同-条款复核',
    datasource: '合同文档库',
    referencedAt: '2026-03-18 18:40',
    note: '用于付款节点和违约责任复核。',
  },
  {
    id: 'ref-003',
    report: '客服热点静态页（近7天）',
    document: '客服工单聚合-本周',
    datasource: '客服采集任务',
    referencedAt: '2026-03-19 08:30',
    note: '用于展示投诉热点和待回访事项。',
  },
];

const staleDatasources = [
  {
    id: 'stale-001',
    name: '商城后台采集',
    lastCapturedAt: '2026-03-10 09:00',
    lastReferencedAt: '2025-12-15 11:20',
    suggestion: '近 3 个月未被报表引用，建议暂停采集或删除。',
  },
  {
    id: 'stale-002',
    name: '知识网站获取',
    lastCapturedAt: '2026-03-08 20:10',
    lastReferencedAt: '2025-12-02 16:00',
    suggestion: '近 3 个月未形成有效报表引用，建议降低频率或暂停。',
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
            <h2>审计中心</h2>
            <p>这里分两层看：操作留痕，以及报表中心对文档/数据的引用情况。</p>
          </div>
        </header>

        <section className="documents-layout">
          <section className="card stats-grid">
            <StatCard label="操作记录" value={String(auditLogs.length)} subtle="增删改查 / 自动抓取" />
            <StatCard label="引用记录" value={String(reportReferences.length)} subtle="报表引用文档 / 数据" />
            <StatCard label="低引用提醒" value={String(staleDatasources.length)} subtle="近3个月未被报表使用" />
          </section>

          <section className="card table-card">
            <div className="panel-header">
              <div>
                <h3>操作记录</h3>
                <p>保留增删改查和自动抓取记录，后续可继续细化到真实操作流水。</p>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>执行来源</th>
                  <th>动作</th>
                  <th>对象</th>
                  <th>结果</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((item) => (
                  <tr key={item.id}>
                    <td>{item.time}</td>
                    <td>{item.actor}</td>
                    <td>{item.action}</td>
                    <td>{item.target}</td>
                    <td><span className="tag up-tag">{item.result}</span></td>
                    <td className="summary-cell">{item.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card table-card">
            <div className="panel-header">
              <div>
                <h3>报表引用记录</h3>
                <p>展示报表中心引用了哪些文档和数据，后续可追踪到具体引用链。</p>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>报表</th>
                  <th>引用文档</th>
                  <th>来源数据</th>
                  <th>引用时间</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {reportReferences.map((item) => (
                  <tr key={item.id}>
                    <td>{item.report}</td>
                    <td>{item.document}</td>
                    <td>{item.datasource}</td>
                    <td>{item.referencedAt}</td>
                    <td className="summary-cell">{item.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card table-card">
            <div className="panel-header">
              <div>
                <h3>低引用提醒</h3>
                <p>持续 3 个月未被报表引用的数据源，建议暂停采集、降频或删除。</p>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>数据源</th>
                  <th>最近采集时间</th>
                  <th>最近引用时间</th>
                  <th>建议</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {staleDatasources.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.lastCapturedAt}</td>
                    <td>{item.lastReferencedAt}</td>
                    <td className="summary-cell">{item.suggestion}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="ghost-btn" type="button">暂停采集</button>
                        <button className="ghost-btn" type="button">删除</button>
                      </div>
                    </td>
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
