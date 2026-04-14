import { buildSharedTemplateEnvelope, type loadReportCenterStateWithOptions } from './report-center.js';
import type { OpenClawMemoryTemplateSnapshot } from './openclaw-memory-catalog-types.js';

function sanitizeText(value: unknown, maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...` : text;
}

function sanitizeList(values: unknown[], maxLength = 80, limit = 6) {
  return [...new Set(values.map((item) => sanitizeText(item, maxLength)).filter(Boolean))].slice(0, limit);
}

export function buildTemplateSnapshots(
  input: Pick<Awaited<ReturnType<typeof loadReportCenterStateWithOptions>>, 'groups' | 'templates'>,
) {
  const groupMap = new Map<string, { keys: Set<string>; labels: Set<string> }>();
  for (const group of input.groups) {
    for (const template of group.templates) {
      const entry = groupMap.get(template.key) || { keys: new Set<string>(), labels: new Set<string>() };
      entry.keys.add(group.key);
      entry.labels.add(group.label);
      groupMap.set(template.key, entry);
    }
  }

  return input.templates
    .filter((template) => template.supported)
    .map((template) => {
      const envelope = buildSharedTemplateEnvelope(template);
      const groups = groupMap.get(template.key);
      return {
        key: template.key,
        label: sanitizeText(template.label, 120),
        type: template.type,
        description: sanitizeText(template.description, 200),
        origin: sanitizeText(template.origin, 32) || 'system',
        isDefault: Boolean(template.isDefault),
        supported: Boolean(template.supported),
        groupKeys: groups ? [...groups.keys] : [],
        groupLabels: groups ? [...groups.labels] : [],
        outputHint: sanitizeText(envelope.outputHint, 180),
        fixedStructure: sanitizeList(envelope.fixedStructure || [], 90, 8),
        variableZones: sanitizeList(envelope.variableZones || [], 90, 8),
        pageSections: sanitizeList(envelope.pageSections || [], 80, 8),
        tableColumns: sanitizeList(envelope.tableColumns || [], 60, 8),
        referenceNames: sanitizeList((template.referenceImages || []).map((item) => item.originalName), 80, 6),
      } satisfies OpenClawMemoryTemplateSnapshot;
    })
    .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.label.localeCompare(right.label, 'zh-CN'));
}
