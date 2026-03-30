export type OpenClawMemoryDocumentState = {
  id: string;
  libraryKeys: string[];
  title: string;
  summary: string;
  availability: string;
  updatedAt: string;
  fingerprint: string;
};

export type OpenClawMemoryChangeType =
  | 'added'
  | 'updated'
  | 'deleted'
  | 'audit-excluded'
  | 'audit-restored';

export type OpenClawMemoryChange = {
  id: string;
  type: OpenClawMemoryChangeType;
  documentId: string;
  title: string;
  libraryKeys: string[];
  happenedAt: string;
  note: string;
};

export type OpenClawMemoryState = {
  version: number;
  generatedAt: string;
  documents: Record<string, OpenClawMemoryDocumentState>;
  recentChanges: OpenClawMemoryChange[];
};

export const OPENCLAW_MEMORY_STATE_VERSION = 1;
const RECENT_CHANGE_LIMIT = 200;

function buildChangeId(documentId: string, type: OpenClawMemoryChangeType, happenedAt: string) {
  return `${type}:${documentId}:${happenedAt}`;
}

function normalizeState(
  state?: Partial<OpenClawMemoryState> | null,
): OpenClawMemoryState {
  return {
    version: OPENCLAW_MEMORY_STATE_VERSION,
    generatedAt: String(state?.generatedAt || '').trim(),
    documents: state?.documents && typeof state.documents === 'object' ? state.documents : {},
    recentChanges: Array.isArray(state?.recentChanges) ? state.recentChanges : [],
  };
}

function buildChange(input: {
  type: OpenClawMemoryChangeType;
  documentId: string;
  title: string;
  libraryKeys: string[];
  happenedAt: string;
  note: string;
}): OpenClawMemoryChange {
  return {
    id: buildChangeId(input.documentId, input.type, input.happenedAt),
    type: input.type,
    documentId: input.documentId,
    title: input.title,
    libraryKeys: input.libraryKeys,
    happenedAt: input.happenedAt,
    note: input.note,
  };
}

function buildAvailabilityNote(next: OpenClawMemoryDocumentState) {
  if (next.availability === 'audit-excluded') return 'Document is excluded by audit or ignore rules.';
  if (next.availability === 'structured-only') return 'Original file removed; structured result retained.';
  if (next.availability === 'parse-error') return 'Document still exists but parsing is incomplete.';
  if (next.availability === 'unsupported') return 'Document still exists but is not currently usable.';
  return 'Document is available in the current catalog.';
}

export function diffOpenClawMemoryState(input: {
  previous?: Partial<OpenClawMemoryState> | null;
  nextDocuments: OpenClawMemoryDocumentState[];
  generatedAt: string;
}): OpenClawMemoryState {
  const previous = normalizeState(input.previous);
  const nextById = Object.fromEntries(input.nextDocuments.map((item) => [item.id, item]));
  const changes: OpenClawMemoryChange[] = [];

  for (const next of input.nextDocuments) {
    const prev = previous.documents[next.id];
    if (!prev) {
      changes.push(buildChange({
        type: 'added',
        documentId: next.id,
        title: next.title,
        libraryKeys: next.libraryKeys,
        happenedAt: input.generatedAt,
        note: buildAvailabilityNote(next),
      }));
      continue;
    }

    if (prev.availability !== next.availability) {
      const type: OpenClawMemoryChangeType =
        next.availability === 'audit-excluded'
          ? 'audit-excluded'
          : prev.availability === 'audit-excluded'
            ? 'audit-restored'
            : 'updated';
      changes.push(buildChange({
        type,
        documentId: next.id,
        title: next.title,
        libraryKeys: next.libraryKeys,
        happenedAt: input.generatedAt,
        note: buildAvailabilityNote(next),
      }));
      continue;
    }

    if (prev.fingerprint !== next.fingerprint) {
      changes.push(buildChange({
        type: 'updated',
        documentId: next.id,
        title: next.title,
        libraryKeys: next.libraryKeys,
        happenedAt: input.generatedAt,
        note: 'Document card metadata changed in the current catalog.',
      }));
    }
  }

  for (const [documentId, prev] of Object.entries(previous.documents)) {
    if (nextById[documentId]) continue;
    changes.push(buildChange({
      type: 'deleted',
      documentId,
      title: prev.title,
      libraryKeys: prev.libraryKeys,
      happenedAt: input.generatedAt,
      note: 'Document is no longer present in the current catalog.',
    }));
  }

  const mergedRecentChanges = [
    ...changes,
    ...previous.recentChanges.filter((item) => !changes.some((next) => next.id === item.id)),
  ].slice(0, RECENT_CHANGE_LIMIT);

  return {
    version: OPENCLAW_MEMORY_STATE_VERSION,
    generatedAt: input.generatedAt,
    documents: nextById,
    recentChanges: mergedRecentChanges,
  };
}
