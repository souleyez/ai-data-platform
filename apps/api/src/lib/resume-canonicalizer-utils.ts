export const RESUME_HINT_PATTERN = /\b(?:resume|curriculum vitae|cv)\b|简历|履历|候选人|求职/i;
export const NAME_NOISE_PATTERN = /^(?:resume|cv|简历|个人简历|候选人|姓名|name|求职意向|基本信息|建立同比|年龄|男|女|本人|我的|并制作|个人)$/i;
export const NAME_ROLE_PATTERN = /(?:经理|总监|工程师|主管|专员|顾问|销售|运营|产品|设计师|程序员|开发|leader|负责人)$/i;
export const CONTACT_NOISE_PATTERN = /联系电话|电话|手机|邮箱|email|wechat|微信|qq|mail/i;
export const ROLE_NOISE_PATTERN = /求职意向|目标岗位|应聘岗位|当前职位|岗位职责|工作职责|工作内容|负责|参与|带领|管理/i;
export const COMPANY_SUFFIX_PATTERN = /(?:有限责任公司|有限公司|股份有限公司|股份公司|公司|集团|科技|信息|软件|网络|系统|智能|电子|研究院|研究所|学院|大学|协会|中心|银行|医院|平台)/i;
export const COMPANY_NOISE_PATTERN = /项目|职责|负责|参与|教育|学历|专业|经验|年限|薪资|期望|电话|邮箱|联系|技能|证书|住址|地址|年龄|婚姻|自我评价|简历|候选人|基本信息|核心能力|related_to/i;
export const COMPANY_ACTION_PATTERN = /^(?:负责|参与|主导|推进|完成|统筹|带领|领导|帮助|协助|推动|实现|从0|熟悉|擅长|精通|我的|并|及|和)/;
export const PROJECT_KEYWORD_PATTERN = /(?:项目|系统|平台|应用|工程|方案|中台|小程序|APP|网站|商城|ERP|CRM|MES|WMS|SRM|BI|IoT|AIGC|AI|广告投放|风控|物业|社区|电商|运营平台|数据平台|管理平台|智慧)/i;
export const PROJECT_NOISE_PATTERN = /电话|邮箱|学历|教育|专业|期望|薪资|求职|工作经历|教育经历|自我评价|简历|候选人|related_to|基本信息/i;
export const PROJECT_ACTION_PATTERN = /^(?:负责|参与|主导|推进|推动|完成|统筹|带领|领导|优化|设计|开发|实施|维护|对接|擅长|保障|协调)/;
export const DEGREE_PATTERN = /(博士后|博士|硕士|研究生|MBA|EMBA|本科|学士|大专|专科|中专|高中)/i;
export const SKILL_NOISE_PATTERN = /^(?:求职意向|基本信息|我的|并制作|related_to)$/i;

export function uniqStrings(values: Array<string | undefined | null>) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

export function normalizeText(value: unknown, maxLength = 160) {
  const text = String(value || '')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

export function stripFileExtension(value: string) {
  return value.replace(/\.[a-z0-9]{1,8}$/i, '');
}

export function stripCommonLabelPrefix(value: string) {
  return value.replace(/^(?:姓名|name|候选人|简历|个人简历|目标岗位|应聘岗位|求职意向|当前职位|最近公司|公司|项目经历|项目|学历|专业)[:：]?\s*/i, '').trim();
}

export function stripSkillLabelPrefix(value: string) {
  return value.replace(/^(?:技能|技能标签|核心技能|专业技能|技术栈)[:：]?\s*/i, '').trim();
}
