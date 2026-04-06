import { promises as fs } from 'node:fs';
import path from 'node:path';
import { STORAGE_CONFIG_DIR } from './paths.js';

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

async function ensureUsageDir() {
  await fs.mkdir(STORAGE_CONFIG_DIR, { recursive: true });
}

async function readUsageState(): Promise<DocumentAnswerUsageState> {
  try {
    const parsed = JSON.parse(await fs.readFile(DOCUMENT_ANSWER_USAGE_FILE, 'utf8')) as Partial<DocumentAnswerUsageState>;
    return {
      updatedAt: String(parsed.updatedAt || new Date().toISOString()),
      items: Array.isArray(parsed.items) ? parsed.items.map((item) => ({
        documentId: String(item.documentId || ''),
        path: String(item.path || ''),
        name: String(item.name || ''),
        count: Number(item.count || 0),
        firstReferencedAt: String(item.firstReferencedAt || ''),
        lastReferencedAt: String(item.lastReferencedAt || ''),
      })).filter((item) => item.documentId) : [],
      events: Array.isArray(parsed.events) ? parsed.events.map((event) => ({
        id: String(event.id || ''),
        time: String(event.time || ''),
        traceId: String(event.traceId || ''),
        botId: String(event.botId || ''),
        sessionUser: String(event.sessionUser || ''),
        documentIds: Array.isArray(event.documentIds) ? event.documentIds.map((item) => String(item || '')).filter(Boolean) : [],
      })).filter((event) => event.id) : [],
    };
  } catch {
    return createEmptyState();
  }
}

async function writeUsageState(state: DocumentAnswerUsageState) {
  await ensureUsageDir();
  await fs.writeFile(DOCUMENT_ANSWER_USAGE_FILE, JSON.stringify(state, null, 2), 'utf8');
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
