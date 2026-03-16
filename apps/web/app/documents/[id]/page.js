'use client';

import { useEffect, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import { buildApiUrl } from '../../lib/config';
import { normalizeDatasourceResponse, normalizeDocumentDetailResponse } from '../../lib/types';
import { sourceItems } from '../../lib/mock-data';

const BIZ_CATEGORY_LABELS = {
  technical: '技术类',
  contract: '合同类',
  report: '日报类',
  paper: '论文类',
  other: '其他类',
};

function DetailCard({ title, subtitle, children }) {
  return (
    <section className="card documents-card">
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function DocumentDetailPage({ params }) {
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(buildApiUrl(`/api/documents/${params.id}`));
        if (!response.ok) throw new Error('load detail failed');
        const json = await response.json();
        const normalized = normalizeDocumentDetailResponse(json);
        setData(normalized.item);
        setMeta(normalized.meta);
      } catch {
        setError('文档详情加载失败');
      }
    }

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

    load();
    loadDatasources();
  }, [params.id]);

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/documents" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>文档详情</h2>
            <p>查看单个文档的业务分类、归类依据、结构化字段、摘要与摘录。</p>
          </div>
          <div className="topbar-actions">
            <a href="/documents" className="ghost-btn back-link">返回文档中心</a>
          </div>
        </header>

        {error ? <p>{error}</p> : null}
        {data ? (
          <section className="documents-layout">
            <section className="card table-card">
              <div className="panel-header">
                <div>
                  <h3>{data.name}</h3>
                  <p>{data.path}</p>
                </div>
              </div>
              <div className="message-refs">
                <span className="source-chip">业务分类：{BIZ_CATEGORY_LABELS[meta?.bizCategory] || meta?.bizCategory || '-'}</span>
                <span className="source-chip">解析分类：{meta?.category || '-'}</span>
                <span className="source-chip">解析状态：{meta?.parseStatus || '-'}</span>
                <span className="source-chip">扩展名：{data.ext}</span>
                <span className="source-chip">提取字符：{data.extractedChars}</span>
              </div>
            </section>

            <section className="documents-grid three-columns">
              <DetailCard title="归类依据" subtitle="当前按目录绑定优先，其次才回退到规则推断。">
                {meta?.matchedFolders?.length ? (
                  <div className="message-ref-list">
                    {meta.matchedFolders.map((item) => (
                      <div key={item.key} className="message-ref-item">
                        <strong>{item.label}</strong>
                        <span>{item.folders.join('、')}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="page-note" style={{ marginBottom: 0 }}>
                    当前未明确命中目录绑定，归类结果来自系统规则推断。
                  </div>
                )}
              </DetailCard>

              <DetailCard title="业务结果" subtitle="不同类型文档会显示不同的关键字段。">
                <div className="message-ref-list">
                  <div className="message-ref-item"><strong>风险等级</strong><span>{data.riskLevel || '-'}</span></div>
                  <div className="message-ref-item"><strong>主题标签</strong><span>{data.topicTags?.join('、') || '-'}</span></div>
                  <div className="message-ref-item"><strong>合同编号</strong><span>{data.contractFields?.contractNo || '-'}</span></div>
                  <div className="message-ref-item"><strong>合同金额</strong><span>{data.contractFields?.amount || '-'}</span></div>
                </div>
              </DetailCard>

              <DetailCard title="解析状态" subtitle="当前只读解析链路的基础状态。">
                <div className="message-ref-list">
                  <div className="message-ref-item"><strong>解析状态</strong><span>{data.parseStatus}</span></div>
                  <div className="message-ref-item"><strong>扩展名</strong><span>{data.ext}</span></div>
                  <div className="message-ref-item"><strong>提取字符数</strong><span>{data.extractedChars}</span></div>
                </div>
              </DetailCard>
            </section>

            <section className="documents-grid">
              <DetailCard title="结构化字段" subtitle="当前主要对合同类做了首版结构化字段抽取。">
                <table>
                  <tbody>
                    <tr><th>合同编号</th><td>{data.contractFields?.contractNo || '-'}</td></tr>
                    <tr><th>合同金额</th><td>{data.contractFields?.amount || '-'}</td></tr>
                    <tr><th>付款条款</th><td className="summary-cell">{data.contractFields?.paymentTerms || '-'}</td></tr>
                    <tr><th>期限</th><td className="summary-cell">{data.contractFields?.duration || '-'}</td></tr>
                  </tbody>
                </table>
              </DetailCard>

              <DetailCard title="内容摘要与摘录" subtitle="用于问答、引用与后续结构化提炼。">
                <table>
                  <tbody>
                    <tr><th>摘要</th><td className="summary-cell">{data.summary}</td></tr>
                    <tr><th>原文摘录</th><td className="summary-cell">{data.excerpt}</td></tr>
                  </tbody>
                </table>
              </DetailCard>
            </section>
          </section>
        ) : null}
      </main>
    </div>
  );
}
