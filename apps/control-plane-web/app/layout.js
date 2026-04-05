import './globals.css';

export const metadata = {
  title: 'AI Data Platform Legacy Control Plane',
  description: 'Deprecated shared control-plane UI kept only as a migration notice.',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
        <main style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '32px',
          background: 'linear-gradient(180deg, #f5f7fb, #e8eef8)',
        }}>
          <section style={{
            width: 'min(760px, 100%)',
            borderRadius: '28px',
            border: '1px solid rgba(15, 23, 42, 0.08)',
            background: '#ffffff',
            boxShadow: '0 30px 80px rgba(15, 23, 42, 0.12)',
            padding: '32px',
          }}>
            <p style={{
              margin: '0 0 10px',
              color: '#d97706',
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              fontSize: '12px',
              fontWeight: 700,
            }}>
              Legacy Surface
            </p>
            <h1 style={{ margin: '0 0 14px', fontSize: '34px', color: '#0f172a' }}>
              Shared control plane has moved to home
            </h1>
            <p style={{ margin: 0, color: '#475569', lineHeight: 1.7 }}>
              This UI is frozen. Shared admin, shared model pool, and multi-project control-plane work now belong to the
              home repository. Keep ai-data-platform focused on the AI assistant app and the Windows client toolchain.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '24px' }}>
              <a href="http://127.0.0.1:3003/login" style={{
                borderRadius: '999px',
                border: '1px solid rgba(15, 23, 42, 0.08)',
                padding: '10px 14px',
                color: '#0f172a',
                textDecoration: 'none',
                background: '#f8fafc',
              }}>
                Open local home admin
              </a>
              <a href="https://ad.goods-editor.com/login" style={{
                borderRadius: '999px',
                border: '1px solid rgba(15, 23, 42, 0.08)',
                padding: '10px 14px',
                color: '#0f172a',
                textDecoration: 'none',
                background: '#f8fafc',
              }}>
                Open deployed home admin
              </a>
            </div>
            <p style={{ margin: '18px 0 0', color: '#475569', lineHeight: 1.7 }}>
              Boundary doc: <code>docs/APP_BOUNDARY_2026-04-05.md</code>
            </p>
          </section>
        </main>
      </body>
    </html>
  );
}
