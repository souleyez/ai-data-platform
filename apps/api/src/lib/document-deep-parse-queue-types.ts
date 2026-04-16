export type QueueStatus = 'queued' | 'processing' | 'succeeded' | 'failed';

export type DeepParseQueueItem = {
  path: string;
  status: QueueStatus;
  queuedAt: string;
  lastAttemptAt?: string;
  completedAt?: string;
  attempts: number;
  error?: string;
};

export type DeepParseQueuePayload = {
  updatedAt: string;
  items: DeepParseQueueItem[];
};
