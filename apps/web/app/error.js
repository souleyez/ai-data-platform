'use client';

import { useEffect, useMemo } from 'react';
import { getChunkErrorText, isChunkLoadError, reloadOnceForChunkError } from './lib/chunk-error-recovery';

export default function GlobalError({ error, reset }) {
  const details = useMemo(() => {
    if (!error) return 'Unknown error';
    const chunkDetails = getChunkErrorText(error);
    if (chunkDetails) return chunkDetails;
    if (error instanceof Error) {
      return `${error.name}: ${error.message}\n\n${error.stack || ''}`.trim();
    }
    return String(error);
  }, [error]);
  const chunkError = isChunkLoadError(error);

  useEffect(() => {
    console.error('Global app error:', error);
    reloadOnceForChunkError(error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: '"Microsoft YaHei", sans-serif', background: '#0b1120', color: '#e2e8f0' }}>
        <main style={{ maxWidth: 960, margin: '48px auto', padding: '0 20px' }}>
          <section style={{ background: '#111827', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 20, padding: 24, boxShadow: '0 18px 42px rgba(2,6,23,0.42)' }}>
            <h1 style={{ marginTop: 0 }}>页面运行异常</h1>
            <p style={{ color: '#94a3b8', lineHeight: 1.7 }}>
              {chunkError
                ? '检测到前端静态资源加载超时，页面会优先自动重试一次；如果仍然失败，再手动点“重新加载”。'
                : '当前页面已拦截前端异常。先点“重新加载”重试；如果还失败，直接复制下面的错误信息给我。'}
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
                style={{ borderRadius: 12, padding: '10px 16px', border: '1px solid rgba(148,163,184,0.28)', background: '#0f172a', color: '#e2e8f0', cursor: 'pointer' }}
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
