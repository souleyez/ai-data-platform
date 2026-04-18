'use client';

import { useEffect, useMemo } from 'react';
import { getChunkErrorText, isChunkLoadError, reloadOnceForChunkError } from '../lib/chunk-error-recovery';

export default function DocumentsError({ error, reset }) {
  const details = useMemo(() => {
    if (!error) return 'unknown error';
    const chunkDetails = getChunkErrorText(error);
    if (chunkDetails) return chunkDetails;
    if (typeof error === 'string') return error;
    return [error.message, error.digest].filter(Boolean).join('\n');
  }, [error]);
  const chunkError = isChunkLoadError(error);

  useEffect(() => {
    console.error('documents page error', error);
    reloadOnceForChunkError(error);
  }, [error]);

  return (
    <div className="app-shell">
      <main className="main-panel">
        <section className="card documents-card" style={{ maxWidth: 760 }}>
          <div className="panel-header">
            <div>
              <h3>数据集加载异常</h3>
              <p>{chunkError ? '检测到静态资源加载超时，页面会自动重试一次；如果还失败，再复制下面的错误信息。' : '下面是当前前端异常信息，可以直接复制给我。'}</p>
            </div>
          </div>

          <textarea
            readOnly
            value={details}
            style={{
              width: '100%',
              minHeight: 120,
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#0f172a',
            }}
          />

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
            <button className="primary-btn" type="button" onClick={() => reset()}>
              重新加载
            </button>
            <button className="ghost-btn" type="button" onClick={() => navigator.clipboard?.writeText(details)}>
              复制报错
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
