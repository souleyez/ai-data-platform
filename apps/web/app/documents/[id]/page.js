'use client';

import { useEffect, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import { buildApiUrl } from '../../lib/config';
import { sourceItems } from '../../lib/mock-data';

export default function DocumentDetailPage({ params }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(buildApiUrl(`/api/documents/${params.id}`));
        if (!response.ok) throw new Error('load detail failed');
        const json = await response.json();
        setData(json.item);
      } catch {
        setError('文档详情加载失败');
      }
    }
    load();
  }, [params.id]);

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sourceItems} />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>文档详情</h2>
            <p>查看单个文档的基础解析结果与摘要。</p>
          </div>
        </header>

        {error ? <p>{error}</p> : null}
        {data ? (
          <section className="documents-layout">
            <section className="card table-card">
              <div className="panel-header"><div><h3>{data.name}</h3><p>{data.path}</p></div></div>
              <table>
                <tbody>
                  <tr><th>分类</th><td>{data.category}</td></tr>
                  <tr><th>扩展名</th><td>{data.ext}</td></tr>
                  <tr><th>解析状态</th><td>{data.parseStatus}</td></tr>
                  <tr><th>提取字符数</th><td>{data.extractedChars}</td></tr>
                  <tr><th>摘要</th><td className="summary-cell">{data.summary}</td></tr>
                </tbody>
              </table>
            </section>
          </section>
        ) : null}
      </main>
    </div>
  );
}
