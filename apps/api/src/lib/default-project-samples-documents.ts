import { LABEL_BIDS, LABEL_IOT, LABEL_ORDER, LABEL_RESUME, type SampleDocDefinition } from './default-project-samples-types.js';

export const DEFAULT_SAMPLE_DOCUMENTS: SampleDocDefinition[] = [
  {
    sourceFileName: 'order-electronics-q1-2026.csv',
    storedFileName: 'default-sample-order-electronics-q1-2026.csv',
    groupLabel: LABEL_ORDER,
    legacyFileNames: ['sample-order-electronics-q1-2026.csv'],
  },
  {
    sourceFileName: 'order-ops-notes-q1-2026.md',
    storedFileName: 'default-sample-order-ops-notes-q1-2026.md',
    groupLabel: LABEL_ORDER,
    legacyFileNames: ['sample-order-ops-notes-q1-2026.md'],
  },
  {
    sourceFileName: 'order-electronics-omni-1000-orders-q1-2026.csv',
    storedFileName: 'default-sample-order-electronics-omni-1000-orders-q1-2026.csv',
    groupLabel: LABEL_ORDER,
  },
  {
    sourceFileName: 'order-channel-category-summary-q1-2026.csv',
    storedFileName: 'default-sample-order-channel-category-summary-q1-2026.csv',
    groupLabel: LABEL_ORDER,
  },
  {
    sourceFileName: 'order-inventory-snapshot-q1-2026.csv',
    storedFileName: 'default-sample-order-inventory-snapshot-q1-2026.csv',
    groupLabel: LABEL_ORDER,
  },
  {
    sourceFileName: 'order-cockpit-notes-q1-2026.md',
    storedFileName: 'default-sample-order-cockpit-notes-q1-2026.md',
    groupLabel: LABEL_ORDER,
  },
  {
    sourceFileName: 'resume-senior-ops-manager.md',
    storedFileName: 'default-sample-resume-senior-ops-manager.md',
    groupLabel: LABEL_RESUME,
    legacyFileNames: ['sample-resume-senior-ops-manager.md'],
  },
  {
    sourceFileName: 'iot-smart-warehouse-solution.md',
    storedFileName: 'default-sample-iot-smart-warehouse-solution.md',
    groupLabel: LABEL_IOT,
    legacyFileNames: ['sample-iot-smart-warehouse-solution.md'],
  },
  {
    sourceFileName: 'iot-reference-architecture.md',
    storedFileName: 'default-sample-iot-reference-architecture.md',
    groupLabel: LABEL_IOT,
    legacyFileNames: ['sample-iot-reference-architecture.pdf', 'sample-iot-reference-architecture.md'],
  },
  {
    sourceFileName: 'tender-guangzhou-sample.md',
    storedFileName: 'default-sample-tender-guangzhou.md',
    groupLabel: LABEL_BIDS,
    legacyFileNames: ['sample-tender-guangzhou.pdf', 'tender-3-guangzhou.pdf'],
  },
  {
    sourceFileName: 'tender-template-hospital.md',
    storedFileName: 'default-sample-tender-template-hospital.md',
    groupLabel: LABEL_BIDS,
    legacyFileNames: ['sample-tender-template-hospital.pdf', 'tender-template-hospital.pdf', 'tender-1-guangxi-hospital.pdf'],
  },
];

