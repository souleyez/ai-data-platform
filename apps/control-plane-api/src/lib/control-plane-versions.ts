import type { ControlPlaneRelease, ControlPlaneUpgradeState } from './control-plane-schema.js';

interface ParsedVersion {
  year: number;
  month: number;
  day: number;
  build: number;
}

function parseVersion(value: string): ParsedVersion | null {
  const match = /^(\d{4})\.(\d{2})\.(\d{2})\+(\d+)$/.exec(value.trim());
  if (!match) {
    return null;
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    build: Number(match[4]),
  };
}

export function compareControlPlaneVersions(left: string, right: string): number {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return -1;
  }
  if (!right) {
    return 1;
  }

  const leftParsed = parseVersion(left);
  const rightParsed = parseVersion(right);

  if (!leftParsed || !rightParsed) {
    return left.localeCompare(right);
  }

  return (
    leftParsed.year - rightParsed.year
    || leftParsed.month - rightParsed.month
    || leftParsed.day - rightParsed.day
    || leftParsed.build - rightParsed.build
  );
}

export function sortReleasesDescending(releases: ControlPlaneRelease[]): ControlPlaneRelease[] {
  return [...releases].sort((left, right) => compareControlPlaneVersions(right.version, left.version));
}

export function resolveUpgradeState(options: {
  currentVersion: string;
  minSupportedVersion: string;
  latestVersion: string;
  forceUpgrade: boolean;
  selfRegistered: boolean;
}): ControlPlaneUpgradeState {
  const {
    currentVersion,
    minSupportedVersion,
    latestVersion,
    forceUpgrade,
    selfRegistered,
  } = options;

  if (forceUpgrade) {
    return 'force_upgrade_required';
  }

  if (minSupportedVersion && compareControlPlaneVersions(currentVersion, minSupportedVersion) < 0) {
    return 'force_upgrade_required';
  }

  if (selfRegistered && latestVersion && compareControlPlaneVersions(currentVersion, latestVersion) < 0) {
    return 'force_upgrade_required';
  }

  if (latestVersion && compareControlPlaneVersions(currentVersion, latestVersion) < 0) {
    return 'upgrade_available';
  }

  return 'ok';
}
