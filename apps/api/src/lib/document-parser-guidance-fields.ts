import type { DocumentExtractionProfile } from './document-extraction-governance.js';
import { includesAnyText } from './document-schema.js';

export type ContractFields = {
  contractNo?: string;
  partyA?: string;
  partyB?: string;
  amount?: string;
  signDate?: string;
  effectiveDate?: string;
  paymentTerms?: string;
  duration?: string;
};

export type EnterpriseGuidanceFields = {
  businessSystem?: string;
  documentKind?: string;
  applicableScope?: string;
  operationEntry?: string;
  approvalLevels?: string[];
  policyFocus?: string[];
  contacts?: string[];
};

type GuidanceDeps = {
  shouldForceExtraction: (
    profile: DocumentExtractionProfile | null | undefined,
    fieldSet: DocumentExtractionProfile['fieldSet'],
  ) => boolean;
};

export function extractContractFields(
  text: string,
  category: string,
  profile: DocumentExtractionProfile | null | undefined,
  deps: GuidanceDeps,
): ContractFields | undefined {
  if (category !== 'contract' && !deps.shouldForceExtraction(profile, 'contract')) return undefined;
  const normalized = text.replace(/\s+/g, ' ');
  const partyA = normalized.match(/(?:甲方|发包方|采购方|委托方)[:：]?\s*(.+?)(?=(?:乙方|承包方|供应商|服务方|受托方|签订日期|签约日期|生效日期|金额|付款方式|付款条款|服务期|合同期|期限|$))/i)?.[1]?.trim();
  const partyB = normalized.match(/(?:乙方|承包方|供应商|服务方|受托方)[:：]?\s*(.+?)(?=(?:签订日期|签约日期|生效日期|金额|付款方式|付款条款|服务期|合同期|期限|$))/i)?.[1]?.trim();
  const signDate = normalized.match(/(?:签订日期|签约日期|签订时间|合同签订日)[:：]?\s*([0-9]{4}[年/-][0-9]{1,2}[月/-][0-9]{1,2}日?)/i)?.[1]?.trim();
  const effectiveDate = normalized.match(/(?:生效日期|生效时间|起始日期|开始日期)[:：]?\s*([0-9]{4}[年/-][0-9]{1,2}[月/-][0-9]{1,2}日?)/i)?.[1]?.trim();
  const contractNo = normalized.match(/(合同编号|编号)[:：]?\s*([A-Za-z0-9-]+)/)?.[2];
  const amount = normalized.match(/(金额|合同金额)[:：]?\s*([￥¥]?[0-9,.]+[万千元]*)/)?.[2];
  const paymentTerms = normalized.match(/(付款方式|付款条款)[:：]?\s*([^。；;]+)/)?.[2];
  const duration = normalized.match(/(期限|服务期|合同期)[:：]?\s*(.*?)(?:违约责任|备注|付款条款|$|[。；;])/ )?.[2]?.trim();
  return { contractNo, partyA, partyB, amount, signDate, effectiveDate, paymentTerms, duration };
}

function collectNormalizedMatches(text: string, pattern: RegExp) {
  return [...new Set(
    [...String(text || '').matchAll(pattern)]
      .map((match) => String(match[1] || match[0] || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean),
  )];
}

export function extractEnterpriseGuidanceFields(
  text: string,
  title: string,
  topicTags: string[],
  category: string,
  profile: DocumentExtractionProfile | null | undefined,
  deps: GuidanceDeps,
): EnterpriseGuidanceFields | undefined {
  if (category !== 'technical' && !deps.shouldForceExtraction(profile, 'enterprise-guidance')) return undefined;

  const rawText = String(text || '');
  const normalized = rawText.replace(/\s+/g, ' ').trim();
  const evidence = `${title} ${normalized} ${(topicTags || []).join(' ')}`.toLowerCase();
  const looksLikeGuidance = includesAnyText(evidence, [
    'ioa',
    '流程',
    '审批',
    '指引',
    '规范',
    '制度',
    'q&a',
    'faq',
    '预算调整',
    '登录',
    '应用技巧',
  ]);
  if (!looksLikeGuidance) return undefined;

  const businessSystem = /(?:新中)?i\s*oa|ioa系统|ioa/i.test(evidence)
    ? 'IOA'
    : includesAnyText(evidence, ['erp']) ? 'ERP' : '';

  const documentKind = /(?:q&a|faq|常见问题)/i.test(evidence)
    ? 'faq'
    : /预算调整/i.test(evidence)
      ? 'budget-adjustment'
      : /审批流程|审批/i.test(evidence)
        ? 'approval-flow'
        : /应用技巧|操作指引|登录|入口/i.test(evidence)
          ? 'operation-guide'
          : /规范|制度|标准/i.test(evidence)
            ? 'policy-standard'
            : 'guidance';

  const applicableScope = normalized.match(/(?:适用范围|适用对象|适用于)[:：]?\s*([^。；;\n]{2,120})/i)?.[1]?.trim();
  const operationEntry = normalized.match(/(?:操作路径|进入路径|入口|登录方式|系统登录|登录地址|访问地址)[:：]?\s*([^。；;\n]{2,160})/i)?.[1]?.trim();
  const contacts = collectNormalizedMatches(
    rawText,
    /(?:支持联系方式|联系人|联系方式|技术支持|支持邮箱|咨询电话)[:：]?\s*([^\n。；;]{2,80})/gi,
  ).slice(0, 4);
  const approvalLevels = collectNormalizedMatches(
    rawText,
    /((?:一级|二级|三级|四级)?审批(?:节点|层级)?|部门负责人|分管领导|财务负责人|总经理|集团审批)/gi,
  ).slice(0, 6);

  const policyFocus = [...new Set([
    /规范|制度|标准/i.test(evidence) ? '企业规范' : '',
    /审批流程|审批/i.test(evidence) ? '审批流程' : '',
    /预算调整/i.test(evidence) ? '预算调整' : '',
    /登录|入口|应用技巧|操作指引/i.test(evidence) ? '系统操作' : '',
    /q&a|faq|常见问题/i.test(evidence) ? '常见问题' : '',
  ].filter(Boolean))];

  const hasAnyValue = Boolean(
    businessSystem
    || documentKind
    || applicableScope
    || operationEntry
    || approvalLevels.length
    || policyFocus.length
    || contacts.length
  );

  return hasAnyValue
    ? {
        businessSystem,
        documentKind,
        applicableScope,
        operationEntry,
        approvalLevels,
        policyFocus,
        contacts,
      }
    : undefined;
}

export function refineEnterpriseGuidanceFields(
  fields: EnterpriseGuidanceFields | undefined,
  input: {
    text: string;
    title: string;
    topicTags: string[];
    profile?: DocumentExtractionProfile | null;
  },
  deps: GuidanceDeps,
): EnterpriseGuidanceFields | undefined {
  const rawText = String(input.text || '');
  const title = String(input.title || '');
  const evidence = `${title} ${rawText} ${(input.topicTags || []).join(' ')}`.toLowerCase();
  const forceGuidance = deps.shouldForceExtraction(input.profile, 'enterprise-guidance');
  const looksLikeXinshijieIoa = includesAnyText(evidence, [
    '新世界ioa',
    '新中ioa',
    'ioa系统q&a',
    'ioa应用技巧',
    'ioa平台操作指引',
    '固定资产',
    'it政策',
    'it守则',
  ]);

  if (!fields && !forceGuidance && !looksLikeXinshijieIoa) {
    return undefined;
  }

  const nextFields: EnterpriseGuidanceFields = {
    ...(fields || {}),
  };

  if (!nextFields.businessSystem) {
    if (/(?:新中|新世界)?i\s*oa|ioa/i.test(evidence)) nextFields.businessSystem = 'IOA';
    else if (includesAnyText(evidence, ['固定资产', 'fixed asset'])) nextFields.businessSystem = 'fixed-assets';
    else if (includesAnyText(evidence, ['it政策', 'it守则', 'it policy', 'it governance'])) nextFields.businessSystem = 'IT';
  }

  if (!nextFields.documentKind) {
    if (/(?:q&a|faq|常见问题)/i.test(evidence)) nextFields.documentKind = 'faq';
    else if (/(?:用户手册|manual|user guide)/i.test(evidence)) nextFields.documentKind = 'user-manual';
    else if (/预算调整/i.test(evidence)) nextFields.documentKind = 'budget-adjustment';
    else if (/审批流程|审批/i.test(evidence)) nextFields.documentKind = 'approval-flow';
    else if (/应用技巧|操作指引|登录|入口/i.test(evidence)) nextFields.documentKind = 'operation-guide';
    else if (/规范|制度|标准|政策|守则/i.test(evidence)) nextFields.documentKind = 'policy-standard';
    else if (forceGuidance || looksLikeXinshijieIoa) nextFields.documentKind = 'guidance';
  }

  if (/(?:用户手册|manual|user guide)/i.test(title)) {
    nextFields.documentKind = 'user-manual';
  } else if (/(?:政策|守则|规范|制度|standard|policy)/i.test(title)) {
    nextFields.documentKind = 'policy-standard';
  }

  nextFields.policyFocus = [...new Set([
    ...(nextFields.policyFocus || []),
    /规范|制度|标准|政策|守则/i.test(evidence) ? '企业规范' : '',
    /审批流程|审批/i.test(evidence) ? '审批流程' : '',
    /预算调整/i.test(evidence) ? '预算调整' : '',
    /登录|入口|应用技巧|操作指引/i.test(evidence) ? '系统操作' : '',
    /q&a|faq|常见问题/i.test(evidence) ? '常见问题' : '',
    /固定资产|fixed asset/i.test(evidence) ? '资产管理' : '',
    /it政策|it守则|it policy|it governance/i.test(evidence) ? 'IT治理' : '',
  ].filter(Boolean))];

  return Object.values(nextFields).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value))
    ? nextFields
    : undefined;
}
