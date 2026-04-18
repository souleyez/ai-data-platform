export const CHUNK_RELOAD_GUARD_KEY = 'aidp_chunk_reload_guard_v1';

function collectChunkErrorText(value, seen = new Set()) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '';
  seen.add(value);

  const parts = [];
  if (value instanceof Error) {
    parts.push(value.name || '', value.message || '', value.stack || '');
  } else {
    parts.push(value.name || '', value.message || '', value.reason || '', value.type || '');
  }

  if (value.cause) {
    parts.push(collectChunkErrorText(value.cause, seen));
  }

  if (value.error) {
    parts.push(collectChunkErrorText(value.error, seen));
  }

  if (value.target && value.target.src) {
    parts.push(String(value.target.src));
  }

  if (Array.isArray(value.errors)) {
    parts.push(value.errors.map((item) => collectChunkErrorText(item, seen)).join(' '));
  }

  return parts.filter(Boolean).join(' ');
}

export function getChunkErrorText(value) {
  return collectChunkErrorText(value).trim();
}

export function isChunkLoadError(value) {
  const raw = getChunkErrorText(value).toLowerCase();
  if (!raw) return false;

  return raw.includes('chunkloaderror')
    || raw.includes('loading chunk')
    || raw.includes('css chunk')
    || raw.includes('/_next/static/chunks/')
    || raw.includes('/_next/static/css/')
    || raw.includes('importing a module script failed')
    || (raw.includes('chunk') && raw.includes('timeout'));
}

export function reloadOnceForChunkError(value) {
  if (typeof window === 'undefined' || !isChunkLoadError(value)) {
    return false;
  }

  const currentUrl = window.location.pathname + window.location.search + window.location.hash;
  try {
    if (window.sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === currentUrl) {
      return false;
    }
    window.sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, currentUrl);
  } catch (error) {}

  window.location.reload();
  return true;
}

export function clearChunkReloadGuard() {
  if (typeof window === 'undefined') {
    return;
  }

  const currentUrl = window.location.pathname + window.location.search + window.location.hash;
  try {
    if (window.sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === currentUrl) {
      window.sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY);
    }
  } catch (error) {}
}

export function buildChunkRecoveryScript() {
  return `
    (function () {
      try {
        var CHUNK_RELOAD_GUARD_KEY = ${JSON.stringify(CHUNK_RELOAD_GUARD_KEY)};
        var currentUrl = window.location.pathname + window.location.search + window.location.hash;

        function collectChunkErrorText(value, seen) {
          if (!value) return '';
          if (typeof value === 'string') return value;
          if (typeof value !== 'object') return String(value);
          if (seen.indexOf(value) >= 0) return '';
          seen.push(value);

          var parts = [];
          if (value instanceof Error) {
            parts.push(value.name || '', value.message || '', value.stack || '');
          } else {
            parts.push(value.name || '', value.message || '', value.reason || '', value.type || '');
          }

          if (value.cause) {
            parts.push(collectChunkErrorText(value.cause, seen));
          }

          if (value.error) {
            parts.push(collectChunkErrorText(value.error, seen));
          }

          if (value.target && value.target.src) {
            parts.push(String(value.target.src));
          }

          if (Array.isArray(value.errors)) {
            parts.push(value.errors.map(function (item) {
              return collectChunkErrorText(item, seen);
            }).join(' '));
          }

          return parts.filter(Boolean).join(' ');
        }

        function isChunkLoadError(value) {
          var raw = collectChunkErrorText(value, []).toLowerCase();
          if (!raw) return false;

          return raw.includes('chunkloaderror')
            || raw.includes('loading chunk')
            || raw.includes('css chunk')
            || raw.includes('/_next/static/chunks/')
            || raw.includes('/_next/static/css/')
            || raw.includes('importing a module script failed')
            || (raw.includes('chunk') && raw.includes('timeout'));
        }

        function reloadOnceForChunkError(value) {
          if (!isChunkLoadError(value)) {
            return;
          }
          try {
            if (window.sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === currentUrl) {
              return;
            }
            window.sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, currentUrl);
          } catch (error) {}
          window.location.reload();
        }

        window.addEventListener('error', function (event) {
          reloadOnceForChunkError(event && (event.error || event.message || event));
        }, true);

        window.addEventListener('unhandledrejection', function (event) {
          reloadOnceForChunkError(event && (event.reason || event));
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
  `;
}
