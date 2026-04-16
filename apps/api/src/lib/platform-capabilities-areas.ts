import type { PlatformCapabilityArea } from './platform-capabilities-types.js';
import { PLATFORM_CORE_CAPABILITY_AREAS } from './platform-capabilities-area-core.js';
import { PLATFORM_DATASOURCE_CAPABILITY_AREA } from './platform-capabilities-area-datasources.js';
import { PLATFORM_DOCUMENT_CAPABILITY_AREA } from './platform-capabilities-area-documents.js';
import { PLATFORM_MODEL_CAPABILITY_AREA } from './platform-capabilities-area-models.js';
import { PLATFORM_REPORT_CAPABILITY_AREA } from './platform-capabilities-area-reports.js';

export const PLATFORM_OUTPUT_FORMATS = ['table', 'page', 'doc', 'md', 'pdf', 'ppt'] as const;

export const PLATFORM_CAPABILITY_AREAS: PlatformCapabilityArea[] = [
  ...PLATFORM_CORE_CAPABILITY_AREAS,
  PLATFORM_DOCUMENT_CAPABILITY_AREA,
  PLATFORM_DATASOURCE_CAPABILITY_AREA,
  PLATFORM_REPORT_CAPABILITY_AREA,
  PLATFORM_MODEL_CAPABILITY_AREA,
];
