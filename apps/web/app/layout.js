import './globals.css';

export const metadata = {
  title: 'AI智能助手',
  description: '个人知识库，采编写一站式解决',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning data-theme="dark" style={{ colorScheme: 'dark' }}>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var CHUNK_RELOAD_GUARD_KEY = 'aidp_chunk_reload_guard_v1';
                  var currentUrl = window.location.pathname + window.location.search + window.location.hash;

                  function isChunkLoadError(value) {
                    var raw = '';
                    if (!value) return false;
                    if (typeof value === 'string') {
                      raw = value;
                    } else if (value instanceof Error) {
                      raw = String(value.name || '') + ' ' + String(value.message || '');
                    } else if (typeof value === 'object') {
                      raw = String(value.name || '') + ' ' + String(value.message || '') + ' ' + String(value.reason || '');
                    } else {
                      raw = String(value);
                    }
                    raw = raw.toLowerCase();
                    return raw.includes('chunkloaderror')
                      || (raw.includes('loading chunk') && raw.includes('failed'))
                      || (raw.includes('/_next/static/chunks/') && raw.includes('failed'));
                  }

                  function reloadOnceForChunkError() {
                    try {
                      if (window.sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === currentUrl) {
                        return;
                      }
                      window.sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, currentUrl);
                    } catch (error) {}
                    window.location.reload();
                  }

                  window.addEventListener('error', function (event) {
                    if (isChunkLoadError(event && (event.error || event.message))) {
                      reloadOnceForChunkError();
                    }
                  }, true);

                  window.addEventListener('unhandledrejection', function (event) {
                    if (isChunkLoadError(event && event.reason)) {
                      reloadOnceForChunkError();
                    }
                  });

                  window.addEventListener('load', function () {
                    try {
                      if (window.sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === currentUrl) {
                        window.sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY);
                      }
                    } catch (error) {}
                  }, { once: true });

                  localStorage.removeItem('aidp_theme_mode_v1');
                  document.documentElement.dataset.theme = 'dark';
                  document.documentElement.style.colorScheme = 'dark';
                } catch (error) {}
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
