import path from 'node:path';
import { STORAGE_CONFIG_DIR } from './paths.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';
import type { ChatBackgroundJob, ChatBackgroundJobState } from './chat-background-jobs-types.js';
import { normalizeBackgroundJob } from './chat-background-jobs-support.js';

const CHAT_BACKGROUND_JOBS_FILE = path.join(STORAGE_CONFIG_DIR, 'chat-background-jobs.json');

export async function loadBackgroundJobState() {
  const { data } = await readRuntimeStateJson<ChatBackgroundJobState>({
    filePath: CHAT_BACKGROUND_JOBS_FILE,
    fallback: { items: [] },
    normalize: (parsed) => {
      const items = Array.isArray((parsed as { items?: unknown[] } | null)?.items)
        ? (parsed as { items: unknown[] }).items.map((item) => normalizeBackgroundJob(item)).filter(Boolean) as ChatBackgroundJob[]
        : [];
      return { items };
    },
  });
  return data;
}

export async function saveBackgroundJobState(state: ChatBackgroundJobState) {
  await writeRuntimeStateJson({
    filePath: CHAT_BACKGROUND_JOBS_FILE,
    payload: {
      items: state.items,
    },
  });
}
