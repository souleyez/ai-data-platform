'use client';

import { useEffect, useState } from 'react';
import { buildApiUrl } from '../../lib/config';

export default function DatasourceUploadPage({ params }) {
  const token = params?.token;
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError('');
        const response = await fetch(buildApiUrl(`/api/datasources/public/${encodeURIComponent(token)}`), { cache: 'no-store' });
        const json = await response.json();
        if (!response.ok) throw new Error(json?.error || '上传入口不可用');
        if (!active) return;
        setItem(json.item || null);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : '上传入口不可用');
      } finally {
        if (active) setLoading(false);
      }
    }
    if (token) load();
    return () => {
      active = false;
    };
  }, [token]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!files?.length) {
      setError('请选择至少一个文件。');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setMessage('');
      const formData = new FormData();
      formData.append('note', note);
      Array.from(files).forEach((file) => formData.append('files', file));

      const response = await fetch(buildApiUrl(`/api/datasources/public/${encodeURIComponent(token)}/upload`), {
        method: 'POST',
        body: formData,
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || '提交失败');
      setMessage(json?.message || '资料已提交。');
      setFiles(null);
      event.currentTarget.reset();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f5f3ec', padding: '48px 20px' }}>
      <section style={{ maxWidth: 760, margin: '0 auto', background: '#fffdf7', border: '1px solid #d8d0bf', borderRadius: 24, padding: 28, boxShadow: '0 18px 48px rgba(34, 27, 17, 0.08)' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7a6d59' }}>External Upload</div>
          <h1 style={{ margin: '8px 0 10px', fontSize: 32, lineHeight: 1.1, color: '#1f1b16' }}>{item?.name || '资料提交入口'}</h1>
          <p style={{ margin: 0, color: '#5a5145', lineHeight: 1.7 }}>
            外部用户可在此直接提交资料。系统会自动入库，并按目标知识库范围优先完成自动分组与后续深度解析。
          </p>
        </div>

        {loading ? <p>加载中…</p> : null}
        {error ? <p style={{ color: '#8b2d2d', background: '#fff1f1', borderRadius: 12, padding: '12px 14px' }}>{error}</p> : null}
        {message ? <p style={{ color: '#245c33', background: '#eefaf0', borderRadius: 12, padding: '12px 14px' }}>{message}</p> : null}

        {item ? (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {(item.targetLibraries || []).map((library) => (
                <span key={library.key} style={{ borderRadius: 999, background: '#efe7d4', color: '#5c4b2f', padding: '6px 10px', fontSize: 13 }}>
                  {library.label}
                </span>
              ))}
            </div>

            {item.notes ? (
              <div style={{ marginBottom: 20, padding: 14, borderRadius: 16, background: '#f4f0e5', color: '#4f473a', lineHeight: 1.7 }}>
                {item.notes}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ fontWeight: 600, color: '#342d24' }}>选择文件</span>
                <input type="file" multiple onChange={(event) => setFiles(event.target.files)} />
              </label>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ fontWeight: 600, color: '#342d24' }}>补充说明</span>
                <textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="可选。可补充项目背景、资料来源、提交说明等。" style={{ borderRadius: 14, border: '1px solid #cfc4ac', padding: 12, font: 'inherit', resize: 'vertical' }} />
              </label>
              <button type="submit" disabled={submitting} style={{ border: 0, borderRadius: 14, padding: '14px 18px', background: '#2f5e41', color: '#fffdf7', fontWeight: 700, cursor: 'pointer' }}>
                {submitting ? '提交中…' : '提交资料'}
              </button>
            </form>
          </>
        ) : null}
      </section>
    </main>
  );
}
