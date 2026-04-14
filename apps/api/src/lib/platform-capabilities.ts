import {
  PLATFORM_CAPABILITY_AREAS,
  PLATFORM_OUTPUT_FORMATS,
} from './platform-capabilities-areas.js';
import {
  PLATFORM_BASE_RULES,
  PLATFORM_INTEGRATIONS,
} from './platform-capabilities-integrations.js';

export type {
  PlatformCapabilityArea,
  PlatformCapabilityAreaId,
  PlatformCommandSpec,
  PlatformIntegration,
  PlatformIntegrationKind,
} from './platform-capabilities-types.js';
export {
  PLATFORM_CAPABILITY_AREAS,
  PLATFORM_OUTPUT_FORMATS,
} from './platform-capabilities-areas.js';
export {
  PLATFORM_BASE_RULES,
  PLATFORM_INTEGRATIONS,
} from './platform-capabilities-integrations.js';

export function getPlatformCapabilityArea(id: string) {
  return PLATFORM_CAPABILITY_AREAS.find((item) => item.id === id) || null;
}

export function getPlatformIntegration(id: string) {
  return PLATFORM_INTEGRATIONS.find((item) => item.id === id) || null;
}

export function buildPlatformCapabilityContextLines(options?: { includeCommands?: boolean }) {
  const includeCommands = options?.includeCommands === true;
  const lines: string[] = [
    'Core platform areas are defined by a capability registry, not by ad-hoc chat orchestration.',
    ...PLATFORM_BASE_RULES.map((rule) => `- Rule: ${rule}`),
    `- Output formats: ${PLATFORM_OUTPUT_FORMATS.join(', ')}.`,
  ];

  if (!includeCommands) {
    lines.push('- Detailed CLI syntax exists in the host command registry and should only be surfaced when explicit execution or command help is requested.');
  }

  for (const area of PLATFORM_CAPABILITY_AREAS) {
    lines.push(`- ${area.label}: ${area.description}`);
    for (const ability of area.abilities) {
      lines.push(`  - ${ability}`);
    }
    if (includeCommands) {
      for (const command of area.commands) {
        lines.push(`  - Command: ${command.command}`);
      }
    }
  }

  lines.push('- Integrations and external tools you can rely on:');
  for (const integration of PLATFORM_INTEGRATIONS) {
    lines.push(`  - ${integration.label} (${integration.kind}): ${integration.description}`);
  }

  return lines;
}
