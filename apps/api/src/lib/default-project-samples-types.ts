export type SampleDocDefinition = {
  sourceFileName: string;
  storedFileName: string;
  groupLabel: string;
  legacyFileNames?: string[];
};

export type SampleOutputDefinition = {
  title: string;
  groupLabel: string;
  kind: 'table' | 'page';
  content: string;
  table?: {
    title?: string;
    columns?: string[];
    rows?: Array<Array<string | number | null>>;
  } | null;
  page?: {
    summary?: string;
    cards?: Array<{ label?: string; value?: string; note?: string }>;
    sections?: Array<{ title?: string; body?: string; bullets?: string[] }>;
    charts?: Array<{ title?: string; items?: Array<{ label?: string; value?: number }> }>;
  } | null;
};

export const LABEL_ORDER = '\u8ba2\u5355\u5206\u6790';
export const LABEL_RESUME = '\u7b80\u5386';
export const LABEL_BIDS = 'bids';
export const LABEL_IOT = 'IOT\u89e3\u51b3\u65b9\u6848';

