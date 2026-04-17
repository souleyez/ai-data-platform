import { LABEL_IOT, type SampleOutputDefinition } from './default-project-samples-types.js';

export const DEFAULT_SAMPLE_IOT_OUTPUTS: SampleOutputDefinition[] = [
  {
    title: '[\u7cfb\u7edf\u6837\u4f8b] IOT\u89e3\u51b3\u65b9\u6848\u9759\u6001\u9875',
    groupLabel: LABEL_IOT,
    kind: 'page',
    content: '\u667a\u6167\u4ed3\u50a8 IOT \u89e3\u51b3\u65b9\u6848\u7cfb\u7edf\u6837\u4f8b\u9875\u3002',
    page: {
      viewportTarget: 'mobile',
      summary:
        '\u8be5\u65b9\u6848\u9762\u5411\u667a\u6167\u4ed3\u50a8\uff0c\u91c7\u7528\u8bbe\u5907\u5c42\u3001\u8fb9\u7f18\u5c42\u3001\u5e73\u53f0\u5c42\u3001\u5e94\u7528\u5c42\u56db\u5c42\u67b6\u6784\uff0c\u5f3a\u8c03\u8bbe\u5907\u63a5\u5165\u3001\u544a\u8b66\u8054\u52a8\u548c\u8fd0\u8425\u53ef\u89c6\u5316\u3002',
      cards: [
        { label: '\u90e8\u7f72\u6a21\u5f0f', value: '\u8fb9\u7f18 + \u4e91', note: '\u53cc\u5c42\u90e8\u7f72' },
        { label: '\u6838\u5fc3\u534f\u8bae', value: 'MQTT / Modbus / REST', note: '\u517c\u5bb9\u591a\u8bbe\u5907' },
        { label: '\u76ee\u6807\u573a\u666f', value: '\u667a\u6167\u4ed3\u50a8', note: '\u591a\u4ed3\u534f\u540c' },
      ],
      sections: [
        {
          title: '\u65b9\u6848\u6982\u89c8',
          body: '\u9762\u5411\u533a\u57df\u4ed3\u914d\u4e2d\u5fc3\u7684\u667a\u6167\u4ed3\u50a8 IOT \u65b9\u6848\u3002',
          bullets: ['\u8bbe\u5907\u63a5\u5165\u7edf\u4e00', '\u544a\u8b66\u8054\u52a8\u95ed\u73af', '\u5e93\u5b58\u611f\u77e5\u53ef\u89c6\u5316'],
        },
        {
          title: '\u7cfb\u7edf\u67b6\u6784',
          body: '\u8bbe\u5907\u5c42\u3001\u8fb9\u7f18\u5c42\u3001\u5e73\u53f0\u5c42\u3001\u5e94\u7528\u5c42\u56db\u5c42\u7ed3\u6784\u3002',
          bullets: ['\u8fb9\u7f18\u7f51\u5173\u627f\u62c5\u534f\u8bae\u63a5\u5165', '\u5e73\u53f0\u5c42\u627f\u62c5\u89c4\u5219\u4e0e\u6570\u636e\u7ba1\u7406'],
        },
        {
          title: '\u63a5\u53e3\u4e0e\u96c6\u6210',
          body: '\u652f\u6301 REST\u3001MQTT\u3001Webhook \u7b49\u96c6\u6210\u65b9\u5f0f\u3002',
          bullets: ['\u5bf9\u63a5 ERP/WMS', '\u63a5\u5165\u4f01\u4e1a\u5fae\u4fe1\u544a\u8b66'],
        },
        {
          title: '\u5173\u952e\u6536\u76ca',
          body: '\u63d0\u5347\u76d8\u70b9\u51c6\u786e\u7387\u4e0e\u8bbe\u5907\u5728\u7ebf\u7387\uff0c\u964d\u4f4e\u5de1\u68c0\u6210\u672c\u3002',
          bullets: ['\u5728\u7ebf\u7387 >= 98%', '\u5de1\u68c0\u6210\u672c\u4e0b\u964d 30%'],
        },
      ],
      charts: [
        {
          title: '\u6838\u5fc3\u4ef7\u503c\u5360\u6bd4\u997c\u56fe',
          items: [
            { label: '\u5e93\u5b58\u53ef\u89c6\u5316', value: 32 },
            { label: '\u544a\u8b66\u54cd\u5e94', value: 27 },
            { label: '\u8bbe\u5907\u63a5\u5165', value: 21 },
            { label: '\u8fd0\u7ef4\u6548\u7387', value: 20 },
          ],
        },
        {
          title: '\u6a21\u5757\u5efa\u8bbe\u8fdb\u5ea6\u67f1\u72b6\u56fe',
          items: [
            { label: '\u611f\u77e5\u63a5\u5165', value: 85 },
            { label: '\u8fb9\u7f18\u7f51\u5173', value: 72 },
            { label: '\u89c4\u5219\u5f15\u64ce', value: 66 },
            { label: '\u53ef\u89c6\u5316\u5927\u5c4f', value: 58 },
          ],
        },
        {
          title: '\u9879\u76ee\u4ea4\u4ed8\u91cc\u7a0b\u7891\u8d8b\u52bf',
          items: [
            { label: 'M1', value: 25 },
            { label: 'M2', value: 52 },
            { label: 'M3', value: 78 },
            { label: 'M4', value: 100 },
          ],
        },
      ],
    },
  },
];

