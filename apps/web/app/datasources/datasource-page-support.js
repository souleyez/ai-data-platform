import { sourceItems } from '../lib/mock-data';

export const EMPTY_FORM = {
  id: '',
  name: '',
  kind: 'web_public',
  authMode: 'none',
  scheduleKind: 'manual',
  maxItemsPerRun: '20',
  runAfterSave: false,
  targetKeys: [],
  url: '',
  focus: '',
  notes: '',
  keywords: '',
  siteHints: '',
  credentialId: '',
  credentialLabel: '',
  credentialOrigin: '',
  credentialNotes: '',
  credentialUsername: '',
  credentialPassword: '',
  credentialToken: '',
  credentialConnectionString: '',
  credentialCookies: '',
  credentialHeaders: '',
};

export const DEFAULT_MANAGED_META = {
  total: 0,
  active: 0,
  paused: 0,
  errors: 0,
  latestRunAt: '',
};

export const KIND_LABELS = {
  web_public: '公开网页',
  web_login: '登录网页',
  web_discovery: '关联发现',
  database: '数据库',
  erp: 'ERP后台',
  upload_public: '外部资料上传',
  local_directory: '本机目录',
};

export const AUTH_LABELS = {
  none: '无需认证',
  credential: '账号密码',
  manual_session: '手动会话',
  database_password: '数据库认证',
  api_token: 'API Token',
};

export const STATUS_LABELS = {
  active: '运行中',
  paused: '已暂停',
  draft: '草稿',
  error: '异常',
};

export const RUN_STATUS_LABELS = {
  running: '执行中',
  success: '成功',
  partial: '部分完成',
  failed: '失败',
};

export const SCHEDULE_LABELS = {
  manual: '手动',
  daily: '每日',
  weekly: '每周',
};

export function formatDateTime(value) {
  if (!value) return '暂无';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatRelative(value) {
  if (!value) return '暂无';
  const delta = Date.now() - new Date(value).getTime();
  if (Number.isNaN(delta)) return String(value);
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  return `${days} 天前`;
}

export function splitValues(value) {
  return String(value || '')
    .split(/[,\n，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseHeaders(value) {
  const lines = String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return Object.fromEntries(
    lines
      .map((line) => line.split(':'))
      .filter((parts) => parts.length >= 2)
      .map(([key, ...rest]) => [key.trim(), rest.join(':').trim()])
      .filter(([key, entry]) => key && entry),
  );
}

function toTargetKeyString(items) {
  return (items || []).map((item) => item.key).filter(Boolean);
}

export function buildSidebarSources(managedItems, legacyItems) {
  const normalizedManaged = (managedItems || []).map((item) => ({
    name: item.name,
    status: item.status === 'active' ? 'success' : item.status === 'error' ? 'warning' : 'idle',
  }));
  if (normalizedManaged.length) return normalizedManaged;
  return sourceItems.concat(
    (legacyItems || []).slice(0, 4).map((item) => ({
      name: item.name,
      status: item.status === 'connected' ? 'success' : item.status === 'warning' ? 'warning' : 'idle',
    })),
  );
}

export function buildFormFromDefinition(item) {
  const kind = item.kind || 'web_public';
  return {
    ...EMPTY_FORM,
    id: item.id || '',
    name: item.name || '',
    kind,
    authMode: kind === 'local_directory' ? 'none' : (item.authMode || 'none'),
    scheduleKind: item.schedule?.kind || 'manual',
    maxItemsPerRun: String(item.schedule?.maxItemsPerRun || 20),
    targetKeys: toTargetKeyString(item.targetLibraries),
    url: String(kind === 'local_directory' ? (item.config?.path || item.config?.url || '') : (item.config?.url || item.config?.baseUrl || '')),
    focus: String(item.config?.focus || ''),
    notes: String(item.notes || item.config?.notes || ''),
    keywords: Array.isArray(item.config?.keywords) ? item.config.keywords.join('，') : '',
    siteHints: Array.isArray(item.config?.siteHints) ? item.config.siteHints.join('，') : '',
    credentialId: String(item.credentialRef?.id || ''),
    credentialLabel: String(item.credentialRef?.label || ''),
    credentialOrigin: String(item.credentialRef?.origin || ''),
  };
}

export function buildFormFromDraft(draft) {
  const kind = draft.kind || 'web_public';
  return {
    ...EMPTY_FORM,
    name: draft.name || '',
    kind,
    authMode: kind === 'local_directory' ? 'none' : (draft.authMode || 'none'),
    scheduleKind: draft.schedule?.kind || 'manual',
    maxItemsPerRun: String(draft.schedule?.maxItemsPerRun || 20),
    targetKeys: toTargetKeyString(draft.targetLibraries),
    url: String(kind === 'local_directory' ? (draft.config?.path || draft.config?.url || '') : (draft.config?.url || '')),
    focus: String(draft.config?.focus || ''),
    notes: String(draft.notes || draft.config?.notes || ''),
    keywords: Array.isArray(draft.config?.keywords) ? draft.config.keywords.join('，') : '',
    siteHints: Array.isArray(draft.config?.siteHints) ? draft.config.siteHints.join('，') : '',
  };
}

export function buildCredentialSecret(form) {
  return {
    username: form.credentialUsername.trim(),
    password: form.credentialPassword.trim(),
    token: form.credentialToken.trim(),
    connectionString: form.credentialConnectionString.trim(),
    cookies: form.credentialCookies.trim(),
    headers: parseHeaders(form.credentialHeaders),
  };
}

export function hasCredentialSecret(secret) {
  return Boolean(
    secret.username ||
      secret.password ||
      secret.token ||
      secret.connectionString ||
      secret.cookies ||
      (secret.headers && Object.keys(secret.headers).length),
  );
}

export function buildDatasourcePayload({ currentForm, libraries, currentStatus, credentialRef }) {
  const libraryMap = new Map((libraries || []).map((item) => [item.key, item]));
  const targetLibraries = (currentForm.targetKeys || [])
    .map((key, index) => {
      const library = libraryMap.get(key);
      if (!library) return null;
      return {
        key: library.key,
        label: library.label,
        mode: index === 0 ? 'primary' : 'secondary',
      };
    })
    .filter(Boolean);

  const config = currentForm.kind === 'local_directory'
    ? {
        path: currentForm.url.trim(),
        notes: currentForm.notes.trim(),
      }
    : {
        url: currentForm.url.trim(),
        focus: currentForm.focus.trim(),
        notes: currentForm.notes.trim(),
        keywords: splitValues(currentForm.keywords),
        siteHints: splitValues(currentForm.siteHints),
      };

  return {
    id: currentForm.id || undefined,
    name: currentForm.name.trim(),
    kind: currentForm.kind,
    status: currentForm.id ? currentStatus || 'draft' : 'draft',
    authMode: currentForm.kind === 'local_directory' ? 'none' : currentForm.authMode,
    targetLibraries,
    schedule: {
      kind: currentForm.scheduleKind,
      timezone: 'Asia/Shanghai',
      maxItemsPerRun: Number(currentForm.maxItemsPerRun || 20) || 20,
    },
    credentialRef,
    config,
    notes: currentForm.notes.trim(),
  };
}

function legacyCopyText(value) {
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }

  document.body.removeChild(textarea);
  return copied;
}

export async function copyText(value) {
  const text = String(value || '').trim();
  if (!text) return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy copy
    }
  }

  return legacyCopyText(text);
}

export function buildRunResultItems(run) {
  if (run?.documentSummaries?.length) return run.documentSummaries;
  if (run?.documentLabels?.length) {
    return run.documentLabels.map((label, index) => ({
      id: `${run.id || 'run'}-label-${index}`,
      label,
      summary: '',
    }));
  }
  return [];
}

export function buildTelemetryItems(entry) {
  return [
    { key: 'grouped', label: '自动分组', value: Number(entry?.groupedCount || 0) },
    { key: 'ungrouped', label: '未分组', value: Number(entry?.ungroupedCount || 0) },
    { key: 'skipped', label: '跳过', value: Number(entry?.skippedCount || 0) },
    { key: 'unsupported', label: '过滤/不支持', value: Number(entry?.unsupportedCount || 0) },
    { key: 'failed', label: '失败', value: Number(entry?.failedCount || 0) },
  ].filter((item) => item.value > 0);
}

export function StatCard({ label, value, subtle }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {subtle ? <div className="stat-trend neutral">{subtle}</div> : null}
    </div>
  );
}

export function DatasourceTag({ children, tone = 'neutral-tag' }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

export function RequiredLabel({ children }) {
  return (
    <span>
      {children}
      <span style={{ color: '#b42318', marginLeft: 4 }}>*</span>
    </span>
  );
}
