import type { DatasourceKind, DatasourceTargetLibrary } from './datasource-definitions.js';

export type DatasourcePreset = {
  id: string;
  name: string;
  kind: DatasourceKind;
  category: 'bids' | 'academic' | 'business';
  authority: string;
  baseUrl: string;
  description: string;
  focus: string;
  suggestedLibraries: DatasourceTargetLibrary[];
  authMode: 'none' | 'credential' | 'manual_session' | 'database_password' | 'api_token';
  config: Record<string, unknown>;
};

export const DATASOURCE_PRESETS: DatasourcePreset[] = [
  {
    id: 'preset-ggzy-national',
    name: '全国公共资源交易平台',
    kind: 'web_discovery',
    category: 'bids',
    authority: '国家级公共资源交易信息平台',
    baseUrl: 'https://www.ggzy.gov.cn/',
    description: '适合按地区、行业和关键词持续采集公开招标、结果公示与变更公告。',
    focus: '招标公告、变更公告、中标结果、项目编号、采购单位、地区、行业',
    suggestedLibraries: [{ key: 'bids', label: 'bids', mode: 'primary' }],
    authMode: 'none',
    config: {
      seedUrls: ['https://www.ggzy.gov.cn/'],
      crawlMode: 'listing-detail',
      maxItemsPerRun: 20,
    },
  },
  {
    id: 'preset-ccgp',
    name: '中国政府采购网',
    kind: 'web_discovery',
    category: 'bids',
    authority: '财政部政府采购信息发布平台',
    baseUrl: 'https://www.ccgp.gov.cn/',
    description: '适合持续采集政府采购公告、结果公告、政策法规与地方采购分网信息。',
    focus: '采购公告、结果公告、意向公告、政策法规、项目预算、采购人',
    suggestedLibraries: [{ key: 'bids', label: 'bids', mode: 'primary' }],
    authMode: 'none',
    config: {
      seedUrls: ['https://www.ccgp.gov.cn/'],
      crawlMode: 'listing-detail',
      maxItemsPerRun: 20,
    },
  },
  {
    id: 'preset-cebpubservice',
    name: '中国招标投标公共服务平台',
    kind: 'web_discovery',
    category: 'bids',
    authority: '公开招投标信息平台',
    baseUrl: 'http://www.cebpubservice.com/',
    description: '适合工程建设类招投标公告采集，补充公共资源交易平台之外的工程招标来源。',
    focus: '招标公告、资格预审、中标结果、标段、投标要求、监督部门',
    suggestedLibraries: [{ key: 'bids', label: 'bids', mode: 'primary' }],
    authMode: 'none',
    config: {
      seedUrls: ['http://www.cebpubservice.com/'],
      crawlMode: 'listing-detail',
      maxItemsPerRun: 20,
    },
  },
  {
    id: 'preset-pmc',
    name: 'PubMed Central',
    kind: 'web_discovery',
    category: 'academic',
    authority: 'NIH / NLM',
    baseUrl: 'https://pmc.ncbi.nlm.nih.gov/',
    description: '适合持续采集公开全文论文、方法、结果、结论和表格内容。',
    focus: '公开全文论文、摘要、方法、结果、结论、表格、关键词',
    suggestedLibraries: [],
    authMode: 'none',
    config: {
      seedUrls: ['https://pmc.ncbi.nlm.nih.gov/'],
      crawlMode: 'listing-detail',
      maxItemsPerRun: 10,
    },
  },
  {
    id: 'preset-arxiv',
    name: 'arXiv',
    kind: 'web_discovery',
    category: 'academic',
    authority: 'Cornell University',
    baseUrl: 'https://arxiv.org/',
    description: '适合持续采集 AI、计算机、数学等方向的公开论文和预印本。',
    focus: '预印本论文、摘要、方法、技术路线、实验结果',
    suggestedLibraries: [],
    authMode: 'none',
    config: {
      seedUrls: ['https://arxiv.org/'],
      crawlMode: 'listing-detail',
      maxItemsPerRun: 10,
    },
  },
  {
    id: 'preset-doaj',
    name: 'DOAJ',
    kind: 'web_discovery',
    category: 'academic',
    authority: 'Directory of Open Access Journals',
    baseUrl: 'https://doaj.org/',
    description: '适合发现开放获取期刊和可公开访问论文。',
    focus: '开放获取论文、期刊主页、摘要、主题标签',
    suggestedLibraries: [],
    authMode: 'none',
    config: {
      seedUrls: ['https://doaj.org/'],
      crawlMode: 'listing-detail',
      maxItemsPerRun: 10,
    },
  },
  {
    id: 'preset-who-iris',
    name: 'WHO IRIS',
    kind: 'web_discovery',
    category: 'academic',
    authority: 'World Health Organization',
    baseUrl: 'https://iris.who.int/',
    description: '适合采集公共卫生研究报告、政策建议和公开数据报告。',
    focus: '公共卫生、研究报告、政策建议、结论、指标、建议',
    suggestedLibraries: [],
    authMode: 'none',
    config: {
      seedUrls: ['https://iris.who.int/'],
      crawlMode: 'listing-detail',
      maxItemsPerRun: 10,
    },
  },
];

export function listDatasourcePresets() {
  return DATASOURCE_PRESETS;
}
