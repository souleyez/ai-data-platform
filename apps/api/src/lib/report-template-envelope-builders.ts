import { resolveTemplateEnvelopeProfile } from './report-governance.js';
import type {
  ReportGroup,
  ReportGroupTemplate,
  ReportTemplateEnvelope,
  SharedReportTemplate,
} from './report-center.js';
import {
  looksLikeBidTemplate,
  looksLikeFormulaTemplate,
  looksLikeIotTemplate,
  looksLikeOrderTemplate,
  looksLikePaperTemplate,
  looksLikeResumeTemplate,
} from './report-template-envelope-support.js';

export function buildSharedTemplateEnvelope(template: SharedReportTemplate): ReportTemplateEnvelope {
  const governanceProfile = resolveTemplateEnvelopeProfile(template);
  if (governanceProfile) {
    return {
      title: template.label,
      fixedStructure: [...governanceProfile.envelope.fixedStructure],
      variableZones: [...governanceProfile.envelope.variableZones],
      outputHint: String(governanceProfile.envelope.outputHint || template.description || '').trim(),
      tableColumns: governanceProfile.envelope.tableColumns?.length ? [...governanceProfile.envelope.tableColumns] : undefined,
      pageSections: governanceProfile.envelope.pageSections?.length ? [...governanceProfile.envelope.pageSections] : undefined,
    };
  }

  if (template.type === 'static-page') {
    if (looksLikeOrderTemplate(template)) {
      return {
        title: template.label,
        fixedStructure: [
          '页面结构必须稳定，优先包含经营摘要、核心指标卡片、平台对比、品类对比、库存与备货建议、异常波动说明。',
          '必须体现多品类、多平台、同比、环比、预测销量、库存指数和备货建议。',
          '内容适合直接转发，不带平台入口与回链。',
        ],
        variableZones: ['经营摘要文本', '指标卡片数值', '平台与品类图表数据', '异常波动解释', '备货建议细节', 'AI综合分析'],
        outputHint: template.description,
        pageSections: ['经营摘要', '平台对比', '品类对比', '库存与备货建议', '异常波动说明', 'AI综合分析'],
      };
    }

    if (looksLikeBidTemplate(template)) {
      return {
        title: template.label,
        fixedStructure: [
          '页面结构应稳定，优先包含项目概况、资格条件、关键时间节点、应答重点、风险提醒。',
          '内容必须适合团队转发查看，不带平台入口和技术说明。',
          '输出应接近正式投标摘要页，而不是聊天回答。',
        ],
        variableZones: ['项目摘要', '时间节点', '关键要求', '风险与待补材料', '证据引用细节', 'AI综合分析'],
        outputHint: template.description,
        pageSections: ['项目概况', '资格条件', '关键时间节点', '应答重点', '风险提醒', 'AI综合分析'],
      };
    }

    if (looksLikeFormulaTemplate(template)) {
      return {
        title: template.label,
        fixedStructure: [
          '页面结构稳定，先给方案摘要，再给核心成分、适用人群、作用机制、证据依据和风险提示。',
          '输出必须保留专业性，适合继续讨论配方方案。',
          '不要把页面写成纯聊天回答。',
        ],
        variableZones: ['方案摘要', '核心成分与菌株', '适用人群', '作用归纳', '证据说明', 'AI综合分析'],
        outputHint: template.description,
        pageSections: ['方案摘要', '核心成分', '适用人群', '作用机制', '证据依据', 'AI综合分析'],
      };
    }

    if (looksLikePaperTemplate(template)) {
      return {
        title: template.label,
        fixedStructure: [
          '页面结构稳定，优先呈现研究概览、方法设计、核心结论、关键指标、局限与风险。',
          '内容应适合研究复盘、团队讨论和学术资料转发，不写成聊天回复。',
          '证据优先来自知识库论文正文、摘要和结构化解析结果。',
        ],
        variableZones: ['研究主题摘要', '方法设计与样本信息', '核心结论', '关键指标与证据', '局限与风险', 'AI综合分析'],
        outputHint: template.description,
        pageSections: ['研究概览', '方法设计', '核心结论', '关键指标与证据', '局限与风险', 'AI综合分析'],
      };
    }

    if (looksLikeIotTemplate(template)) {
      return {
        title: template.label,
        fixedStructure: [
          '页面结构稳定，优先呈现方案概览、核心模块、平台与接口、实施路径、业务价值和风险提示。',
          '内容适合方案交流、售前讲解和内部评审，不要写成聊天回复。',
          '证据优先来自知识库中的设备、平台、接口和实施材料。',
        ],
        variableZones: ['方案概览', '核心模块', '平台与接口', '实施路径', '业务价值', 'AI综合分析'],
        outputHint: template.description,
        pageSections: ['方案概览', '核心模块', '平台与接口', '实施路径', '业务价值', 'AI综合分析'],
      };
    }

    return {
      title: template.label,
      fixedStructure: [
        '页面结构优先保持稳定，先给摘要，再给核心指标卡片、重点分节、图表和行动建议。',
        '页面适合直接转发，不带平台入口或回链。',
        '尽量把信息组织成可读的业务页面，而不是聊天回答。',
      ],
      variableZones: ['摘要内容', '图表指标', '重点分节内容', '行动建议', 'AI综合分析'],
      outputHint: template.description,
      pageSections: ['摘要', '核心指标', '重点分析', '行动建议', 'AI综合分析'],
    };
  }

  if (template.type === 'ppt') {
    return {
      title: template.label,
      fixedStructure: [
        '输出应是适合汇报的结构化提纲，而不是聊天正文。',
        '优先包含标题页、结论摘要、关键分析、行动建议。',
        '章节顺序保持稳定，便于继续转成正式PPT。',
      ],
      variableZones: ['标题', '章节要点', '数据亮点', '行动建议'],
      outputHint: template.description,
      pageSections: ['标题页', '结论摘要', '关键分析', '行动建议'],
    };
  }

  if (template.type === 'document') {
    return {
      title: template.label,
      fixedStructure: [
        '输出应保持文档正文形态，优先包含摘要、正文分节、结论和建议。',
        '不要改成表格或碎片式聊天回答。',
        '结构稳定，适合导出为正式文档。',
      ],
      variableZones: ['文档标题', '摘要', '正文分节', '结论建议'],
      outputHint: template.description,
      pageSections: ['摘要', '正文分析', '结论建议'],
    };
  }

  if (looksLikeResumeTemplate(template)) {
    return {
      title: template.label,
      fixedStructure: [
        '输出必须保持表格化，列结构稳定，优先包含候选人、第一学历、最近就职公司、核心能力、年龄、工作年限、匹配判断、证据来源。',
        '每一行只对应一位候选人，不要混合多位候选人的信息。',
        '字段缺失可以留空，但不要自行补造。',
      ],
      variableZones: ['筛选范围', '核心能力归纳', '匹配判断', '证据引用细节', 'AI综合分析'],
      outputHint: template.description,
      tableColumns: ['候选人', '第一学历', '最近就职公司', '核心能力', '年龄', '工作年限', '匹配判断', '证据来源'],
    };
  }

  if (looksLikeBidTemplate(template)) {
    return {
      title: template.label,
      fixedStructure: [
        '输出必须保持表格化，列结构稳定，优先包含章节、应答重点、需补充材料、风险提示、证据来源。',
        '每一行只对应一个章节或应答要点，不要把多个章节混在同一行。',
        '优先依据知识库中的招标文件和模板文档组织内容。',
      ],
      variableZones: ['章节拆分方式', '应答重点', '需补充材料', '风险提示', '证据引用细节', 'AI综合分析'],
      outputHint: template.description,
      tableColumns: ['章节', '应答重点', '需补充材料', '风险提示', '证据来源'],
    };
  }

  if (looksLikeFormulaTemplate(template)) {
    return {
      title: template.label,
      fixedStructure: [
        '输出必须保持表格化，优先包含模块、建议原料或菌株、添加量或剂量、核心作用、适用人群、证据来源、备注。',
        '每一行应对应一个明确的配方建议单元，不要把多个建议混在同一格。',
        '证据来源尽量来自知识库文档，不足时才补充常识性说明。',
      ],
      variableZones: ['模块拆分方式', '建议原料或菌株', '剂量建议', '卖点归纳', '证据引用细节', 'AI综合分析'],
      outputHint: template.description,
      tableColumns: ['模块', '建议原料或菌株', '添加量或剂量', '核心作用', '适用人群', '证据来源', '备注'],
    };
  }

  if (looksLikePaperTemplate(template)) {
    return {
      title: template.label,
      fixedStructure: [
        '输出必须保持表格化，优先包含论文标题、研究对象、方法设计、核心结论、关键指标、证据来源。',
        '每一行对应一篇论文或一条稳定研究结论，不要把多篇论文混在同一行。',
        '证据优先来自论文摘要、正文证据块和结构化解析结果。',
      ],
      variableZones: ['论文标题', '研究对象', '方法设计', '核心结论', '关键指标', '证据来源', 'AI综合分析'],
      outputHint: template.description,
      tableColumns: ['论文标题', '研究对象', '方法设计', '核心结论', '关键指标', '证据来源'],
    };
  }

  if (looksLikeIotTemplate(template)) {
    return {
      title: template.label,
      fixedStructure: [
        '输出必须保持表格化，优先包含模块、能力说明、设备/网关、平台/接口、实施要点、证据来源。',
        '每一行对应一个稳定模块或方案单元，不要把多个模块混在同一行。',
        '证据优先来自知识库中的方案材料、接口说明和实施资料。',
      ],
      variableZones: ['模块', '能力说明', '设备/网关', '平台/接口', '实施要点', '证据来源', 'AI综合分析'],
      outputHint: template.description,
      tableColumns: ['模块', '能力说明', '设备/网关', '平台/接口', '实施要点', '证据来源'],
    };
  }

  return {
    title: template.label,
    fixedStructure: [
      '输出必须保持表格化，不要改成散文。',
      '列结构要稳定，先给结论，再给说明和证据。',
      '知识库证据优先，不足时才做克制补充。',
    ],
    variableZones: ['具体列名', '每行内容细节', '补充说明强度', 'AI综合分析'],
    outputHint: template.description,
    tableColumns: ['结论', '说明', '证据来源'],
  };
}

export function buildTemplateEnvelope(group: ReportGroup, template: ReportGroupTemplate): ReportTemplateEnvelope {
  return buildSharedTemplateEnvelope({
    key: template.key,
    label: template.label,
    type: template.type,
    description: template.description,
    supported: template.supported,
    origin: 'system',
    referenceImages: group.referenceImages || [],
  });
}
