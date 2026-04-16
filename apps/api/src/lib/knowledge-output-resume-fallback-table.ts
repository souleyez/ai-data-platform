import type { ParsedDocument } from './document-parser.js';
import { alignRowsToColumns } from './knowledge-output-normalization.js';
import {
  buildResumeCompanyProjectRows,
  buildResumeProjectRows,
  buildResumeSkillRows,
  buildResumeTalentRows,
} from './knowledge-output-resume-views.js';
import type { ChatOutput } from './knowledge-output-types.js';
import type { ResumeDisplayProfile } from './resume-display-profile-provider.js';
import type { ReportTemplateEnvelope } from './report-center.js';
import { buildResumePageEntries } from './knowledge-output-resume-support.js';
import {
  buildResumePageOutput,
} from './knowledge-output-resume-fallback-page.js';
import {
  getResumeViewDeps,
  RESUME_COMPANY_COLUMNS,
  RESUME_PROJECT_COLUMNS,
  RESUME_SKILL_COLUMNS,
  RESUME_TALENT_COLUMNS,
  resolveResumeFallbackView,
  wrapPageOutputAsKind,
} from './knowledge-output-resume-fallback-support.js';

export function buildResumeFallbackOutput(
  kind: 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md',
  requestText: string,
  documents: ParsedDocument[],
  envelope?: ReportTemplateEnvelope | null,
  displayProfiles: ResumeDisplayProfile[] = [],
): ChatOutput | null {
  const resumeDocuments = documents.filter((item) => item.schemaType === 'resume');
  if (!resumeDocuments.length) return null;

  const resumeViewDeps = getResumeViewDeps();
  const view = resolveResumeFallbackView(requestText);
  const resumeEntries = buildResumePageEntries(resumeDocuments, displayProfiles);

  if (kind !== 'table') {
    const page = buildResumePageOutput(view, resumeDocuments, envelope, displayProfiles);
    return wrapPageOutputAsKind(kind, page);
  }

  if (view === 'company') {
    const rows = buildResumeCompanyProjectRows(resumeEntries, resumeViewDeps);
    if (rows.length) {
      return {
        type: 'table',
        title: envelope?.title || '简历 IT 项目公司维度表',
        content: `已基于库内简历整理出按公司维度的 IT 项目信息，共 ${rows.length} 条。`,
        format: 'csv',
        table: {
          title: envelope?.title || '简历 IT 项目公司维度表',
          subtitle: '基于知识库结构化简历信息自动整理',
          columns: envelope?.tableColumns || RESUME_COMPANY_COLUMNS,
          rows,
        },
      };
    }
  }

  if (view === 'project') {
    const rows = buildResumeProjectRows(resumeEntries, resumeViewDeps);
    if (rows.length) {
      return {
        type: 'table',
        title: envelope?.title || '简历项目维度表',
        content: `已基于库内简历整理出按项目维度的经历信息，共 ${rows.length} 条。`,
        format: 'csv',
        table: {
          title: envelope?.title || '简历项目维度表',
          subtitle: '基于知识库结构化简历信息自动整理',
          columns: envelope?.tableColumns || RESUME_PROJECT_COLUMNS,
          rows,
        },
      };
    }
  }

  if (view === 'skill') {
    const rows = buildResumeSkillRows(resumeEntries, resumeViewDeps);
    if (rows.length) {
      return {
        type: 'table',
        title: envelope?.title || '简历技能维度表',
        content: `已基于库内简历整理出按技能维度的信息，共 ${rows.length} 条。`,
        format: 'csv',
        table: {
          title: envelope?.title || '简历技能维度表',
          subtitle: '基于知识库结构化简历信息自动整理',
          columns: envelope?.tableColumns || RESUME_SKILL_COLUMNS,
          rows,
        },
      };
    }
  }

  if (view === 'talent' || view === 'generic') {
    const rows = buildResumeTalentRows(resumeEntries);
    if (rows.length) {
      return {
        type: 'table',
        title: envelope?.title || '简历人才维度表',
        content: `已基于库内简历整理出按人才维度的信息，共 ${rows.length} 条。`,
        format: 'csv',
        table: {
          title: envelope?.title || '简历人才维度表',
          subtitle: '基于知识库结构化简历信息自动整理',
          columns: envelope?.tableColumns || RESUME_TALENT_COLUMNS,
          rows,
        },
      };
    }
  }

  const fallbackColumns = envelope?.tableColumns?.length ? envelope.tableColumns : ['结论', '说明', '证据来源'];
  const fallbackRow =
    fallbackColumns.length === 1
      ? ['当前未能稳定提取更多结构化条目。']
      : [
          '当前未能稳定提取更多结构化条目。',
          '可继续补充更明确的筛选条件或模板全名。',
          '知识库当前证据',
        ];

  return {
    type: 'table',
    title: envelope?.title || '简历人才维度表',
    content: '当前未能稳定提取更多结构化条目。',
    format: 'csv',
    table: {
      title: envelope?.title || '简历人才维度表',
      subtitle: '根据知识库结构化结果整理',
      columns: fallbackColumns,
      rows: [alignRowsToColumns([fallbackRow], fallbackColumns)[0]],
    },
  };
}
