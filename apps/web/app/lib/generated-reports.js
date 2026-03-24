'use client';

export const GENERATED_REPORTS_STORAGE_KEY = 'aidp-generated-reports-v5';

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

function normalizeChartItems(items) {
  return Array.isArray(items)
    ? items
        .map((item) => ({
          label: item?.label || '',
          value: Number(item?.value || 0),
        }))
        .filter((item) => item.label)
    : [];
}

function normalizePage(page) {
  if (!page) return null;
  return {
    summary: page?.summary || '',
    cards: Array.isArray(page?.cards)
      ? page.cards
          .map((card) => ({
            label: card?.label || '',
            value: card?.value || '',
            note: card?.note || '',
          }))
          .filter((card) => card.label || card.value)
      : [],
    sections: Array.isArray(page?.sections)
      ? page.sections
          .map((section) => ({
            title: section?.title || '',
            body: section?.body || '',
            bullets: Array.isArray(section?.bullets) ? section.bullets.filter(Boolean) : [],
          }))
          .filter((section) => section.title || section.body || section.bullets.length)
      : [],
    charts: Array.isArray(page?.charts)
      ? page.charts
          .map((chart) => ({
            title: chart?.title || '',
            items: normalizeChartItems(chart?.items),
          }))
          .filter((chart) => chart.title || chart.items.length)
      : [],
  };
}

export function createGeneratedReport({ response, message }) {
  const createdAt = new Date().toISOString();
  const output = response?.output || message?.output || null;
  const outputType = output?.type || (message?.table ? 'table' : 'answer');

  if (!output || outputType === 'answer') return null;

  const title =
    output?.title ||
    message?.table?.title ||
    message?.title ||
    (outputType === 'table' ? '生成表格报表' : '生成静态页面');

  return {
    id: createGeneratedReportId(),
    title,
    kind: outputType,
    format: output?.format || (outputType === 'table' ? 'csv' : 'html'),
    source: 'chat',
    createdAt,
    content: output?.content || message?.content || '',
    table: output?.table || message?.table || null,
    page: normalizePage(output?.page),
    intent: response?.intent || 'report',
    mode: response?.mode || 'fallback',
    libraries: Array.isArray(response?.libraries) ? response.libraries : [],
    downloadUrl: output?.downloadUrl || '',
  };
}

export function loadGeneratedReports() {
  if (typeof window === 'undefined') return [];
  try {
    window.localStorage.removeItem('aidp-generated-reports-v1');
    window.localStorage.removeItem('aidp-generated-reports-v2');
    window.localStorage.removeItem('aidp-generated-reports-v3');
    window.localStorage.removeItem('aidp-generated-reports-v4');
    const raw = window.localStorage.getItem(GENERATED_REPORTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      id: item?.id || createGeneratedReportId(),
      title: item?.title || '生成报表',
      kind: item?.kind || (item?.table ? 'table' : item?.page ? 'page' : 'page'),
      format: item?.format || (item?.table ? 'csv' : 'html'),
      source: item?.source || 'chat',
      createdAt: item?.createdAt || new Date().toISOString(),
      content: item?.content || '',
      table: item?.table || null,
      page: normalizePage(item?.page),
      intent: item?.intent || 'report',
      mode: item?.mode || 'fallback',
      libraries: Array.isArray(item?.libraries) ? item.libraries : [],
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

export async function copyGeneratedReportLink(item) {
  const link = buildGeneratedReportLink(item?.id || '');
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(link);
  }
  return link;
}

export function getGeneratedReportActionLabel(item) {
  if (!item) return '查看';
  if (item.kind === 'table') return '下载表格';
  if (item.format === 'ppt' || item.format === 'pdf') return '下载文件';
  if (item.kind === 'page') return '复制链接';
  return '查看';
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

function buildPageHtml(item) {
  const cards = (item?.page?.cards || [])
    .map(
      (card) => `
        <div class="card">
          <div class="card-label">${escapeHtml(card.label)}</div>
          <div class="card-value">${escapeHtml(card.value)}</div>
          ${card.note ? `<div class="card-note">${escapeHtml(card.note)}</div>` : ''}
        </div>`,
    )
    .join('');

  const sections = (item?.page?.sections || [])
    .map(
      (section) => `
        <section class="section">
          ${section.title ? `<h2>${escapeHtml(section.title)}</h2>` : ''}
          ${section.body ? `<p>${escapeHtml(section.body)}</p>` : ''}
          ${
            section.bullets?.length
              ? `<ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>`
              : ''
          }
        </section>`,
    )
    .join('');

  const charts = (item?.page?.charts || [])
    .map((chart) => {
      const maxValue = Math.max(...chart.items.map((entry) => Number(entry.value || 0)), 1);
      const rows = chart.items
        .map(
          (entry) => `
            <div class="bar-row">
              <span class="bar-label">${escapeHtml(entry.label)}</span>
              <span class="bar-track"><span class="bar-fill" style="width:${Math.max(8, (Number(entry.value || 0) / maxValue) * 100)}%"></span></span>
              <span class="bar-value">${escapeHtml(entry.value)}</span>
            </div>`,
        )
        .join('');
      return `
        <section class="section">
          ${chart.title ? `<h2>${escapeHtml(chart.title)}</h2>` : ''}
          <div class="chart">${rows}</div>
        </section>`;
    })
    .join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(item?.title || '生成静态页面')}</title>
  <style>
    body { font-family: "Microsoft YaHei", sans-serif; margin: 32px; color: #16202f; line-height: 1.7; background: #f8fafc; }
    h1, h2 { margin: 0 0 12px; }
    p { margin: 0 0 10px; }
    .meta { color: #64748b; font-size: 13px; margin-top: 8px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 24px; }
    .card { background: white; border-radius: 16px; padding: 16px; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08); }
    .card-label { font-size: 12px; color: #64748b; }
    .card-value { font-size: 24px; font-weight: 700; margin-top: 6px; }
    .card-note { font-size: 12px; color: #64748b; margin-top: 6px; }
    .section { margin-top: 24px; background: white; border-radius: 18px; padding: 18px 20px; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.06); }
    ul { margin: 10px 0 0 18px; }
    .chart { display: grid; gap: 10px; margin-top: 12px; }
    .bar-row { display: grid; grid-template-columns: 120px 1fr 56px; gap: 10px; align-items: center; }
    .bar-track { display: inline-flex; width: 100%; background: #e2e8f0; border-radius: 999px; overflow: hidden; height: 10px; }
    .bar-fill { display: inline-flex; background: linear-gradient(90deg, #0f766e, #14b8a6); height: 10px; }
    .bar-label, .bar-value { font-size: 13px; color: #334155; }
  </style>
</head>
<body>
  <h1>${escapeHtml(item?.title || '生成静态页面')}</h1>
  <div class="meta">生成时间：${escapeHtml(item?.createdAt || '')}</div>
  ${item?.content ? `<section class="section"><p>${escapeHtml(item.content)}</p></section>` : ''}
  ${cards ? `<div class="cards">${cards}</div>` : ''}
  ${sections}
  ${charts}
</body>
</html>`;
}

export function downloadGeneratedReport(item) {
  if (typeof window === 'undefined' || !item) return;

  if (item.downloadUrl) {
    window.open(item.downloadUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  let extension = item.format || 'txt';
  let mimeType = 'text/plain;charset=utf-8';
  let content = item.content || '';

  if (item.kind === 'table' && item.table) {
    extension = 'csv';
    mimeType = 'text/csv;charset=utf-8';
    content = buildCsv(item.table);
  } else if (item.kind === 'page') {
    extension = 'html';
    mimeType = 'text/html;charset=utf-8';
    content = buildPageHtml(item);
  }

  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${item.title || 'generated-report'}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
