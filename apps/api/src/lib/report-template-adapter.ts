import type {
  ReportGroup,
  ReportTemplateEnvelope,
} from './report-center.js';
import {
  resolveRequestAdapterEnvelope,
  type GovernanceEnvelopeOverride,
} from './report-governance.js';

type KnowledgeOutputKind = 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md';

function mergeEnvelope(
  envelope: ReportTemplateEnvelope,
  override: GovernanceEnvelopeOverride,
): ReportTemplateEnvelope {
  return {
    ...envelope,
    title: override.title || envelope.title,
    fixedStructure: override.fixedStructure?.length ? [...override.fixedStructure] : envelope.fixedStructure,
    variableZones: override.variableZones?.length ? [...override.variableZones] : envelope.variableZones,
    outputHint: override.outputHint || envelope.outputHint,
    pageSections: override.pageSections?.length ? [...override.pageSections] : envelope.pageSections,
    tableColumns: override.tableColumns?.length ? [...override.tableColumns] : envelope.tableColumns,
  };
}

export function adaptTemplateEnvelopeForRequest(
  group: ReportGroup,
  envelope: ReportTemplateEnvelope,
  kind: KnowledgeOutputKind,
  requestText: string,
) {
  const resolved = resolveRequestAdapterEnvelope(group, kind, requestText);
  if (!resolved?.override) {
    return envelope;
  }

  return mergeEnvelope(envelope, resolved.override);
}
