'use client';

import { useEffect, useMemo } from 'react';

export default function DocumentsError({ error, reset }) {
  const details = useMemo(() => {
    if (!error) return 'unknown error';
    if (typeof error === 'string') return error;
    return [error.message, error.digest].filter(Boolean).join('\n');
  }, [error]);

  useEffect(() => {
    console.error('documents page error', error);
  }, [error]);

  return (
    <div className="app-shell">
      <main className="main-panel">
        <section className="card documents-card" style={{ maxWidth: 760 }}>
          <div className="panel-header">
            <div>
              <h3>文档中心加载异常</h3>
              <p>下面是当前前端异常信息，可以直接复制给我。</p>
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
