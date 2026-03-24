'use client';

export const GENERATED_REPORTS_STORAGE_KEY = 'aidp-generated-reports-v4';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createGeneratedReportId() {
  return `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createGeneratedReport({ message }) {
  const createdAt = new Date().toISOString();
  const hasTable = Boolean(message?.table);
  const title =
    message?.table?.title ||
    message?.title ||
    (hasTable ? '生成表格报表' : '生成静态报表');

  return {
    id: createGeneratedReportId(),
    title,
    kind: hasTable ? 'table' : 'static',
    format: hasTable ? 'csv' : 'html',
    source: 'chat',
    createdAt,
    content: message?.content || '',
    table: message?.table || null,
  };
}

export function loadGeneratedReports() {
  if (typeof window === 'undefined') return [];
  try {
    window.localStorage.removeItem('aidp-generated-reports-v1');
    window.localStorage.removeItem('aidp-generated-reports-v2');
    window.localStorage.removeItem('aidp-generated-reports-v3');
    const raw = window.localStorage.getItem(GENERATED_REPORTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      id: item?.id || createGeneratedReportId(),
      title: item?.title || '生成报表',
      kind: item?.kind || (item?.table ? 'table' : 'static'),
      format: item?.format || (item?.table ? 'csv' : 'html'),
      source: item?.source || 'chat',
      createdAt: item?.createdAt || new Date().toISOString(),
      content: item?.table ? '' : (item?.content || ''),
      table: item?.table || null,
      downloadUrl: item?.downloadUrl || '',
    }));
  } catch {
    return [];
  }
}

export function saveGeneratedReports(items) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GENERATED_REPORTS_STORAGE_KEY, JSON.stringify(items || []));
  } catch {
    // ignore storage failures
  }
}

export function buildGeneratedReportLink(id) {
  if (typeof window === 'undefined') return `/reports?generated=${encodeURIComponent(id)}`;
  return `${window.location.origin}/reports?generated=${encodeURIComponent(id)}`;
}

export function getGeneratedReportActionLabel(item) {
  if (!item) return '查看';
  if (item.kind === 'table') return '下载表格';
  if (item.format === 'ppt' || item.format === 'pdf') return '下载文件';
  return '复制链接';
}

function buildCsv(table) {
  const rows = [table?.columns || [], ...(table?.rows || [])];
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell ?? '');
          if (/[",\n]/.test(text)) {
            return `"${text.replace(/"/g, '""')}"`;
          }
          return text;
        })
        .join(','),
    )
    .join('\n');
}

function buildStaticHtml(item) {
  const messageTableHtml = item?.table
    ? `<section><h2>${escapeHtml(item.table.title || '生成表格')}</h2><table border="1" cellspacing="0" cellpadding="8"><thead><tr>${(item.table.columns || [])
        .map((column) => `<th>${escapeHtml(column)}</th>`)
        .join('')}</tr></thead><tbody>${(item.table.rows || [])
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table></section>`
    : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(item?.title || '生成报表')}</title>
  <style>
    body { font-family: "Microsoft YaHei", sans-serif; margin: 32px; color: #16202f; line-height: 1.7; }
    h1, h2 { margin: 0 0 12px; }
    section { margin-top: 28px; }
    .meta { color: #64748b; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { text-align: left; }
  </style>
</head>
<body>
  <h1>${escapeHtml(item?.title || '生成报表')}</h1>
  <div class="meta">生成时间：${escapeHtml(item?.createdAt || '')}</div>
  ${item?.content ? `<section><div>${escapeHtml(item.content)}</div></section>` : ''}
  ${messageTableHtml}
</body>
</html>`;
}

export function downloadGeneratedReport(item) {
  if (typeof window === 'undefined' || !item) return;

  let blob;
  let extension = item.format || 'txt';
  let mimeType = 'text/plain;charset=utf-8';
  let content = item.content || '';

  if (item.kind === 'table' && item.table) {
    extension = 'csv';
    mimeType = 'text/csv;charset=utf-8';
    content = buildCsv(item.table);
  } else if (item.kind === 'static') {
    extension = 'html';
    mimeType = 'text/html;charset=utf-8';
    content = buildStaticHtml(item);
  } else if (item.downloadUrl) {
    window.open(item.downloadUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${item.title || 'report'}.${extension}`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function copyGeneratedReportLink(item) {
  if (typeof window === 'undefined' || !item) return false;
  const link = buildGeneratedReportLink(item.id);
  try {
    await navigator.clipboard.writeText(link);
    return true;
  } catch {
    return false;
  }
}

export function formatGeneratedReportTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
