export type ReportDraftBenchmarkScenario = {
  key: string;
  label: string;
  total: number;
  ready: number;
  needsAttention: number;
  blocked: number;
  readyRatio: number;
  averageEvidenceCoverage: number;
  latestTitle: string;
  latestCreatedAt: string;
};

export type ReportDraftBenchmarkSummary = {
  totals: {
    drafts: number;
    ready: number;
    needsAttention: number;
    blocked: number;
    readyRatio: number;
  };
  scenarios: ReportDraftBenchmarkScenario[];
};
