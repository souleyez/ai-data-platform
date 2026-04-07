import path from 'node:path';
import { STORAGE_CONFIG_DIR } from './paths.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';

const DOCUMENT_ANSWER_USAGE_FILE = path.join(STORAGE_CONFIG_DIR, 'document-answer-usage.json');
const MAX_USAGE_EVENTS = 500;

export type DocumentAnswerReference = {
  id: string;
  path?: string;
  name?: string;
};

type DocumentAnswerUsageItem = {
  documentId: string;
  path: string;
  name: string;
  count: number;
  firstReferencedAt: string;
  lastReferencedAt: string;
};

type DocumentAnswerUsageEvent = {
  id: string;
  time: string;
  traceId: string;
  botId: string;
  sessionUser: string;
  documentIds: string[];
};

type DocumentAnswerUsageState = {
  updatedAt: string;
  items: DocumentAnswerUsageItem[];
  events: DocumentAnswerUsageEvent[];
};

let stateMutationQueue: Promise<void> = Promise.resolve();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildUsageEventId() {
  return `answer-usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyState(): DocumentAnswerUsageState {
  return {
    updatedAt: new Date().toISOString(),
    items: [],
    events: [],
  };
}

function normalizeReferenceName(reference: DocumentAnswerReference) {
  return String(reference.name || reference.path || reference.id || 'unknown').trim();
}

async function readUsageState(): Promise<DocumentAnswerUsageState> {
  const { data } = await readRuntimeStateJson<DocumentAnswerUsageState>({
    filePath: DOCUMENT_ANSWER_USAGE_FILE,
    fallback: createEmptyState,
    normalize: (parsed) => {
      if (!isRecord(parsed)) return createEmptyState();
      return {
        updatedAt: String(parsed.updatedAt || new Date().toISOString()),
        items: Array.isArray(parsed.items) ? parsed.items.map((item) => ({
          documentId: String(isRecord(item) ? item.documentId || '' : ''),
          path: String(isRecord(item) ? item.path || '' : ''),
          name: String(isRecord(item) ? item.name || '' : ''),
          count: Number(isRecord(item) ? item.count || 0 : 0),
          firstReferencedAt: String(isRecord(item) ? item.firstReferencedAt || '' : ''),
          lastReferencedAt: String(isRecord(item) ? item.lastReferencedAt || '' : ''),
        })).filter((item) => item.documentId) : [],
        events: Array.isArray(parsed.events) ? parsed.events.map((event) => ({
          id: String(isRecord(event) ? event.id || '' : ''),
          time: String(isRecord(event) ? event.time || '' : ''),
          traceId: String(isRecord(event) ? event.traceId || '' : ''),
          botId: String(isRecord(event) ? event.botId || '' : ''),
          sessionUser: String(isRecord(event) ? event.sessionUser || '' : ''),
          documentIds: Array.isArray(isRecord(event) ? event.documentIds : undefined)
            ? (event.documentIds as unknown[]).map((item) => String(item || '')).filter(Boolean)
            : [],
        })).filter((event) => event.id) : [],
      };
    },
  });
  return data;
}

async function writeUsageState(state: DocumentAnswerUsageState) {
  await writeRuntimeStateJson({
    filePath: DOCUMENT_ANSWER_USAGE_FILE,
    payload: state,
  });
}

async function mutateUsageState<T>(mutator: (state: DocumentAnswerUsageState) => Promise<T>) {
  let result!: T;
  const run = stateMutationQueue.then(async () => {
    const state = await readUsageState();
    result = await mutator(state);
  });
  stateMutationQueue = run.then(() => undefined, () => undefined);
  await run;
  return result;
}

export async function loadDocumentAnswerUsageState() {
  return readUsageState();
}

export async function recordDocumentAnswerUsage(input: {
  traceId?: string;
  botId?: string;
  sessionUser?: string;
  references?: DocumentAnswerReference[];
}) {
  const references = Array.isArray(input.references)
    ? input.references
        .map((reference) => ({
          id: String(reference?.id || '').trim(),
          path: String(reference?.path || '').trim(),
          name: normalizeReferenceName(reference || {}),
        }))
        .filter((reference) => reference.id)
    : [];

  if (!references.length) {
    return {
      recorded: 0,
    };
  }

  const uniqueReferences = Array.from(
    references.reduce((map, reference) => {
      if (!map.has(reference.id)) map.set(reference.id, reference);
      return map;
    }, new Map<string, { id: string; path: string; name: string }>()),
  ).map((entry) => entry[1]);

  const now = new Date().toISOString();

  return mutateUsageState(async (state) => {
    const itemsById = new Map(state.items.map((item) => [item.documentId, item]));
    for (const reference of uniqueReferences) {
      const existing = itemsById.get(reference.id);
      if (existing) {
        existing.count += 1;
        existing.lastReferencedAt = now;
        if (reference.path) existing.path = reference.path;
        if (reference.name) existing.name = reference.name;
      } else {
        itemsById.set(reference.id, {
          documentId: reference.id,
          path: reference.path,
          name: reference.name,
          count: 1,
          firstReferencedAt: now,
          lastReferencedAt: now,
        });
      }
    }

    state.items = Array.from(itemsById.values()).sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return Date.parse(right.lastReferencedAt || '') - Date.parse(left.lastReferencedAt || '');
    });
    state.events = [
      {
        id: buildUsageEventId(),
        time: now,
        traceId: String(input.traceId || ''),
        botId: String(input.botId || ''),
        sessionUser: String(input.sessionUser || ''),
        documentIds: uniqueReferences.map((reference) => reference.id),
      },
      ...state.events,
    ].slice(0, MAX_USAGE_EVENTS);
    state.updatedAt = now;

    await writeUsageState(state);

    return {
      recorded: uniqueReferences.length,
    };
  });
}
