import {
  addSharedTemplateReferenceFileFromPath,
  addSharedTemplateReferenceLink,
  createSharedReportTemplate,
  deleteSharedReportTemplate,
  inferReportTemplateTypeFromSource,
  loadReportCenterState,
  updateReportGroupTemplate,
  updateSharedReportTemplate,
} from './report-center.js';
import type { ReportPlanLayoutVariant } from './report-planner.js';
import {
  clampLimit,
  resolveBooleanFlag,
  resolveDocumentSnapshotItem,
  resolveLibraryReference,
  resolveReportLayoutVariant,
  resolveReportTemplateType,
  summarizeDocumentItem,
  summarizeReportTemplateItem,
} from './platform-control-reports-support.js';
import type { CommandFlags, PlatformControlResult } from './platform-control-reports-types.js';

export async function runReportTemplateCommand(
  subcommand: string,
  flags: CommandFlags,
): Promise<PlatformControlResult | null> {
  if (subcommand === 'templates') {
    const state = await loadReportCenterState();
    const templateType = resolveReportTemplateType(flags.type);
    const limit = clampLimit(flags.limit, 20, 100);
    const items = state.templates
      .filter((item) => !templateType || item.type === templateType)
      .slice(0, limit)
      .map(summarizeReportTemplateItem);

    return {
      ok: true,
      action: 'reports.templates',
      summary: `Loaded ${items.length} reusable report templates${templateType ? ` of type ${templateType}` : ''}.`,
      data: { items },
    };
  }

  if (subcommand === 'template-from-document') {
    const documentId = String(flags.document || flags.id || '').trim();
    if (!documentId) throw new Error('Missing --document for reports template-from-document.');
    const document = await resolveDocumentSnapshotItem(documentId);
    const templateType = resolveReportTemplateType(flags.type)
      || inferReportTemplateTypeFromSource({ fileName: document.name });
    const templateLabel = String(flags.label || document.title || document.name || '').trim();
    if (!templateLabel) throw new Error('Template label is required.');

    let createdTemplate: Awaited<ReturnType<typeof createSharedReportTemplate>> | null = null;
    try {
      createdTemplate = await createSharedReportTemplate({
        label: templateLabel,
        type: templateType,
        description: String(flags.description || '').trim()
          || `由数据集文件“${document.title || document.name}”创建的输出模板。`,
        preferredLayoutVariant: resolveReportLayoutVariant(flags.layout),
        isDefault: resolveBooleanFlag(flags.default),
      });
      const reference = await addSharedTemplateReferenceFileFromPath(createdTemplate.key, {
        filePath: document.path,
        originalName: document.name,
      });
      return {
        ok: true,
        action: 'reports.template-from-document',
        summary: `Created reusable template "${createdTemplate.label}" from document "${document.title || document.name}".`,
        data: {
          template: {
            key: createdTemplate.key,
            label: createdTemplate.label,
            type: createdTemplate.type,
            description: createdTemplate.description,
            preferredLayoutVariant: createdTemplate.preferredLayoutVariant || '',
            isDefault: createdTemplate.isDefault === true,
          },
          reference,
          document: summarizeDocumentItem(document),
        },
      };
    } catch (error) {
      if (createdTemplate?.key) {
        await deleteSharedReportTemplate(createdTemplate.key).catch(() => undefined);
      }
      throw error;
    }
  }

  if (subcommand === 'create-template') {
    const templateLabel = String(flags.label || flags.name || '').trim();
    if (!templateLabel) throw new Error('Missing --label for reports create-template.');
    const template = await createSharedReportTemplate({
      label: templateLabel,
      type: resolveReportTemplateType(flags.type),
      description: String(flags.description || '').trim() || undefined,
      preferredLayoutVariant: resolveReportLayoutVariant(flags.layout),
      isDefault: resolveBooleanFlag(flags.default),
    });
    return {
      ok: true,
      action: 'reports.create-template',
      summary: `Created reusable template "${template.label}".`,
      data: { template: summarizeReportTemplateItem(template) },
    };
  }

  if (subcommand === 'update-template') {
    const templateKey = String(flags.template || flags.key || '').trim();
    if (!templateKey) throw new Error('Missing --template for reports update-template.');
    const patch: { label?: string; description?: string; preferredLayoutVariant?: ReportPlanLayoutVariant; isDefault?: boolean } = {};
    if (flags.label !== undefined) patch.label = String(flags.label || '').trim();
    if (flags.description !== undefined) patch.description = String(flags.description || '').trim();
    if (flags.layout !== undefined) patch.preferredLayoutVariant = resolveReportLayoutVariant(flags.layout);
    if (flags.default !== undefined) patch.isDefault = resolveBooleanFlag(flags.default);
    if (!Object.keys(patch).length) {
      throw new Error('Missing template update fields. Provide --label, --description, --layout, or --default.');
    }
    const template = await updateSharedReportTemplate(templateKey, patch);
    return {
      ok: true,
      action: 'reports.update-template',
      summary: `Updated reusable template "${template.label}".`,
      data: { template: summarizeReportTemplateItem(template) },
    };
  }

  if (subcommand === 'delete-template') {
    const templateKey = String(flags.template || flags.key || '').trim();
    if (!templateKey) throw new Error('Missing --template for reports delete-template.');
    const template = await deleteSharedReportTemplate(templateKey);
    return {
      ok: true,
      action: 'reports.delete-template',
      summary: `Deleted reusable template "${template.label}".`,
      data: { template: summarizeReportTemplateItem(template) },
    };
  }

  if (subcommand === 'set-group-template') {
    const library = await resolveLibraryReference(flags.library || flags.group || '');
    const templateKey = String(flags.template || flags.key || '').trim();
    if (!templateKey) throw new Error('Missing --template for reports set-group-template.');
    const result = await updateReportGroupTemplate(library.key, templateKey);
    return {
      ok: true,
      action: 'reports.set-group-template',
      summary: `Set default template for "${result.group.label}" to "${result.template.label}".`,
      data: {
        group: {
          key: result.group.key,
          label: result.group.label,
          defaultTemplateKey: result.group.defaultTemplateKey,
        },
        template: summarizeReportTemplateItem(result.template),
      },
    };
  }

  if (subcommand === 'group-templates') {
    const library = await resolveLibraryReference(flags.library || flags.group || '');
    const state = await loadReportCenterState();
    const group = state.groups.find((item) => item.key === library.key);
    if (!group) throw new Error(`Report group "${library.label}" not found.`);
    const items = (group.templates || []).map((item) => ({
      key: item.key,
      label: item.label,
      description: item.description || '',
      type: item.type,
      isDefault: item.key === group.defaultTemplateKey,
    }));
    return {
      ok: true,
      action: 'reports.group-templates',
      summary: `Loaded ${items.length} group templates for "${group.label}".`,
      data: {
        group: {
          key: group.key,
          label: group.label,
          defaultTemplateKey: group.defaultTemplateKey,
        },
        items,
      },
    };
  }

  if (subcommand === 'template-reference-file') {
    const templateKey = String(flags.template || flags.key || '').trim();
    const filePath = String(flags.path || flags.file || '').trim();
    if (!templateKey) throw new Error('Missing --template for reports template-reference-file.');
    if (!filePath) throw new Error('Missing --path for reports template-reference-file.');
    const reference = await addSharedTemplateReferenceFileFromPath(templateKey, {
      filePath,
      originalName: String(flags.name || flags.label || '').trim() || undefined,
    });
    return {
      ok: true,
      action: 'reports.template-reference-file',
      summary: `Attached file reference "${reference.originalName}" to template "${templateKey}".`,
      data: { templateKey, reference },
    };
  }

  if (subcommand === 'template-reference-link') {
    const templateKey = String(flags.template || flags.key || '').trim();
    const url = String(flags.url || '').trim();
    if (!templateKey) throw new Error('Missing --template for reports template-reference-link.');
    if (!url) throw new Error('Missing --url for reports template-reference-link.');
    const reference = await addSharedTemplateReferenceLink(templateKey, {
      url,
      label: String(flags.label || flags.name || '').trim() || undefined,
    });
    return {
      ok: true,
      action: 'reports.template-reference-link',
      summary: `Attached link reference to template "${templateKey}".`,
      data: { templateKey, reference },
    };
  }

  return null;
}
