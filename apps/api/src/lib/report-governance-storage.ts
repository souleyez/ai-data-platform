import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, STORAGE_ROOT } from './paths.js';
import {
  mergeConfig,
  normalizeConfig,
} from './report-governance-normalization.js';
import type { ReportGovernanceConfig } from './report-governance-types.js';

const REPORT_GOVERNANCE_DEFAULT_FILE = path.join(REPO_ROOT, 'config', 'report-governance.default.json');
const REPORT_GOVERNANCE_STORAGE_FILE = path.join(STORAGE_ROOT, 'control-plane', 'report-governance.json');

function readJsonObject(filePath: string) {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

function loadNormalizedConfig(filePath: string) {
  return normalizeConfig(readJsonObject(filePath));
}

function loadConfigFromDisk() {
  const defaults = loadNormalizedConfig(REPORT_GOVERNANCE_DEFAULT_FILE);
  if (!existsSync(REPORT_GOVERNANCE_STORAGE_FILE)) {
    return defaults;
  }

  return mergeConfig(defaults, loadNormalizedConfig(REPORT_GOVERNANCE_STORAGE_FILE));
}

export function readReportGovernanceConfig(): ReportGovernanceConfig {
  return loadConfigFromDisk();
}
