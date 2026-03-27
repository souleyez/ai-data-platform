import type { ReportTemplateEnvelope } from './report-center.js';

export type ChatOutput =
  | { type: 'answer'; content: string }
  | {
      type: 'table' | 'page' | 'pdf' | 'ppt';
      title: string;
      content: string;
      format?: string;
      table?: {
        title?: string;
        subtitle?: string;
        columns?: string[];
        rows?: Array<Array<string | number | null>>;
      } | null;
      page?: {
        summary?: string;
        cards?: Array<{ label?: string; value?: string; note?: string }>;
        sections?: Array<{ title?: string; body?: string; bullets?: string[] }>;
        charts?: Array<{ title?: string; items?: Array<{ label?: string; value?: number }> }>;
      } | null;
    };

export function buildKnowledgeMissMessage(libraries: Array<{ key: string; label: string }>) {
  if (libraries.length) {
    return `当前已尝试知识库：${libraries.map((item) => item.label).join('、')}。\n\n这次没有检索到足够的知识库证据，暂不生成结果。请换一种更明确的知识库表述，或先补充相关文档。`;
  }
  return '当前没有稳定命中的知识库，暂不生成结果。请先说明要基于哪个知识库输出。';
}

export function buildReportInstruction(kind: 'table' | 'page' | 'pdf' | 'ppt') {
  if (kind === 'page') {
    return [
      '你必须只输出 JSON。',
      'Schema:',
      '{"title":"...","content":"...","page":{"summary":"...","cards":[{"label":"...","value":"...","note":"..."}],"sections":[{"title":"...","body":"...","bullets":["..."]}],"charts":[{"title":"...","items":[{"label":"...","value":12}]}]}}',
      '所有内容必须是中文。',
    ].join('\n');
  }

  if (kind === 'pdf' || kind === 'ppt') {
    return [
      '你必须只输出 JSON。',
      'Schema:',
      '{"title":"...","content":"...","page":{"summary":"...","sections":[{"title":"...","body":"...","bullets":["..."]}]}}',
      '所有内容必须是中文。',
    ].join('\n');
  }

  return [
    '你必须只输出 JSON。',
    'Schema:',
    '{"title":"...","content":"...","table":{"title":"...","subtitle":"...","columns":["..."],"rows":[["...","..."]]}}',
    '所有内容必须是中文。',
  ].join('\n');
}

function tryParseJsonPayload(content: string) {
  try {
    const trimmed = String(content || '').trim();
    const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : trimmed;
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    const jsonText = firstBrace >= 0 && lastBrace > firstBrace ? candidate.slice(firstBrace, lastBrace + 1) : candidate;
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function sanitizeColumns(columns: unknown) {
  if (!Array.isArray(columns)) return [];
  return columns.map((column) => String(column || '').trim()).filter(Boolean);
}

function sanitizeRows(rows: unknown) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => Array.isArray(row))
    .map((row) => row.map((cell) => (cell == null ? '' : String(cell))));
}

function buildFallbackTableOutput(title: string, content: string): ChatOutput {
  return {
    type: 'table',
    title,
    content,
    format: 'csv',
    table: {
      title,
      subtitle: '根据知识库整理',
      columns: ['结论', '说明'],
      rows: [[content, '如需更细字段，可以继续补充要求']],
    },
  };
}

export function normalizeReportOutput(
  kind: 'table' | 'page' | 'pdf' | 'ppt',
  requestText: string,
  rawContent: string,
  envelope?: ReportTemplateEnvelope | null,
): ChatOutput {
  const parsed = tryParseJsonPayload(rawContent);
  const title = String(parsed?.title || '知识库输出结果').trim() || '知识库输出结果';
  const content = String(parsed?.content || rawContent || '').trim();

  if (kind === 'page') {
    const sections = Array.isArray(parsed?.page?.sections) ? parsed.page.sections : [];
    const normalizedSections = sections.length
      ? sections
      : (envelope?.pageSections || []).map((titleText) => ({
          title: titleText,
          body: '',
          bullets: [],
        }));
    return {
      type: 'page',
      title,
      content,
      format: 'html',
      page: {
        summary: String(parsed?.page?.summary || content).trim(),
        cards: Array.isArray(parsed?.page?.cards) ? parsed.page.cards : [],
        sections: normalizedSections,
        charts: Array.isArray(parsed?.page?.charts) ? parsed.page.charts : [],
      },
    };
  }

  if (kind === 'pdf') {
    return {
      type: 'pdf',
      title,
      content,
      format: 'pdf',
      page: {
        summary: String(parsed?.page?.summary || content).trim(),
        sections: Array.isArray(parsed?.page?.sections) ? parsed.page.sections : [],
      },
    };
  }

  if (kind === 'ppt') {
    return {
      type: 'ppt',
      title,
      content,
      format: 'ppt',
      page: {
        summary: String(parsed?.page?.summary || content).trim(),
        sections: Array.isArray(parsed?.page?.sections) ? parsed.page.sections : [],
      },
    };
  }

  const columns = sanitizeColumns(parsed?.table?.columns);
  const rows = sanitizeRows(parsed?.table?.rows);
  const fallbackColumns = envelope?.tableColumns || [];
  const finalColumns = columns.length ? columns : fallbackColumns;
  const finalRows = rows.map((row) => {
    if (!finalColumns.length) return row;
    if (row.length === finalColumns.length) return row;
    if (row.length > finalColumns.length) return row.slice(0, finalColumns.length);
    return [...row, ...new Array(finalColumns.length - row.length).fill('')];
  });
  if (!finalColumns.length || !finalRows.length) {
    return buildFallbackTableOutput(title || requestText, content || rawContent);
  }

  return {
    type: 'table',
    title,
    content,
    format: 'csv',
    table: {
      title: String(parsed?.table?.title || title).trim(),
      subtitle: String(parsed?.table?.subtitle || '根据知识库整理').trim(),
      columns: finalColumns,
      rows: finalRows,
    },
  };
}
