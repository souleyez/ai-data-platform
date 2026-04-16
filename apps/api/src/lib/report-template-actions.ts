import type { ReportGroup, ReportOutputRecord, ReportReferenceImage, ReportReferenceSourceType, ReportTemplateType, SharedReportTemplate } from './report-center.js';

type ReportCenterStateLike = {
  groups: ReportGroup[];
  outputs: ReportOutputRecord[];
  templates: SharedReportTemplate[];
};

export type ReportTemplateActionDeps = {
  loadState: () => Promise<ReportCenterStateLike>;
  saveGroupsAndOutputs: (
    groups: ReportGroup[],
    outputs: ReportOutputRecord[],
    templates?: SharedReportTemplate[],
  ) => Promise<void>;
  resolveReportGroup: (groups: ReportGroup[], groupKeyOrLabel: string) => ReportGroup | null;
  ensureDirs: () => Promise<void>;
  buildId: (prefix: string) => string;
  normalizeReportReferenceImage: (
    reference: Partial<ReportReferenceImage> | null | undefined,
  ) => ReportReferenceImage | null;
  inferReportReferenceSourceType: (input: {
    fileName?: string;
    mimeType?: string;
    url?: string;
  }) => ReportReferenceSourceType;
  inferReportTemplateTypeFromSource: (input: {
    sourceType?: ReportReferenceSourceType;
    fileName?: string;
    mimeType?: string;
    url?: string;
  }) => ReportTemplateType;
  findDuplicateSharedTemplateReference: (
    templates: SharedReportTemplate[],
    input: { fileName?: string; url?: string },
  ) => { templateKey: string; templateLabel: string; referenceId: string; uploadName: string } | null;
  isUserSharedReportTemplate: (
    template: Pick<SharedReportTemplate, 'key' | 'origin'> | null | undefined,
  ) => boolean;
  inferTemplatePreferredLayoutVariant: (
    template: Pick<SharedReportTemplate, 'type' | 'label' | 'description'>,
  ) => SharedReportTemplate['preferredLayoutVariant'];
  normalizePath: (filePath: string) => string;
  normalizeReferenceUrl: (rawUrl: string) => string;
  resolveReferenceFilePath: (reference: ReportReferenceImage) => string;
  deleteStoredReferenceFile: (reference: ReportReferenceImage) => Promise<unknown>;
  reportReferenceDir: string;
  storageRoot: string;
};

export {
  updateReportGroupTemplateWithDeps,
  uploadReportReferenceImageWithDeps,
} from './report-template-actions-group.js';
export {
  createSharedReportTemplateWithDeps,
  deleteSharedReportTemplateWithDeps,
  updateSharedReportTemplateWithDeps,
} from './report-template-actions-templates.js';
export {
  addSharedTemplateReferenceFileFromPathWithDeps,
  addSharedTemplateReferenceLinkWithDeps,
  deleteSharedTemplateReferenceWithDeps,
  readSharedTemplateReferenceFileWithDeps,
  uploadSharedTemplateReferenceWithDeps,
} from './report-template-actions-references.js';
