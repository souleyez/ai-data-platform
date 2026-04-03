import type { ReportTemplateEnvelope } from './report-center.js';

type KnowledgeOutputKind = 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md';

type ConceptEnvelopeVariant = {
  title: string;
  fixedStructure: string[];
  variableZones: string[];
  outputHint: string;
  pageSections?: string[];
  tableColumns?: string[];
};

type ConceptEnvelopeRuleSet<TView extends string> = Record<Exclude<TView, 'generic'>, {
  page: ConceptEnvelopeVariant;
  table: ConceptEnvelopeVariant;
}>;

export const BID_CONCEPT_RULES = {
  section: {
    page: {
      title: '标书章节维度静态页',
      fixedStructure: [
        '按章节维度拆解标书结构、资格条件和关键时间节点。',
        '优先形成适合投标团队浏览的结构化页面。',
      ],
      variableZones: ['项目概况', '章节拆解', '资格条件', '关键时间节点', '风险提醒', 'AI综合分析'],
      outputHint: '按章节维度组织招投标资料，突出资格条件、章节结构和时间节点。',
      pageSections: ['项目概况', '章节拆解', '资格条件', '关键时间节点', '风险提醒', 'AI综合分析'],
    },
    table: {
      title: '标书章节维度表',
      fixedStructure: [
        '按章节维度梳理项目要求、资格条件和关键时间节点。',
        '表格列需要稳定，适合协同补材料。',
      ],
      variableZones: ['章节、重点要求、资格条件、时间节点、风险提示、证据来源'],
      outputHint: '按章节维度输出标书应答表。',
      tableColumns: ['章节', '重点要求', '资格条件', '时间节点', '风险提示', '证据来源'],
    },
  },
  response: {
    page: {
      title: '标书应答维度静态页',
      fixedStructure: [
        '按应答维度梳理关键要求、待补材料和证据支撑。',
        '适合投标团队快速确定应答路径。',
      ],
      variableZones: ['项目概况', '应答重点', '待补材料', '证据支撑', '风险提醒', 'AI综合分析'],
      outputHint: '按应答维度整理招投标资料，突出关键要求、待补材料和证据支撑。',
      pageSections: ['项目概况', '应答重点', '待补材料', '证据支撑', '风险提醒', 'AI综合分析'],
    },
    table: {
      title: '标书应答维度表',
      fixedStructure: [
        '按应答维度整理关键要求、待补材料和应答建议。',
        '优先给出可落地的应答路径。',
      ],
      variableZones: ['应答重点、待补材料、责任模块、证据来源、说明'],
      outputHint: '按应答维度输出标书资料表。',
      tableColumns: ['应答重点', '待补材料', '责任模块', '证据来源', '说明'],
    },
  },
  risk: {
    page: {
      title: '标书风险维度静态页',
      fixedStructure: [
        '按风险维度梳理资格风险、材料缺口和关键时间风险。',
        '优先给出可执行的应答建议。',
      ],
      variableZones: ['风险概览', '资格风险', '材料缺口', '时间风险', '应答建议', 'AI综合分析'],
      outputHint: '按风险维度整理标书资料，突出资格风险、材料缺口和应答建议。',
      pageSections: ['风险概览', '资格风险', '材料缺口', '时间风险', '应答建议', 'AI综合分析'],
    },
    table: {
      title: '标书风险维度表',
      fixedStructure: [
        '按风险维度整理资格风险、时间风险和材料缺口。',
        '优先突出高风险项和应对建议。',
      ],
      variableZones: ['风险项、风险等级、影响范围、应对建议、证据来源'],
      outputHint: '按风险维度输出标书风险表。',
      tableColumns: ['风险项', '风险等级', '影响范围', '应对建议', '证据来源'],
    },
  },
} satisfies ConceptEnvelopeRuleSet<'generic' | 'section' | 'response' | 'risk'>;

export const IOT_CONCEPT_RULES = {
  scenario: {
    page: {
      title: 'IOT 场景维度静态页',
      fixedStructure: [
        '按场景维度组织 IOT 解决方案，突出业务场景、关键需求和模块映射。',
        '页面适合方案讲解与对外沟通。',
      ],
      variableZones: ['方案概览', '场景分布', '关键需求', '模块映射', '实施要点', 'AI综合分析'],
      outputHint: '按场景维度输出 IOT 解决方案静态页，突出场景和模块映射。',
      pageSections: ['方案概览', '场景分布', '关键需求', '模块映射', '实施要点', 'AI综合分析'],
    },
    table: {
      title: 'IOT 场景维度表',
      fixedStructure: [
        '按场景维度整理方案、关键需求和涉及模块。',
        '优先突出场景与模块映射关系。',
      ],
      variableZones: ['场景、需求、涉及模块、价值说明、证据来源'],
      outputHint: '按场景维度输出 IOT 方案表。',
      tableColumns: ['场景', '关键需求', '涉及模块', '价值说明', '证据来源'],
    },
  },
  module: {
    page: {
      title: 'IOT 模块维度静态页',
      fixedStructure: [
        '按模块维度组织设备、网关、平台和接口集成。',
        '优先突出模块职责边界和集成关系。',
      ],
      variableZones: ['模块概览', '设备与网关', '平台能力', '接口集成', '交付关系', 'AI综合分析'],
      outputHint: '按模块维度输出 IOT 解决方案静态页，突出模块边界和接口集成。',
      pageSections: ['模块概览', '设备与网关', '平台能力', '接口集成', '交付关系', 'AI综合分析'],
    },
    table: {
      title: 'IOT 模块维度表',
      fixedStructure: [
        '按模块维度整理设备、网关、平台和接口信息。',
        '优先突出模块职责和集成关系。',
      ],
      variableZones: ['模块、职责、集成对象、实施要点、证据来源'],
      outputHint: '按模块维度输出 IOT 方案表。',
      tableColumns: ['模块', '职责', '集成对象', '实施要点', '证据来源'],
    },
  },
  value: {
    page: {
      title: 'IOT 价值维度静态页',
      fixedStructure: [
        '按价值维度组织收益指标、价值主张和落地条件。',
        '优先突出业务收益与实施条件的关系。',
      ],
      variableZones: ['方案概览', '价值主张', '指标收益', '落地条件', '风险提醒', 'AI综合分析'],
      outputHint: '按价值维度输出 IOT 解决方案静态页，突出价值主张和落地条件。',
      pageSections: ['方案概览', '价值主张', '指标收益', '落地条件', '风险提醒', 'AI综合分析'],
    },
    table: {
      title: 'IOT 价值维度表',
      fixedStructure: [
        '按价值维度整理收益指标、适用场景和落地条件。',
        '优先突出价值与落地约束。',
      ],
      variableZones: ['价值点、指标收益、适用场景、落地条件、风险提醒、证据来源'],
      outputHint: '按价值维度输出 IOT 方案表。',
      tableColumns: ['价值点', '指标收益', '适用场景', '落地条件', '风险提醒', '证据来源'],
    },
  },
} satisfies ConceptEnvelopeRuleSet<'generic' | 'scenario' | 'module' | 'value'>;

export function adaptConceptRequestEnvelope<TView extends string>(
  envelope: ReportTemplateEnvelope,
  kind: KnowledgeOutputKind,
  view: TView,
  rules: ConceptEnvelopeRuleSet<TView>,
): ReportTemplateEnvelope {
  if (view === 'generic') return envelope;

  const variantSet = rules[view as Exclude<TView, 'generic'>];
  if (!variantSet) return envelope;

  const variant = kind === 'table' ? variantSet.table : variantSet.page;
  return {
    ...envelope,
    title: variant.title,
    fixedStructure: [...variant.fixedStructure],
    variableZones: [...variant.variableZones],
    outputHint: variant.outputHint,
    pageSections: variant.pageSections ? [...variant.pageSections] : envelope.pageSections,
    tableColumns: variant.tableColumns ? [...variant.tableColumns] : envelope.tableColumns,
  };
}
