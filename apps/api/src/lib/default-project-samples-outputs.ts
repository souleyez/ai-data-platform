import type { SampleOutputDefinition } from './default-project-samples-types.js';
import { DEFAULT_SAMPLE_BIDS_OUTPUTS } from './default-project-samples-bids-outputs.js';
import { DEFAULT_SAMPLE_IOT_OUTPUTS } from './default-project-samples-iot-outputs.js';
import { DEFAULT_SAMPLE_ORDER_OUTPUTS } from './default-project-samples-order-outputs.js';
import { DEFAULT_SAMPLE_RESUME_OUTPUTS } from './default-project-samples-resume-outputs.js';

export const DEFAULT_SAMPLE_OUTPUTS: SampleOutputDefinition[] = [
  ...DEFAULT_SAMPLE_ORDER_OUTPUTS,
  ...DEFAULT_SAMPLE_RESUME_OUTPUTS,
  ...DEFAULT_SAMPLE_BIDS_OUTPUTS,
  ...DEFAULT_SAMPLE_IOT_OUTPUTS,
];
