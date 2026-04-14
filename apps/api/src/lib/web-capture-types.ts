import type { RuntimeAuth } from './web-capture-page-fetch.js';
import type { WebCaptureCrawlMode as DiscoveryCrawlMode } from './web-capture-discovery.js';

export type WebCaptureFrequency = 'manual' | 'daily' | 'weekly';
export type WebCaptureCrawlMode = DiscoveryCrawlMode;

export type CaptureEntry = {
  title: string;
  url: string;
  summary: string;
  score: number;
};

export type WebCaptureTask = {
  id: string;
  url: string;
  focus: string;
  frequency: WebCaptureFrequency;
  keywords?: string[];
  siteHints?: string[];
  seedUrls?: string[];
  crawlMode?: WebCaptureCrawlMode;
  maxItems?: number;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastStatus?: 'success' | 'error';
  lastSummary?: string;
  documentPath?: string;
  markdownPath?: string;
  rawDocumentPath?: string;
  rawDeleteAfterAt?: string;
  keepOriginalFiles?: boolean;
  title?: string;
  note?: string;
  nextRunAt?: string;
  lastCollectedCount?: number;
  lastCollectedItems?: CaptureEntry[];
  loginMode?: 'none' | 'credential';
  credentialRef?: string;
  credentialLabel?: string;
  captureStatus?: 'active' | 'paused';
  pausedAt?: string;
};

export type WebCaptureTaskCreateInput = {
  url: string;
  focus?: string;
  keywords?: string[];
  siteHints?: string[];
  seedUrls?: string[];
  crawlMode?: WebCaptureCrawlMode;
  frequency?: WebCaptureFrequency;
  note?: string;
  maxItems?: number;
  auth?: RuntimeAuth;
  credentialRef?: string;
  credentialLabel?: string;
  loginMode?: 'none' | 'credential';
  keepOriginalFiles?: boolean;
};

export type WebCaptureTaskUpsertInput = {
  id?: string;
  url: string;
  focus?: string;
  keywords?: string[];
  siteHints?: string[];
  seedUrls?: string[];
  crawlMode?: WebCaptureCrawlMode;
  frequency?: WebCaptureFrequency;
  note?: string;
  maxItems?: number;
  credentialRef?: string;
  credentialLabel?: string;
  captureStatus?: 'active' | 'paused';
  loginMode?: 'none' | 'credential';
  keepOriginalFiles?: boolean;
};
