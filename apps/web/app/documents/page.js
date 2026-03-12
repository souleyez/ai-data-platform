'use client';

import { useEffect, useState } from 'react';
import { buildApiUrl } from '../lib/config';

export default function DocumentsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(buildApiUrl('/api/documents'));
        if (!response.ok) throw new Error('load documents failed');
        const json = await response.json();
        setData(json);
      } catch {
        setError('文档接口暂时不可用');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif' }}>
      <h1>文档中心</h1>
      <p>当前页面已开始接独立 API：读取 `/api/documents` 的扫描结果。</p>

      {loading ? <p>加载中…</p> : null}
      {error ? <p>{error}</p> : null}

      {data ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <strong>扫描目录：</strong> {data.scanRoot}
          </div>
          <div>
            <strong>总文件数：</strong> {data.totalFiles}
          </div>
          <div>
            <strong>按扩展名统计：</strong>
            <pre>{JSON.stringify(data.byExtension, null, 2)}</pre>
          </div>
          <div>
            <strong>文件列表：</strong>
            <pre>{JSON.stringify(data.items, null, 2)}</pre>
          </div>
        </div>
      ) : null}
    </main>
  );
}
