import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DocumentCategoryConfig } from './document-config.js';
import type { DocumentLibrary } from './document-libraries.js';
import type { ReportOutputRecord, ReportReferenceImage } from './report-center.js';

type ReportOutputLibrarySyncDeps = {
  defaultScanDir: string;
  reportLibraryExportDir: string;
  reportReferenceDir: string;
  storageRoot: string;
  loadDocumentLibraries: () => Promise<DocumentLibrary[]>;
  loadDocumentCategoryConfig: (scanDir: string) => Promise<DocumentCategoryConfig>;
  ingestExistingLocalFiles: (input: {
    filePaths: string[];
    documentConfig: DocumentCategoryConfig;
    libraries: DocumentLibrary[];
    preferredLibraryKeys?: string[];
    forcedLibraryKeys?: string[];
  }) => Promise<unknown>;
};

export function normalizePath(filePath: string) {
  return path.resolve(String(filePath || ''));
}

function startsWithPath(filePath: string, rootPath: string) {
  const normalizedFile = normalizePath(filePath).toLowerCase();
  const normalizedRoot = normalizePath(rootPath).toLowerCase();
  return normalizedFile === normalizedRoot || normalizedFile.startsWith(`${normalizedRoot}${path.sep}`.toLowerCase());
}

export function resolveReferenceFilePath(
  reference: ReportReferenceImage,
  deps: Pick<ReportOutputLibrarySyncDeps, 'reportReferenceDir' | 'storageRoot'>,
) {
  const relativePath = String(reference.relativePath || '').trim();
  if (!relativePath || reference.kind === 'link' || reference.url) return '';

  const resolved = normalizePath(path.resolve(deps.storageRoot, relativePath));
  return startsWithPath(resolved, deps.reportReferenceDir) ? resolved : '';
}

function sanitizeMarkdownTableCell(value: unknown) {
  return String(value ?? '')
    .replace(/\r\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

export function buildTableMarkdownBlock(table?: ReportOutputRecord['table']) {
  const columns = Array.isArray(table?.columns) ? table.columns.map((item) => String(item || '').trim()).filter(Boolean) : [];
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  if (!columns.length && !rows.length) return '';

  const effectiveColumns = columns.length
    ? columns
    : rows[0]?.map((_, index) => `列${index + 1}`) || [];

  const headerRow = `| ${effectiveColumns.map(sanitizeMarkdownTableCell).join(' | ')} |`;
  const separatorRow = `| ${effectiveColumns.map(() => '---').join(' | ')} |`;
  const bodyRows = rows.map((row) => {
    const cells = Array.isArray(row) ? row : [];
    return `| ${effectiveColumns.map((_, index) => sanitizeMarkdownTableCell(cells[index])).join(' | ')} |`;
  });

  const lines: string[] = ['## 表格内容'];
  if (table?.title) {
    lines.push('', table.title);
  }
  lines.push('', headerRow, separatorRow, ...bodyRows);
  return lines.join('\n').trim();
}

export function buildPageMarkdownBlock(page?: ReportOutputRecord['page']) {
  if (!page) return '';

  const lines: string[] = [];
  if (page.summary) {
    lines.push('## 摘要', '', String(page.summary || '').trim());
  }

  if (Array.isArray(page.cards) && page.cards.length) {
    lines.push(lines.length ? '' : '', '## 关键指标', '');
    lines.push(
      ...page.cards.map((item) => {
        const label = String(item?.label || '指标').trim();
        const value = String(item?.value || '').trim();
        const note = String(item?.note || '').trim();
        return `- ${label}${value ? `：${value}` : ''}${note ? ` (${note})` : ''}`;
      }),
    );
  }

  for (const section of page.sections || []) {
    const title = String(section?.title || '').trim() || '内容';
    const body = String(section?.body || '').trim();
    const bullets = Array.isArray(section?.bullets) ? section.bullets.map((item) => String(item || '').trim()).filter(Boolean) : [];
    lines.push(lines.length ? '' : '', `## ${title}`);
    if (body) {
      lines.push('', body);
    }
    if (bullets.length) {
      lines.push('', ...bullets.map((item) => `- ${item}`));
    }
  }

  if (Array.isArray(page.charts) && page.charts.length) {
    lines.push(lines.length ? '' : '', '## 图表数据');
    for (const chart of page.charts) {
      const title = String(chart?.title || '').trim() || '图表';
      lines.push('', `### ${title}`);
      const items = Array.isArray(chart?.items) ? chart.items : [];
      if (items.length) {
        lines.push('', ...items.map((item) => `- ${String(item?.label || '项').trim()}：${Number(item?.value || 0)}`));
      }
    }
  }

  return lines.join('\n').trim();
}

export function buildReportOutputKnowledgeMarkdown(record: ReportOutputRecord) {
  const lines: string[] = [
    `# ${record.title}`,
    '',
    `- 报表ID：${record.id}`,
    `- 分组：${record.groupLabel}`,
    `- 模板：${record.templateLabel}`,
    `- 生成时间：${record.createdAt}`,
    `- 原始格式：${record.kind || record.outputType || 'unknown'}/${record.format || 'unknown'}`,
  ];

  const libraryLabels = (record.libraries || [])
    .map((item) => String(item?.label || item?.key || '').trim())
    .filter(Boolean);
  if (libraryLabels.length) {
    lines.push(`- 对应知识库：${libraryLabels.join('、')}`);
  }
  if (record.summary) {
    lines.push(`- 生成摘要：${record.summary}`);
  }

  const sections: string[] = [];
  if (record.kind === 'table' && record.table) {
    sections.push(buildTableMarkdownBlock(record.table));
  } else if (record.kind === 'page' && record.page) {
    sections.push(buildPageMarkdownBlock(record.page));
  }

  const normalizedContent = String(record.content || '').trim();
  if (normalizedContent && (record.kind === 'md' || record.kind === 'doc' || record.kind === 'pdf' || record.kind === 'ppt' || !sections.length)) {
    sections.unshift(normalizedContent);
  }
  if (!sections.length && record.summary) {
    sections.push(`## 内容\n\n${record.summary}`);
  }

  if (sections.length) {
    lines.push('', ...sections.filter(Boolean));
  }

  return `${lines.join('\n').trim()}\n`;
}

export function resolveReportOutputLibraryKeys(record: ReportOutputRecord, libraries: DocumentLibrary[]) {
  const knownKeys = new Set(libraries.map((item) => item.key));
  const keys = new Set<string>();

  for (const entry of record.libraries || []) {
    const key = String(entry?.key || '').trim();
    const label = String(entry?.label || '').trim();
    if (key && knownKeys.has(key)) {
      keys.add(key);
      continue;
    }
    if (label) {
      const matched = libraries.find((item) => item.label === label);
      if (matched) keys.add(matched.key);
    }
  }

  if (!keys.size) {
    if (record.groupKey && knownKeys.has(record.groupKey)) {
      keys.add(record.groupKey);
    } else if (record.groupLabel) {
      const matched = libraries.find((item) => item.label === record.groupLabel);
      if (matched) keys.add(matched.key);
    }
  }

  return [...keys];
}

export async function syncReportOutputToKnowledgeLibraryWithDeps(
  record: ReportOutputRecord,
  deps: ReportOutputLibrarySyncDeps,
) {
  if (record.status !== 'ready') return null;

  const libraries = await deps.loadDocumentLibraries();
  const libraryKeys = resolveReportOutputLibraryKeys(record, libraries);
  if (!libraryKeys.length) return null;

  const documentConfig = await deps.loadDocumentCategoryConfig(deps.defaultScanDir);
  const markdown = buildReportOutputKnowledgeMarkdown(record);
  await fs.mkdir(deps.reportLibraryExportDir, { recursive: true });
  const outputPath = path.join(deps.reportLibraryExportDir, `report-output-${record.id}.md`);
  await fs.writeFile(outputPath, markdown, 'utf8');

  const ingestResult = await deps.ingestExistingLocalFiles({
    filePaths: [outputPath],
    documentConfig,
    libraries,
    preferredLibraryKeys: libraryKeys,
    forcedLibraryKeys: libraryKeys,
  });

  return {
    outputPath,
    libraryKeys,
    ingestResult,
  };
}

export async function syncReportOutputToKnowledgeLibrarySafelyWithDeps(
  record: ReportOutputRecord,
  deps: ReportOutputLibrarySyncDeps,
) {
  try {
    return await syncReportOutputToKnowledgeLibraryWithDeps(record, deps);
  } catch (error) {
    console.warn('[report-center] failed to sync report output into knowledge library', {
      reportOutputId: record.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function deleteStoredReferenceFileWithDeps(
  reference: ReportReferenceImage,
  deps: Pick<ReportOutputLibrarySyncDeps, 'reportReferenceDir' | 'storageRoot'>,
) {
  const filePath = resolveReferenceFilePath(reference, deps);
  if (!filePath) return false;

  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false;
    throw error;
  }
}
