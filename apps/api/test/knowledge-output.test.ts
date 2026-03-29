import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKnowledgeFallbackOutput,
  normalizeReportOutput,
} from '../src/lib/knowledge-output.js';
import type { ParsedDocument } from '../src/lib/document-parser.js';

test('normalizeReportOutput should accept root-level columns and rows', () => {
  const output = normalizeReportOutput(
    'table',
    '按技能维度输出表格',
    JSON.stringify({
      title: '候选人技能维度信息表',
      content: '根据人才简历知识库整理',
      columns: ['技能类别', '候选人', '技能详情', '证据来源'],
      rows: [
        ['Java', '张三', 'Spring Boot / 微服务', 'resume-a.pdf'],
        ['Python', '李四', '数据分析 / 自动化脚本', 'resume-b.pdf'],
      ],
    }),
    {
      title: '简历技能维度表',
      fixedStructure: [],
      variableZones: [],
      outputHint: '按技能维度整理',
      tableColumns: ['技能类别', '候选人', '技能详情', '证据来源'],
    },
  );

  assert.equal(output.type, 'table');
  assert.deepEqual(output.table?.columns, ['技能类别', '候选人', '技能详情', '证据来源']);
  assert.equal(output.table?.rows?.length, 2);
});

test('normalizeReportOutput should align object rows to envelope columns', () => {
  const output = normalizeReportOutput(
    'table',
    '按公司维度整理 IT 项目信息',
    JSON.stringify({
      title: '简历 IT 项目公司维度表',
      rows: [
        {
          公司: '甲公司',
          候选人: '王某',
          IT项目: 'ERP 升级',
          '项目角色/职责': '负责方案与交付',
          '技术栈/系统关键词': 'SAP / ERP',
          时间线: '2023-2024',
          证据来源: 'resume-1.pdf',
        },
      ],
    }),
    {
      title: '简历 IT 项目公司维度表',
      fixedStructure: [],
      variableZones: [],
      outputHint: '按公司维度整理简历中的 IT 项目经历',
      tableColumns: ['公司', '候选人', 'IT项目', '项目角色/职责', '技术栈/系统关键词', '时间线', '证据来源'],
    },
  );

  assert.equal(output.type, 'table');
  assert.deepEqual(output.table?.columns, ['公司', '候选人', 'IT项目', '项目角色/职责', '技术栈/系统关键词', '时间线', '证据来源']);
  assert.deepEqual(output.table?.rows?.[0], ['甲公司', '王某', 'ERP 升级', '负责方案与交付', 'SAP / ERP', '2023-2024', 'resume-1.pdf']);
});

test('normalizeReportOutput should align page sections to envelope sections', () => {
  const output = normalizeReportOutput(
    'page',
    '按公司维度生成静态页',
    JSON.stringify({
      title: '简历公司维度 IT 项目静态页',
      summary: '这是摘要。',
      sections: [
        { title: '公司概览', body: '公司维度概览。' },
        { title: '技术关键词', body: '技术关键词内容。' },
      ],
      cards: [{ label: '公司数', value: '5', note: '样例' }],
    }),
    {
      title: '简历公司维度 IT 项目静态页',
      fixedStructure: [],
      variableZones: [],
      outputHint: '按公司维度整理简历中的 IT 项目经历',
      pageSections: ['公司概览', '重点项目分布', '候选人覆盖', '技术关键词', '风险与机会', 'AI综合分析'],
    },
  );

  assert.equal(output.type, 'page');
  assert.deepEqual(output.page?.sections?.map((item) => item.title), ['公司概览', '重点项目分布', '候选人覆盖', '技术关键词', '风险与机会', 'AI综合分析']);
  assert.equal(output.page?.sections?.[0]?.body, '公司维度概览。');
  assert.equal(output.page?.sections?.[3]?.body, '技术关键词内容。');
});

test('normalizeReportOutput should prefer envelope title for template-aligned pages', () => {
  const output = normalizeReportOutput(
    'page',
    '按人才维度生成静态页',
    JSON.stringify({
      title: '一个泛化标题',
      summary: '摘要',
      sections: [{ title: '人才概览', body: '内容' }],
    }),
    {
      title: '简历人才维度静态页',
      fixedStructure: [],
      variableZones: [],
      outputHint: '按人才维度整理简历信息',
      pageSections: ['人才概览', '学历与背景', '公司经历', '项目经历', '核心能力', 'AI综合分析'],
    },
  );

  assert.equal(output.title, '简历人才维度静态页');
});

test('buildKnowledgeFallbackOutput should produce resume company table when cloud output is unavailable', () => {
  const documents: ParsedDocument[] = [
    {
      path: 'resume-1.pdf',
      name: 'resume-1.pdf',
      ext: '.pdf',
      title: '张三简历',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: '简历摘要',
      excerpt: '简历摘要',
      extractedChars: 1280,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: '张三',
        latestCompany: '甲公司',
        companies: ['甲公司'],
        skills: ['Java', 'ERP'],
        itProjectHighlights: ['负责甲公司 ERP 升级项目，担任实施负责人，时间 2023-2024'],
      },
    },
  ];

  const output = buildKnowledgeFallbackOutput(
    'table',
    '基于人才简历知识库中全部时间范围的简历，按公司维度整理涉及公司的 IT 项目信息，输出表格。',
    documents,
    {
      title: '简历 IT 项目公司维度表',
      fixedStructure: [],
      variableZones: [],
      outputHint: '按公司维度输出简历 IT 项目经历',
      tableColumns: ['公司', '候选人', 'IT项目', '项目角色/职责', '技术栈/系统关键词', '时间线', '证据来源'],
    },
  );

  assert.equal(output.type, 'table');
  assert.equal(output.table?.columns?.[0], '公司');
  assert.equal(output.table?.rows?.[0]?.[0], '甲公司');
  assert.equal(output.table?.rows?.[0]?.[1], '张三');
});

test('buildKnowledgeFallbackOutput should clean noisy resume candidate names for talent pages', () => {
  const documents: ParsedDocument[] = [
    {
      path: 'resume-1.pdf',
      name: '1774599818136-夏天宇简历（产品经理）2024.pdf',
      ext: '.pdf',
      title: 'RESUME',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: 'RESUME 夏天宇 求职意向：产品经理 5年经验，参与 AIGC 平台和智慧社区项目。',
      excerpt: 'RESUME 夏天宇 求职意向：产品经理 5年经验。',
      extractedChars: 1280,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: 'RESUME',
        education: '研究生',
        skills: ['产品设计', 'Axure', '需求分析'],
        projectHighlights: ['AIGC 平台产品规划', '智慧社区产品设计'],
      },
    },
    {
      path: 'resume-2.pdf',
      name: '1774599953283-何先生简历.pdf',
      ext: '.pdf',
      title: '男 | 年龄：38岁 | 16782079675',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: '何先生，17年工作经验，曾任广州鹰云信息科技有限公司区域总监，负责智慧园区和支付平台项目。',
      excerpt: '何先生，17年工作经验。',
      extractedChars: 1280,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: '年龄',
        education: '大专',
        skills: ['销售管理', '项目跟进'],
        projectHighlights: ['智慧园区项目销售管理', '支付平台交付跟进'],
      },
    },
    {
      path: 'resume-3.pdf',
      name: '1774599953287-吴楚镰简历.pdf',
      ext: '.pdf',
      title: '邮箱：1187927981@qq.com',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: '吴楚镰，29岁，五年软件行业销售经验，负责医院智能化与零售信息化项目。',
      excerpt: '吴楚镰，29岁。',
      extractedChars: 1280,
      schemaType: 'resume',
      structuredProfile: {
        education: '大专',
        skills: ['标书制作', '方案演讲'],
        projectHighlights: ['医院智能化项目', '零售信息化项目'],
      },
    },
  ];

  const output = buildKnowledgeFallbackOutput(
    'page',
    '基于人才简历知识库中全部时间范围的简历，按人才维度整理候选人背景和项目信息，生成数据可视化静态页报表。',
    documents,
    {
      title: '简历人才维度静态页',
      fixedStructure: [],
      variableZones: [],
      outputHint: '按人才维度整理简历信息',
      pageSections: ['人才概览', '学历与背景', '公司经历', '项目经历', '核心能力', 'AI综合分析'],
    },
  );

  assert.equal(output.type, 'page');
  assert.equal(output.page?.cards?.[1]?.value, '3');
  assert.doesNotMatch(output.page?.sections?.[0]?.body || '', /\bRESUME\b|年龄：/i);
  assert.doesNotMatch((output.page?.charts?.[0]?.items || []).map((item) => item.label).join('|'), /\bRESUME\b|年龄/i);
  assert.match(JSON.stringify(output.page), /夏天宇|何先生|吴楚镰/);
});

test('buildKnowledgeFallbackOutput should create a client-facing resume page for client requests', () => {
  const documents: ParsedDocument[] = [
    {
      path: 'resume-1.pdf',
      name: '夏天宇简历.pdf',
      ext: '.pdf',
      title: '夏天宇简历',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: '夏天宇，5年经验，阿里斑马网络产品经理，负责智能座舱和 AIGC 平台项目。',
      excerpt: '夏天宇，5年经验。',
      extractedChars: 1280,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: '夏天宇',
        latestCompany: '阿里斑马网络',
        yearsOfExperience: '5年经验',
        education: '本科',
        skills: ['产品设计', 'Axure', '需求分析'],
        projectHighlights: ['智能座舱系统产品规划', 'AIGC 平台产品规划'],
      },
    },
    {
      path: 'resume-2.pdf',
      name: '谢泽强简历.pdf',
      ext: '.pdf',
      title: '谢泽强简历',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: '谢泽强，16年经验，深圳达实智能股份有限公司，负责智慧园区和智能化项目。',
      excerpt: '谢泽强，16年经验。',
      extractedChars: 1280,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: '谢泽强',
        latestCompany: '深圳达实智能股份有限公司',
        yearsOfExperience: '16年经验',
        education: '大专',
        skills: ['项目管理', '智慧园区', '解决方案'],
        projectHighlights: ['智慧园区项目交付', '智能化项目解决方案'],
      },
    },
  ];

  const output = buildKnowledgeFallbackOutput(
    'page',
    '请基于人才简历知识库中全部时间范围的简历，为客户汇报准备一页可视化静态页，需要突出人才概览、代表项目、核心技能、匹配建议和 AI 综合分析。',
    documents,
  );

  assert.equal(output.type, 'page');
  assert.equal(output.title, '简历客户汇报静态页');
  assert.deepEqual(
    output.page?.sections?.map((item) => item.title),
    ['客户概览', '代表候选人', '代表项目', '技能覆盖', '匹配建议', 'AI综合分析'],
  );
  assert.doesNotMatch(output.page?.sections?.[1]?.body || '', /\s\|\s/);
  assert.match((output.page?.sections?.[1]?.bullets || []).join('\n'), /夏天宇|谢泽强/);
});

test('normalizeReportOutput should fallback low-quality resume client pages to deterministic client view', () => {
  const documents: ParsedDocument[] = [
    {
      path: 'resume-1.pdf',
      name: '夏天宇简历.pdf',
      ext: '.pdf',
      title: '夏天宇简历',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: '夏天宇，5年经验，阿里斑马网络产品经理，负责智能座舱和 AIGC 平台项目。',
      excerpt: '夏天宇，5年经验。',
      extractedChars: 1280,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: '夏天宇',
        latestCompany: '阿里斑马网络',
        yearsOfExperience: '5年经验',
        education: '本科',
        skills: ['产品设计', 'Axure', '需求分析'],
        projectHighlights: ['智能座舱系统产品规划', 'AIGC 平台产品规划'],
      },
    },
  ];

  const output = normalizeReportOutput(
    'page',
    '请基于人才简历知识库中全部时间范围的简历，为客户汇报准备一页可视化静态页，需要突出人才概览、代表项目、核心技能、匹配建议和 AI 综合分析。',
    JSON.stringify({
      title: '简历人才维度静态页',
      summary: '当前基于库内 10 份简历整理出 40 条技能条目，可直接用于招聘筛选。',
      sections: [
        { title: '人才概览', body: '产品设计 | 夏天宇简历 | 产品设计 | 创立了一个集成人工智能' },
        { title: '核心能力', body: 'Java | 夏天宇简历 | Java | 创立了一个集成人工智能' },
      ],
      charts: [{ title: '技能覆盖分布', items: [{ label: '产品设计', value: 1 }] }],
    }),
    null,
    documents,
  );

  assert.equal(output.type, 'page');
  assert.equal(output.title, '简历客户汇报静态页');
  assert.deepEqual(
    output.page?.sections?.map((item) => item.title),
    ['客户概览', '代表候选人', '代表项目', '技能覆盖', '匹配建议', 'AI综合分析'],
  );
  assert.doesNotMatch(JSON.stringify(output.page), /\s\|\s/);
});

test('normalizeReportOutput should fallback suspicious hard-metric resume company pages', () => {
  const documents: ParsedDocument[] = [
    {
      path: 'resume-1.pdf',
      name: '谢泽强简历.pdf',
      ext: '.pdf',
      title: '谢泽强简历',
      category: 'resume',
      bizCategory: 'general',
      parseStatus: 'parsed',
      summary: '谢泽强，16年经验，深圳达实智能股份有限公司，负责智慧园区和智能化项目。',
      excerpt: '谢泽强，16年经验。',
      extractedChars: 1280,
      schemaType: 'resume',
      structuredProfile: {
        candidateName: '谢泽强',
        latestCompany: '深圳达实智能股份有限公司',
        yearsOfExperience: '16年经验',
        education: '大专',
        skills: ['项目管理', '智慧园区', '解决方案'],
        projectHighlights: ['智慧园区项目交付', '智能化项目解决方案'],
      },
    },
  ];

  const output = normalizeReportOutput(
    'page',
    '请基于人才简历知识库中全部时间范围的简历，按公司维度整理涉及公司的 IT 项目信息，生成数据可视化静态页报表。',
    JSON.stringify({
      title: '简历公司维度 IT 项目静态页',
      summary: '覆盖 8 份简历，涉及 7 家公司。',
      cards: [{ label: 'IT项目信号', value: '12+', note: '示例' }],
      sections: [
        { title: '重点项目分布', body: '虎牙全球研发总部项目：总投资15亿元' },
        { title: '候选人覆盖', body: '李明轩：三平台年销售额从1.2亿提升至1.8亿' },
      ],
    }),
    null,
    documents,
  );

  assert.equal(output.type, 'page');
  assert.equal(output.title, '简历公司维度 IT 项目静态页');
  assert.doesNotMatch(JSON.stringify(output.page), /15亿元|12\+|1\.2亿|1\.8亿/);
  assert.equal(output.page?.cards?.[2]?.value, '2');
});

test('normalizeReportOutput should convert supply-echo json into readable concept page output', () => {
  const output = normalizeReportOutput(
    'page',
    '请基于 bids 知识库按风险维度生成静态页',
    JSON.stringify({
      scope: {
        libraries: [{ key: 'bids', label: '标书资料库' }],
        outputKind: 'static-page',
      },
      documents: [
        {
          title: '投标须知',
          summary: '说明资格要求、材料准备和截止时间。',
          whySelected: '命中风险维度供料',
        },
      ],
      evidence: [
        {
          title: '资格要求',
          text: '需要营业执照、业绩案例和资质证书。',
        },
      ],
      templateGuidance: {
        preferredSections: ['风险概览', '资格风险', '材料缺口', '时间风险', '应答建议', 'AI综合分析'],
        groupingHints: ['按风险维度分组', '按紧急程度排序'],
        outputHint: '生成可转发的数据可视化静态页',
      },
      gaps: ['缺少时间节点和截止日期信息'],
    }),
    null,
  );

  assert.equal(output.type, 'page');
  assert.doesNotMatch(output.page?.summary || '', /^```json/i);
  assert.match(output.page?.summary || '', /缺少时间节点和截止日期信息/);
  assert.equal(output.content, output.page?.summary);
  assert.deepEqual(
    output.page?.sections?.map((item) => item.title),
    ['风险概览', '资格风险', '材料缺口', '时间风险', '应答建议', 'AI综合分析'],
  );
  assert.ok((output.page?.cards?.length || 0) >= 1);
  assert.match(output.page?.sections?.[1]?.body || '', /缺少时间节点和截止日期信息/);
});

test('normalizeReportOutput should convert request-echo pages into readable fallback page output', () => {
  const requestText = '请基于 IOT解决方案 知识库中全部时间范围的资料，按模块维度生成数据可视化静态页报表。';
  const output = normalizeReportOutput(
    'page',
    requestText,
    requestText,
    {
      title: 'IOT 解决方案模块维度静态页',
      fixedStructure: [],
      variableZones: [],
      outputHint: '按模块维度生成静态页',
      pageSections: ['模块概览', '设备与网关', '平台能力', '接口集成', '交付关系', 'AI综合分析'],
    },
  );

  assert.equal(output.type, 'page');
  assert.notEqual(output.page?.summary, requestText);
  assert.match(output.page?.summary || '', /未稳定产出结构化页面内容/);
  assert.ok((output.page?.cards?.length || 0) >= 2);
  assert.deepEqual(
    output.page?.sections?.map((item) => item.title),
    ['模块概览', '设备与网关', '平台能力', '接口集成', '交付关系', 'AI综合分析'],
  );
  assert.match(output.page?.sections?.[0]?.body || '', /未稳定产出结构化页面内容/);
  assert.match(output.page?.sections?.[1]?.body || '', /原始请求：请基于 IOT解决方案/);
});
