'use client';

import { useEffect, useMemo } from 'react';

export default function GlobalError({ error, reset }) {
  const details = useMemo(() => {
    if (!error) return 'Unknown error';
    if (error instanceof Error) {
      return `${error.name}: ${error.message}\n\n${error.stack || ''}`.trim();
    }
    return String(error);
  }, [error]);

  useEffect(() => {
    console.error('Global app error:', error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: '"Microsoft YaHei", sans-serif', background: '#f8fafc', color: '#16202f' }}>
        <main style={{ maxWidth: 960, margin: '48px auto', padding: '0 20px' }}>
          <section style={{ background: '#fff', border: '1px solid #dbe3ef', borderRadius: 20, padding: 24, boxShadow: '0 12px 30px rgba(15,23,42,0.08)' }}>
            <h1 style={{ marginTop: 0 }}>页面运行异常</h1>
            <p style={{ color: '#475569', lineHeight: 1.7 }}>
              当前页面已拦截前端异常。先点“重新加载”重试；如果还失败，直接复制下面的错误信息给我。
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => reset()}
                style={{ border: 0, borderRadius: 12, padding: '10px 16px', background: '#2563eb', color: '#fff', cursor: 'pointer' }}
              >
                重新加载
              </button>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(details)}
                style={{ borderRadius: 12, padding: '10px 16px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
              >
                复制报错
              </button>
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#0f172a', color: '#e2e8f0', padding: 16, borderRadius: 16, overflow: 'auto' }}>
              {details}
            </pre>
          </section>
        </main>
      </body>
    </html>
  );
}
