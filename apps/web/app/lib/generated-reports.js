'use client';

import { createSharedReportPayload } from './shared-report-link.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeFilename(value, fallback = 'report') {
  const normalized = String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '');
  return normalized || fallback;
}

function chunkArray(items, size) {
  if (!Array.isArray(items) || size <= 0) return [];
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveGeneratedReportFormat(kind, incomingFormat, hasTable = false) {
  const normalized = String(incomingFormat || '').trim();
  if (normalized) return normalized;
  if (hasTable || kind === 'table') return 'csv';
  if (kind === 'page') return 'html';
  if (kind === 'ppt') return 'pptx';
  if (kind === 'pdf') return 'pdf';
  if (kind === 'md') return 'md';
  if (kind === 'doc') return 'docx';
  return 'txt';
}

export function createGeneratedReportId() {
  return `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeChartItems(items) {
  return Array.isArray(items)
    ? items
        .map((item) => ({
          label: item?.label || '',
          value: normalizeNumber(item?.value),
        }))
        .filter((item) => item.label)
    : [];
}

function normalizeChartRender(render) {
  if (!render) return null;
  const svg = String(render?.svg || '');
  const renderer = String(render?.renderer || '');
  const chartType = String(render?.chartType || '');
  const alt = String(render?.alt || '');
  const generatedAt = String(render?.generatedAt || '');
  return renderer || chartType || alt || generatedAt || svg
    ? { renderer, chartType, alt, generatedAt, svg }
    : null;
}

function normalizePageDatavizSlots(slots) {
  return Array.isArray(slots)
    ? slots
        .map((slot) => ({
          key: String(slot?.key || '').trim(),
          title: String(slot?.title || '').trim(),
          purpose: String(slot?.purpose || '').trim(),
          preferredChartType: String(slot?.preferredChartType || '').trim(),
          placement: String(slot?.placement || '').trim(),
          sectionTitle: String(slot?.sectionTitle || '').trim(),
          evidenceFocus: String(slot?.evidenceFocus || '').trim(),
          minItems: normalizeNumber(slot?.minItems),
          maxItems: normalizeNumber(slot?.maxItems),
        }))
        .filter((slot) => slot.key || slot.title)
    : [];
}

function normalizePageSpec(pageSpec) {
  if (!pageSpec || !Array.isArray(pageSpec?.sections)) return null;
  const layoutVariant = String(pageSpec?.layoutVariant || '').trim() || 'insight-brief';
  const heroCardLabels = Array.isArray(pageSpec?.heroCardLabels)
    ? pageSpec.heroCardLabels.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const heroDatavizSlotKeys = Array.isArray(pageSpec?.heroDatavizSlotKeys)
    ? pageSpec.heroDatavizSlotKeys.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const sections = pageSpec.sections
    .map((section) => ({
      title: String(section?.title || '').trim(),
      purpose: String(section?.purpose || '').trim(),
      completionMode: String(section?.completionMode || '').trim(),
      datavizSlotKeys: Array.isArray(section?.datavizSlotKeys)
        ? section.datavizSlotKeys.map((item) => String(item || '').trim()).filter(Boolean)
        : [],
    }))
    .filter((section) => section.title);
  return heroCardLabels.length || heroDatavizSlotKeys.length || sections.length
    ? {
        layoutVariant,
        heroCardLabels,
        heroDatavizSlotKeys,
        sections,
      }
    : null;
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
    datavizSlots: normalizePageDatavizSlots(page?.datavizSlots),
    pageSpec: normalizePageSpec(page?.pageSpec),
    charts: Array.isArray(page?.charts)
      ? page.charts
          .map((chart) => ({
            title: chart?.title || '',
            items: normalizeChartItems(chart?.items),
            render: normalizeChartRender(chart?.render),
          }))
          .filter((chart) => chart.title || chart.items.length || chart.render)
      : [],
  };
}

function normalizeLibraries(libraries) {
  return Array.isArray(libraries) ? libraries.filter((item) => item?.key || item?.label) : [];
}

function normalizeDynamicSource(dynamicSource) {
  if (!dynamicSource || !dynamicSource.enabled) return null;
  return {
    enabled: true,
    request: String(dynamicSource.request || '').trim(),
    outputType: String(dynamicSource.outputType || '').trim() || 'page',
    conceptMode: Boolean(dynamicSource.conceptMode),
    templateKey: String(dynamicSource.templateKey || '').trim(),
    templateLabel: String(dynamicSource.templateLabel || '').trim(),
    timeRange: String(dynamicSource.timeRange || '').trim(),
    contentFocus: String(dynamicSource.contentFocus || '').trim(),
    libraries: normalizeLibraries(dynamicSource.libraries),
    updatedAt: String(dynamicSource.updatedAt || '').trim(),
    lastRenderedAt: String(dynamicSource.lastRenderedAt || '').trim(),
    sourceFingerprint: String(dynamicSource.sourceFingerprint || '').trim(),
    sourceDocumentCount: normalizeNumber(dynamicSource.sourceDocumentCount),
    sourceUpdatedAt: String(dynamicSource.sourceUpdatedAt || '').trim(),
    planDatavizSlots: normalizePageDatavizSlots(dynamicSource.planDatavizSlots),
    planPageSpec: normalizePageSpec(dynamicSource.planPageSpec),
  };
}

export function createGeneratedReport({ response, message, requestPrompt = '' }) {
  const createdAt = new Date().toISOString();
  const output = response?.output || message?.output || null;
  const outputType = output?.type || (message?.table ? 'table' : 'answer');

  if (!output || outputType === 'answer') return null;

  const title =
    output?.title ||
    message?.table?.title ||
    message?.title ||
    (outputType === 'table' ? '生成表格报表' : '生成数据可视化静态页');
  const libraries = normalizeLibraries(response?.libraries);
  const reportTemplate = response?.reportTemplate || null;
  const dynamicSource =
    outputType === 'page' && libraries.length
      ? {
          enabled: true,
          request: String(requestPrompt || title || '').trim(),
          outputType,
          conceptMode: !String(reportTemplate?.key || '').trim(),
          templateKey: String(reportTemplate?.key || '').trim(),
          templateLabel: String(reportTemplate?.label || '').trim(),
          libraries,
          updatedAt: createdAt,
          lastRenderedAt: '',
          sourceFingerprint: '',
          sourceDocumentCount: 0,
          sourceUpdatedAt: '',
          timeRange: '',
          contentFocus: '',
        }
      : null;

  return {
    id: createGeneratedReportId(),
    title,
    kind: outputType,
    format: resolveGeneratedReportFormat(outputType, output?.format, outputType === 'table'),
    source: 'chat',
    createdAt,
    content: output?.content || message?.content || '',
    table: output?.table || message?.table || null,
    page: normalizePage(output?.page),
    intent: response?.intent || 'report',
    mode: response?.mode || 'fallback',
    libraries,
    downloadUrl: output?.downloadUrl || '',
    groupKey: response?.libraries?.[0]?.key || '',
    groupLabel: response?.libraries?.[0]?.label || '',
    templateKey: reportTemplate?.key || '',
    templateLabel: reportTemplate?.label || '',
    dynamicSource,
  };
}

export function normalizeGeneratedReportRecord(item) {
  return {
    id: item?.id || createGeneratedReportId(),
    title: item?.title || '生成报表',
    kind: item?.kind || (item?.table ? 'table' : item?.page ? 'page' : 'page'),
    format: resolveGeneratedReportFormat(item?.kind, item?.format, Boolean(item?.table)),
    source: item?.triggerSource || item?.source || 'chat',
    createdAt: item?.createdAt || new Date().toISOString(),
    status: item?.status || 'ready',
    summary: item?.summary || '',
    content: item?.content || '',
    table: item?.table || null,
    page: normalizePage(item?.page),
    intent: item?.intent || 'report',
    mode: item?.mode || 'openclaw',
    libraries: normalizeLibraries(item?.libraries),
    downloadUrl: item?.downloadUrl || '',
    groupKey: item?.groupKey || '',
    groupLabel: item?.groupLabel || '',
    templateKey: item?.templateKey || '',
    templateLabel: item?.templateLabel || '',
    dynamicSource: normalizeDynamicSource(item?.dynamicSource),
  };
}

export function buildGeneratedReportPersistPayload(item) {
  if (!item) return null;
  return {
    groupKey: item.groupKey || item.libraries?.[0]?.key || '',
    templateKey: item.templateKey || '',
    title: item.title,
    kind: item.kind,
    format: item.format,
    content: item.content,
    table: item.table,
    page: item.page,
    libraries: item.libraries || [],
    downloadUrl: item.downloadUrl || '',
    dynamicSource: item.dynamicSource || null,
  };
}

export function buildGeneratedReportLink(itemOrId) {
  if (typeof window === 'undefined') {
    if (typeof itemOrId === 'string') return `/reports?generated=${encodeURIComponent(itemOrId)}`;
    if (itemOrId?.kind === 'page') {
      return `/shared/report?payload=${encodeURIComponent(createSharedReportPayload(itemOrId))}`;
    }
    return `/reports?generated=${encodeURIComponent(itemOrId?.id || '')}`;
  }

  if (typeof itemOrId === 'string') {
    return `${window.location.origin}/reports?generated=${encodeURIComponent(itemOrId)}`;
  }
  if (itemOrId?.kind === 'page') {
    return `${window.location.origin}/shared/report?payload=${encodeURIComponent(createSharedReportPayload(itemOrId))}`;
  }
  return `${window.location.origin}/reports?generated=${encodeURIComponent(itemOrId?.id || '')}`;
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
  const link = buildGeneratedReportLink(item);
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(link);
  }
  return link;
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

function buildRowsFromPage(item) {
  const rows = [];
  const page = item?.page || {};

  for (const card of page.cards || []) {
    rows.push(['指标卡片', card.label || '', card.value || '', card.note || '']);
  }

  for (const section of page.sections || []) {
    rows.push(['页面分节', section.title || '', section.body || '', (section.bullets || []).join('；')]);
  }

  for (const chart of page.charts || []) {
    for (const entry of chart.items || []) {
      rows.push(['图表数据', chart.title || '', entry.label || '', entry.value ?? '']);
    }
  }

  if (!rows.length && item?.content) {
    rows.push(['正文', item.title || '', item.content, '']);
  }

  return rows;
}

function buildTableCsvFromReport(item) {
  if (item?.table?.columns?.length && Array.isArray(item?.table?.rows)) {
    return buildCsv(item.table);
  }
  const rows = buildRowsFromPage(item);
  return buildCsv({
    columns: ['类型', '标题', '内容', '补充信息'],
    rows,
  });
}

function buildPlainText(item) {
  const parts = [
    item?.title ? `标题：${item.title}` : '',
    item?.createdAt ? `生成时间：${item.createdAt}` : '',
    item?.templateLabel ? `模板：${item.templateLabel}` : '',
    Array.isArray(item?.libraries) && item.libraries.length
      ? `知识库：${item.libraries.map((entry) => entry.label || entry.key).filter(Boolean).join('、')}`
      : '',
    item?.summary ? `摘要：${item.summary}` : '',
    item?.content ? `正文：\n${item.content}` : '',
  ].filter(Boolean);

  if (item?.table?.columns?.length) {
    parts.push(`表头：${item.table.columns.join(' | ')}`);
    for (const row of item.table.rows || []) {
      parts.push((row || []).map((cell) => String(cell ?? '')).join(' | '));
    }
  }

  if (item?.page?.summary) {
    parts.push(`页面摘要：${item.page.summary}`);
  }

  for (const section of item?.page?.sections || []) {
    parts.push(`${section.title || '分节'}：${section.body || ''}`);
    for (const bullet of section.bullets || []) {
      parts.push(`- ${bullet}`);
    }
  }

  for (const chart of item?.page?.charts || []) {
    parts.push(`图表：${chart.title || '未命名图表'}`);
    for (const entry of chart.items || []) {
      parts.push(`- ${entry.label}: ${entry.value}`);
    }
  }

  return parts.join('\n\n').trim();
}

function buildPageHtml(item) {
  const pageTitle = 'AI智能助手';
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
      if (chart?.render?.svg) {
        return `
        <section class="section">
          ${chart.title ? `<h2>${escapeHtml(chart.title)}</h2>` : ''}
          <div class="chart-svg">${chart.render.svg}</div>
        </section>`;
      }
      const maxValue = Math.max(...chart.items.map((entry) => normalizeNumber(entry.value)), 1);
      const rows = chart.items
        .map(
          (entry) => `
            <div class="bar-row">
              <span class="bar-label">${escapeHtml(entry.label)}</span>
              <span class="bar-track"><span class="bar-fill" style="width:${Math.max(8, (normalizeNumber(entry.value) / maxValue) * 100)}%"></span></span>
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
  <title>${pageTitle}</title>
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
    .chart-svg { margin-top: 12px; }
    .chart-svg svg { width: 100%; height: auto; display: block; }
    .bar-row { display: grid; grid-template-columns: 120px 1fr 56px; gap: 10px; align-items: center; }
    .bar-track { display: inline-flex; width: 100%; background: #e2e8f0; border-radius: 999px; overflow: hidden; height: 10px; }
    .bar-fill { display: inline-flex; background: linear-gradient(90deg, #0f766e, #14b8a6); height: 10px; }
    .bar-label, .bar-value { font-size: 13px; color: #334155; }
  </style>
</head>
<body>
  <h1>${escapeHtml(item?.title || '数据可视化静态页')}</h1>
  <div class="meta">生成时间：${escapeHtml(item?.createdAt || '')}</div>
  ${item?.content ? `<section class="section"><p>${escapeHtml(item.content)}</p></section>` : ''}
  ${cards ? `<div class="cards">${cards}</div>` : ''}
  ${sections}
  ${charts}
</body>
</html>`;
}

async function downloadPptx(item) {
  const response = await fetch('/api/reports/export/pptx', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ item }),
  });

  if (!response.ok) {
    throw new Error(`PPT export failed: ${response.status}`);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?/i);
  const rawName = decodeURIComponent(match?.[1] || match?.[2] || '');
  const safeName = sanitizeFilename(rawName || item?.title, 'report');
  const filename = safeName.toLowerCase().endsWith('.pptx') ? safeName : `${safeName}.pptx`;

  downloadBlob(filename, blob, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
}

function downloadBlob(filename, content, mimeType) {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function getGeneratedReportShareActions(item) {
  if (!item) return [];
  return [
    { key: 'link', label: '复制链接' },
    { key: 'table', label: '按表格下载' },
    { key: 'ppt', label: '按PPT下载' },
    { key: 'text', label: '按纯文字下载' },
  ];
}

export async function downloadGeneratedReportAs(item, mode = 'table') {
  if (!item || typeof window === 'undefined') return;

  if (mode === 'link') {
    await copyGeneratedReportLink(item);
    return;
  }

  if (mode === 'table') {
    downloadBlob(`${sanitizeFilename(item.title, 'report')}.csv`, buildTableCsvFromReport(item), 'text/csv;charset=utf-8');
    return;
  }

  if (mode === 'ppt') {
    await downloadPptx(item);
    return;
  }

  if (mode === 'text') {
    const extension = item?.kind === 'md' || item?.format === 'md' ? 'md' : 'txt';
    const mimeType = extension === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';
    downloadBlob(`${sanitizeFilename(item.title, 'report')}.${extension}`, buildPlainText(item), mimeType);
    return;
  }

  if (mode === 'page') {
    downloadBlob(`${sanitizeFilename(item.title, 'report')}.html`, buildPageHtml(item), 'text/html;charset=utf-8');
  }
}

export function downloadGeneratedReport(item) {
  if (!item) return;
  const fallbackMode = item.kind === 'page' ? 'page' : item.kind === 'table' ? 'table' : 'text';
  void downloadGeneratedReportAs(item, fallbackMode);
}
