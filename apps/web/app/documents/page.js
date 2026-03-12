'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { buildApiUrl } from '../lib/config';
import { sourceItems } from '../lib/mock-data';

function StatCard({ label, value, subtle }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {subtle ? <div className="stat-trend neutral">{subtle}</div> : null}
    </div>
  );
}

export default function DocumentsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [error, setError] = useState('');
  const [scanMessage, setScanMessage] = useState('');

  const loadDocuments = async () => {
    try {
      setError('');
      const response = await fetch(buildApiUrl('/api/documents'));
      if (!response.ok) throw new Error('load documents failed');
      const json = await response.json();
      setData(json);
    } catch {
      setError('文档接口暂时不可用');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const triggerScan = async () => {
    try {
      setScanLoading(true);
      setScanMessage('');
      const response = await fetch(buildApiUrl('/api/documents/scan'), {
        method: 'POST',
      });
      if (!response.ok) throw new Error('scan failed');
      const json = await response.json();
      setScanMessage(json.message || '扫描完成');
      await loadDocuments();
    } catch {
      setScanMessage('扫描触发失败，请稍后重试');
    } finally {
      setScanLoading(false);
    }
  };

  const categorySummary = useMemo(() => {
    if (!data?.byCategory) return [];
    return Object.entries(data.byCategory);
  }, [data]);

  const extensionSummary = useMemo(() => {
    if (!data?.byExtension) return [];
    return Object.entries(data.byExtension);
  }, [data]);

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sourceItems} />

      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>文档中心</h2>
            <p>管理本地扫描目录、查看文件分类结果，并为后续摘要、问答、索引做好准备。</p>
          </div>
          <div className="topbar-actions">
            <button className="ghost-btn" onClick={loadDocuments}>刷新</button>
            <button className="primary-btn" onClick={triggerScan} disabled={scanLoading}>
              {scanLoading ? '扫描中...' : '执行扫描'}
            </button>
          </div>
        </header>

        {loading ? <p>加载中…</p> : null}
        {error ? <p>{error}</p> : null}
        {scanMessage ? <div className="page-note">{scanMessage}</div> : null}

        {data ? (
          <section className="documents-layout">
            <section className="card stats-grid">
              <StatCard label="扫描目录" value={data.scanRoot} subtle={data.exists ? '目录可访问' : '目录不存在'} />
              <StatCard label="总文件数" value={String(data.totalFiles)} subtle="只读扫描" />
              <StatCard label="最近扫描" value={new Date(data.lastScanAt).toLocaleString()} subtle="骨架阶段" />
            </section>

            <section className="documents-grid">
              <section className="card documents-card">
                <div className="panel-header">
                  <div>
                    <h3>分类统计</h3>
                    <p>按文档类型快速了解当前目录构成</p>
                  </div>
                </div>
                <div className="summary-grid">
                  {categorySummary.map(([key, value]) => (
                    <div key={key} className="summary-item">
                      <div className="summary-key">{key}</div>
                      <div className="summary-value">{value}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="card documents-card">
                <div className="panel-header">
                  <div>
                    <h3>扩展名统计</h3>
                    <p>后续这里可以接入 PDF / Word / Excel 解析链路</p>
                  </div>
                </div>
                <div className="summary-grid">
                  {extensionSummary.map(([key, value]) => (
                    <div key={key} className="summary-item">
                      <div className="summary-key">{key}</div>
                      <div className="summary-value">{value}</div>
                    </div>
                  ))}
                </div>
              </section>
            </section>

            <section className="card table-card">
              <div className="panel-header">
                <div>
                  <h3>文件列表</h3>
                  <p>当前展示前 200 条扫描结果，后续将接摘要、标签、向量索引状态</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>文件名</th>
                    <th>分类</th>
                    <th>扩展名</th>
                    <th>路径</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.path}>
                      <td>{item.name}</td>
                      <td>{item.category}</td>
                      <td>{item.ext}</td>
                      <td className="path-cell">{item.path}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </section>
        ) : null}
      </main>
    </div>
  );
}
