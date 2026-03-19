'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import { buildApiUrl } from '../../lib/config';
import { normalizeDatasourceResponse, normalizeDocumentDetailResponse } from '../../lib/types';
import { sourceItems } from '../../lib/mock-data';
import { DEFAULT_CUSTOM_DOCUMENT_CATEGORIES } from '../../lib/document-taxonomy';

const BIZ_CATEGORY_LABELS = {
  paper: '学术论文',
  contract: '合同协议',
  daily: '工作日报',
  invoice: '发票凭据',
  order: '订单分析',
  service: '客服采集',
  inventory: '库存监控',
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
  const [groupInput, setGroupInput] = useState('');
  const [groupSaving, setGroupSaving] = useState(false);
  const [notice, setNotice] = useState('');

  async function loadDetail() {
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

    loadDetail();
    loadDatasources();
  }, [params.id]);

  const currentGroups = useMemo(() => data?.confirmedGroups || data?.groups || [], [data]);
  const suggestedGroups = useMemo(() => {
    const available = data?.groups || [];
    return available.filter((group) => !currentGroups.includes(group));
  }, [data, currentGroups]);
  const allKnownGroups = useMemo(() => {
    const defaults = DEFAULT_CUSTOM_DOCUMENT_CATEGORIES.map((item) => item.key);
    return [...new Set([...defaults, ...(data?.groups || []), ...(data?.confirmedGroups || [])])];
  }, [data]);

  const saveGroups = async (groups) => {
    setGroupSaving(true);
    setNotice('');
    try {
      const response = await fetch(buildApiUrl('/api/documents/groups'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: params.id, groups }] }),
      });
      const raw = await response.text();
      const json = raw ? JSON.parse(raw) : {};
      if (!response.ok) throw new Error(json?.error || raw || 'save groups failed');
      setNotice(json?.message || '分组已保存');
      await loadDetail();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '分组保存失败');
    } finally {
      setGroupSaving(false);
    }
  };

  const addGroup = async () => {
    const next = String(groupInput || '').trim();
    if (!next) return;
    await saveGroups([...new Set([...currentGroups, next])]);
    setGroupInput('');
  };

  const removeGroup = async (group) => {
    await saveGroups(currentGroups.filter((item) => item !== group));
  };

  const acceptSuggestedGroups = async () => {
    if (!suggestedGroups.length) return;
    await saveGroups([...new Set([...currentGroups, ...suggestedGroups])]);
  };

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/documents" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>文档详情</h2>
            <p>查看单个文档的分类、分组、归类依据、结构化字段、摘要与摘录。</p>
          </div>
          <div className="topbar-actions">
            <a href="/documents" className="ghost-btn back-link">返回文档中心</a>
          </div>
        </header>

        {error ? <p>{error}</p> : null}
        {notice ? <div className="page-note">{notice}</div> : null}
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
              <DetailCard title="当前分组" subtitle="一份资料可属于多个分组。">
                <div className="message-refs" style={{ gap: 8 }}>
                  {currentGroups.length ? currentGroups.map((group) => (
                    <span key={group} className="ref-chip">
                      {group}
                      <button className="ghost-btn" style={{ marginLeft: 8 }} onClick={() => removeGroup(group)} disabled={groupSaving}>移除</button>
                    </span>
                  )) : <div className="page-note" style={{ marginBottom: 0 }}>当前还没有已确认分组。</div>}
                </div>
              </DetailCard>

              <DetailCard title="AI 建议分组" subtitle="可直接一键接纳。">
                <div className="message-refs" style={{ gap: 8 }}>
                  {suggestedGroups.length ? suggestedGroups.map((group) => <span key={group} className="source-chip">{group}</span>) : <span className="source-chip">暂无新增建议</span>}
                </div>
                <div style={{ marginTop: 12 }}>
                  <button className="primary-btn" onClick={acceptSuggestedGroups} disabled={!suggestedGroups.length || groupSaving}>接纳建议分组</button>
                </div>
              </DetailCard>

              <DetailCard title="手动增加分组" subtitle="支持补一个自定义分组。">
                <input className="filter-input" value={groupInput} onChange={(event) => setGroupInput(event.target.value)} placeholder={`例如：${allKnownGroups[0] || '脑健康'}`} />
                <div style={{ marginTop: 12 }}>
                  <button className="primary-btn" onClick={addGroup} disabled={!groupInput.trim() || groupSaving}>添加分组</button>
                </div>
              </DetailCard>
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
                  <div className="page-note" style={{ marginBottom: 0 }}>当前未明确命中目录绑定，归类结果来自系统规则推断。</div>
                )}
              </DetailCard>

              <DetailCard title="业务结果" subtitle="不同类型文档会显示不同的关键字段。">
                <div className="message-ref-list">
                  <div className="message-ref-item"><strong>风险等级</strong><span>{data.riskLevel || '-'}</span></div>
                  <div className="message-ref-item"><strong>主题标签</strong><span>{data.topicTags?.join('、') || '-'}</span></div>
                  <div className="message-ref-item"><strong>建议分组</strong><span>{(data.groups || []).join('、') || '-'}</span></div>
                  <div className="message-ref-item"><strong>合同编号</strong><span>{data.contractFields?.contractNo || '-'}</span></div>
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
