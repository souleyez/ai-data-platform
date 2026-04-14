type RetrievalIntent = 'generic' | 'formula' | 'paper' | 'technical' | 'contract' | 'resume' | 'iot' | 'footfall';
type TemplateTask =
  | 'general'
  | 'resume-comparison'
  | 'formula-table'
  | 'formula-static-page'
  | 'bids-table'
  | 'bids-static-page'
  | 'footfall-static-page'
  | 'paper-table'
  | 'paper-static-page'
  | 'paper-summary'
  | 'technical-summary'
  | 'contract-risk'
  | 'order-static-page'
  | 'iot-table'
  | 'iot-static-page'
  | 'static-page';

export function normalizePrompt(prompt: string) {
  return String(prompt || '').trim().toLowerCase();
}

export function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function collectPromptTokens(prompt: string) {
  const text = normalizePrompt(prompt);
  if (!text) return [];

  const asciiTokens = text
    .split(/[^a-z0-9]+/i)
    .filter((entry) => entry.length >= 2);

  const cjkTokens: string[] = [];
  const compact = text.replace(/\s+/g, '');
  for (let index = 0; index < compact.length - 1; index += 1) {
    const slice = compact.slice(index, index + 2);
    if (/[\u4e00-\u9fff]{2}/.test(slice)) cjkTokens.push(slice);
  }

  return [...new Set([...asciiTokens, ...cjkTokens])].slice(0, 24);
}

export function expandPromptBySchema(prompt: string) {
  const normalized = normalizePrompt(prompt);
  const expansions: string[] = [prompt];

  if (containsAny(normalized, ['formula', '配方', '奶粉', '益生菌', '菌株', 'ingredient', 'strain', 'hmo', 'nutrition'])) {
    expansions.push('formula probiotic strain ingredient hmo nutrition audience dosage evidence 配方 奶粉 益生菌 菌株 成分 人群 剂量');
  }
  if (containsAny(normalized, ['paper', '论文', '研究', 'study', 'trial', 'randomized', 'placebo', 'abstract', 'methods', 'results', 'journal'])) {
    expansions.push('paper study randomized placebo abstract methods results journal publication 论文 研究 方法 结果 结论 指标');
  }
  if (containsAny(normalized, ['technical', '技术', 'api', 'sdk', 'deploy', 'deployment', 'architecture', 'integration', '接口', '部署'])) {
    expansions.push('technical api sdk deployment architecture integration technical-summary 技术 接口 部署 架构 集成 模块');
  }
  if (containsAny(normalized, ['iot', '物联网', '设备', '网关', '平台', '传感', '解决方案'])) {
    expansions.push('iot scenario module gateway device sensor platform interface integration value deployment 物联网 场景 模块 网关 设备 传感 平台 接口 集成 价值');
  }
  if (containsAny(normalized, ['contract', '合同', '条款', 'payment', 'breach', 'legal'])) {
    expansions.push('contract clause payment breach obligation legal 合同 条款 付款 回款 违约 法务');
  }
  if (containsAny(normalized, ['resume', 'cv', 'candidate', 'talent', '简历', '候选人'])) {
    expansions.push('resume cv candidate talent education company skills age interview 简历 候选人 第一学历 就职公司 核心能力 年龄');
  }
  if (containsAny(normalized, ['order', '订单', 'sales', '销量', 'inventory', '库存', '备货', '同比', '环比'])) {
    expansions.push('order sales inventory replenishment forecast 同比 环比 预测销量 备货 库存指数 电商平台 品类');
  }
  if (containsAny(normalized, ['footfall', 'visitor', 'visitors', 'mall traffic', '客流', '人流', '商场分区', '楼层分区'])) {
    expansions.push('footfall visitor mall zone shopping zone floor zone room unit 客流 人流 商场分区 楼层分区 单间 商场客流 分区汇总');
  }
  if (containsAny(normalized, ['bid', 'bids', 'tender', 'rfp', 'proposal', '标书', '招标', '投标'])) {
    expansions.push('bids tender proposal section response risk material evidence 标书 招标 投标 章节 应答 材料 风险 证据');
  }

  return expansions.join(' ');
}

export function detectTemplateTask(prompt: string): TemplateTask {
  const text = normalizePrompt(prompt);
  if (!text) return 'general';

  if (containsAny(text, ['resume', 'cv', 'candidate', '简历', '候选人']) && containsAny(text, ['table', 'comparison', '表格', '对比'])) {
    return 'resume-comparison';
  }
  if (containsAny(text, ['bid', 'bids', 'tender', 'rfp', 'proposal', '标书', '招标', '投标']) && containsAny(text, ['static page', 'static-page', 'dashboard', 'summary', '静态页', '摘要'])) {
    return 'bids-static-page';
  }
  if (containsAny(text, ['bid', 'bids', 'tender', 'rfp', 'proposal', '标书', '招标', '投标']) && containsAny(text, ['table', 'response', 'risk', 'section', 'materials', 'report', '表格', '应答'])) {
    return 'bids-table';
  }
  if (containsAny(text, ['paper', 'study', 'journal', '论文', '研究', '期刊']) && containsAny(text, ['static page', 'static-page', 'dashboard', '静态页', '可视化页'])) {
    return 'paper-static-page';
  }
  if (containsAny(text, ['paper', 'study', 'journal', '论文', '研究', '期刊']) && containsAny(text, ['table', 'report', '表格', '表'])) {
    return 'paper-table';
  }
  if (containsAny(text, ['formula', '配方', '奶粉', '益生菌', '菌株']) && containsAny(text, ['static page', 'static-page', 'dashboard', '静态页', '可视化页'])) {
    return 'formula-static-page';
  }
  if (containsAny(text, ['formula', '配方', '奶粉', '益生菌', '菌株']) && containsAny(text, ['table', 'report', '表格', '报表'])) {
    return 'formula-table';
  }
  if (containsAny(text, ['order', '订单', 'sales', '销量', 'inventory', '库存', '备货']) && containsAny(text, ['static page', 'static-page', 'dashboard', '静态页', '可视化页'])) {
    return 'order-static-page';
  }
  if (containsAny(text, ['footfall', 'visitor', 'visitors', 'mall traffic', '客流', '人流', '商场分区']) && containsAny(text, ['static page', 'static-page', 'dashboard', '报表', '静态页', '可视化页'])) {
    return 'footfall-static-page';
  }
  if (containsAny(text, ['contract', '合同', '条款']) && containsAny(text, ['table', 'risk', '表格', '风险'])) {
    return 'contract-risk';
  }
  if (containsAny(text, ['iot', '物联网', '设备', '网关', '平台', '解决方案']) && containsAny(text, ['static page', 'static-page', 'dashboard', '静态页', '可视化页'])) {
    return 'iot-static-page';
  }
  if (containsAny(text, ['iot', '物联网', '设备', '网关', '平台', '解决方案']) && containsAny(text, ['table', 'report', '表格', '表'])) {
    return 'iot-table';
  }
  if (containsAny(text, ['technical', '技术', 'api', 'sdk', 'deployment', 'architecture', '接口', '部署'])) {
    return 'technical-summary';
  }
  if (containsAny(text, ['paper', 'study', 'journal', '论文', '研究', '方法', '结果'])) {
    return 'paper-summary';
  }
  if (containsAny(text, ['static page', 'static-page', 'dashboard', '静态页', '可视化页'])) {
    return 'static-page';
  }
  return 'general';
}

export function isResumeCompanyProjectPrompt(prompt: string) {
  const text = normalizePrompt(prompt);
  return (
    containsAny(text, ['resume', 'cv', 'candidate', 'talent', '简历', '候选人', '人才'])
    && containsAny(text, ['company', 'employer', '公司', '组织', '维度'])
    && containsAny(text, ['project', '项目', 'it', 'system', 'platform', 'api', '架构', '开发', '实施', '技术'])
  );
}

export function detectRetrievalIntent(prompt: string): RetrievalIntent {
  const text = normalizePrompt(prompt);
  const signalScore = {
    formula: containsAny(text, ['formula', '配方', '奶粉', '益生菌', '菌株', 'ingredient', 'strain', 'hmo', 'nutrition']) ? 2 : 0,
    paper: containsAny(text, ['paper', '论文', '研究', 'study', 'trial', 'randomized', 'placebo', 'abstract', 'methods', 'results', 'journal']) ? 2 : 0,
    technical: containsAny(text, ['technical', '技术', 'api', 'sdk', 'deploy', 'deployment', 'architecture', 'integration', '接口', '部署']) ? 2 : 0,
    iot: containsAny(text, ['iot', '物联网', '设备', '网关', '平台', '传感', '解决方案']) ? 2 : 0,
    contract: containsAny(text, ['contract', '合同', 'clause', '条款', 'payment', 'legal']) ? 2 : 0,
    resume: containsAny(text, ['resume', 'cv', 'candidate', 'talent', '简历', '候选人']) ? 2 : 0,
    footfall: containsAny(text, ['footfall', 'visitor', 'visitors', 'mall traffic', '客流', '人流', '商场分区', '楼层分区', '单间']) ? 2 : 0,
  };

  if (containsAny(text, ['journal', 'publication', 'peer review', 'peer-reviewed', 'abstract', 'methods', 'results', 'conclusion', '期刊', '发表'])) {
    signalScore.paper += 3;
  }
  if (containsAny(text, ['nutrition', 'formula', 'probiotic', 'ingredient', 'strain', 'hmo', '配方', '奶粉'])) {
    signalScore.formula += 3;
  }
  if (containsAny(text, ['api', 'sdk', 'deployment', 'architecture', 'integration', '接口', '部署'])) {
    signalScore.technical += 3;
  }
  if (containsAny(text, ['iot', '物联网', 'device', 'gateway', 'sensor', '设备', '网关', '传感', '平台'])) {
    signalScore.iot += 3;
  }
  if (containsAny(text, ['footfall', 'visitor', 'visitors', 'mall traffic', '客流', '人流', 'mall zone', 'shopping zone', '商场分区', '楼层分区', '单间'])) {
    signalScore.footfall += 4;
  }

  const ranked = Object.entries(signalScore).sort((left, right) => right[1] - left[1]);
  if (ranked[0]?.[1] > 0) {
    return ranked[0][0] as RetrievalIntent;
  }
  return 'generic';
}
