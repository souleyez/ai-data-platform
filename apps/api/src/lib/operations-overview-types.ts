import type { TaskRuntimeMetricsRecord } from './task-runtime-metrics.js';

export type StabilityWarning = {
  key: string;
  level: 'warning' | 'critical';
  area: 'parse' | 'datasource' | 'capture' | 'memory-sync' | 'dataviz' | 'report';
  title: string;
  detail: string;
};

export type Phase1StabilityBlock = {
  generatedAt: string;
  summary: {
    warningCount: number;
    criticalCount: number;
    deepParseBacklog: number;
    datasourceFailedRuns: number;
    captureErrorTasks: number;
    dynamicOutputCount: number;
    draftBlockedCount: number;
    draftNeedsAttentionCount: number;
  };
  backlog: {
    deepParseQueued: number;
    deepParseProcessing: number;
    datasourceRunning: number;
    captureScheduled: number;
    dynamicOutputs: number;
  };
  durations: {
    datasourceAvgDurationMs: number;
    deepParseAvgDurationMs: number;
    memorySyncAvgDurationMs: number;
    datavizAvgDurationMs: number;
  };
  failures: {
    datasourceFailedRuns: number;
    datasourcePartialRuns: number;
    captureErrorTasks: number;
    datavizStatus: string;
    datavizLastError: string;
    memorySyncStatus: string;
    memorySyncLastError: string;
  };
  tasks: {
    deepParse: TaskRuntimeMetricsRecord | null;
    memorySync: TaskRuntimeMetricsRecord | null;
    dataviz: TaskRuntimeMetricsRecord | null;
  };
  warnings: StabilityWarning[];
};
