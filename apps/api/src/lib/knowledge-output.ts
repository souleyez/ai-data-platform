import type { ParsedDocument } from './document-parser.js';
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

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function extractProjectRole(text: string) {
  const source = String(text || '').trim();
  const match = source.match(/(负责[^，。；]{2,20}|担任[^，。；]{2,20}|主导[^，。；]{2,20}|参与[^，。；]{2,20}|牵头[^，。；]{2,20})/);
  return match?.[1] || '';
}

function extractProjectTimeline(text: string) {
  const source = String(text || '').trim();
  const match = source.match(/((?:20\d{2}|19\d{2})[./-]?\d{0,2}(?:\s*[~-]\s*(?:20\d{2}|至今|现在)\d{0,5})?)/);
  return match?.[1] || '';
}

function extractTechKeywords(text: string) {
  const source = String(text || '').toLowerCase();
  const keywords = [
    'sap', 'erp', 'crm', 'mes', 'wms', 'bi', 'api', 'java', 'python', 'go', 'c#', 'sql',
    'mysql', 'oracle', 'postgresql', 'redis', 'kafka', 'docker', 'kubernetes', 'aws',
    'azure', '阿里云', '腾讯云', '系统', '平台', '接口', '数据中台', '供应链', '实施', '开发', '架构',
  ];
  const matches = keywords.filter((keyword) => source.includes(keyword.toLowerCase()));
  return [...new Set(matches)].slice(0, 6).join(' / ');
}

function buildResumeCompanyProjectRows(documents: ParsedDocument[]) {
  const rows: Array<Array<string>> = [];

  for (const item of documents) {
    if (item.schemaType !== 'resume') continue;
    const profile = (item.structuredProfile || {}) as Record<string, unknown>;
    const candidate = String(profile.candidateName || item.title || item.name || '').trim() || item.name;
    const companies = toStringArray(profile.companies).length
      ? toStringArray(profile.companies)
      : [String(profile.latestCompany || '').trim()].filter(Boolean);
    const projectHighlights = toStringArray(profile.itProjectHighlights).length
      ? toStringArray(profile.itProjectHighlights)
      : toStringArray(profile.projectHighlights);

    const effectiveCompanies = companies.length ? companies.slice(0, 4) : ['未明确公司'];
    const effectiveProjects = projectHighlights.length
      ? projectHighlights.slice(0, 6)
      : toStringArray(profile.highlights).filter((entry) => /(项目|系统|平台|接口|开发|实施|技术)/i.test(entry)).slice(0, 4);

    if (!effectiveProjects.length) {
      rows.push([
        effectiveCompanies[0],
        candidate,
        '未提取到明确 IT 项目',
        '',
        toStringArray(profile.skills).slice(0, 6).join(' / '),
        '',
        item.name,
      ]);
      continue;
    }

    for (const company of effectiveCompanies) {
      for (const project of effectiveProjects) {
        rows.push([
          company,
          candidate,
          project,
          extractProjectRole(project),
          extractTechKeywords(project) || toStringArray(profile.skills).slice(0, 6).join(' / '),
          extractProjectTimeline(project),
          item.name,
        ]);
      }
    }
  }

  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 24);
}

export function buildKnowledgeFallbackOutput(
  kind: 'table' | 'page' | 'pdf' | 'ppt',
  requestText: string,
  documents: ParsedDocument[],
  envelope?: ReportTemplateEnvelope | null,
): ChatOutput {
  if (kind === 'table' && envelope?.tableColumns?.includes('公司') && envelope.tableColumns.includes('IT项目')) {
    const rows = buildResumeCompanyProjectRows(documents);
    if (rows.length) {
      const content = `已基于库内简历整理出按公司维度的 IT 项目信息，共 ${rows.length} 条。`;
      return {
        type: 'table',
        title: '简历 IT 项目公司维度表',
        content,
        format: 'csv',
        table: {
          title: '简历 IT 项目公司维度表',
          subtitle: '基于库内简历的结构化信息自动整理',
          columns: envelope.tableColumns,
          rows,
        },
      };
    }
  }

  return normalizeReportOutput(kind, requestText, '', envelope);
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
