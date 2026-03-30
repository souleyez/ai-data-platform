const path = require('path');
const PptxGenJS = require('../apps/web/node_modules/pptxgenjs/dist/pptxgen.cjs.js');

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Codex';
pptx.company = 'AI Data Platform';
pptx.subject = 'AI Data Platform 项目方案 - Divoom';
pptx.title = 'AI Data Platform 项目方案';
pptx.lang = 'zh-CN';
pptx.theme = {
  headFontFace: 'Microsoft YaHei',
  bodyFontFace: 'Microsoft YaHei',
  lang: 'zh-CN',
};

const C = {
  navy: '0B2341',
  navy2: '143A66',
  gold: 'D9B36B',
  gold2: 'F3DEC0',
  white: 'FFFFFF',
  text: '1E293B',
  muted: '64748B',
  line: 'D7E0EA',
  pale: 'F7F9FC',
  paleBlue: 'EEF4FB',
  green: '0F766E',
  blue: '2156D9',
};

function addBg(slide, dark = false) {
  slide.background = { color: dark ? C.navy : 'FFFFFF' };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.22,
    line: { color: dark ? C.gold : C.navy, pt: 0 },
    fill: { color: dark ? C.gold : C.navy },
  });
}

function addHeader(slide, title, subtitle = '', dark = false) {
  slide.addText(title, {
    x: 0.7,
    y: 0.45,
    w: 11.6,
    h: 0.5,
    fontFace: 'Microsoft YaHei',
    fontSize: 24,
    bold: true,
    color: dark ? C.white : C.navy,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.7,
      y: 0.96,
      w: 11.6,
      h: 0.24,
      fontFace: 'Microsoft YaHei',
      fontSize: 10,
      color: dark ? C.gold2 : C.muted,
    });
  }
}

function addFooter(slide, page, dark = false) {
  slide.addText(`AI Data Platform · Divoom 客户方案`, {
    x: 0.7,
    y: 7.0,
    w: 4.6,
    h: 0.2,
    fontFace: 'Microsoft YaHei',
    fontSize: 9,
    color: dark ? 'C8D3E0' : C.muted,
  });
  slide.addText(String(page), {
    x: 12.15,
    y: 6.96,
    w: 0.45,
    h: 0.24,
    align: 'right',
    fontFace: 'Microsoft YaHei',
    fontSize: 10,
    color: dark ? C.gold2 : C.muted,
  });
}

function addBullets(slide, items, box, opts = {}) {
  const runs = items.map((item) => ({
    text: item,
    options: { bullet: { indent: 12 } },
  }));
  slide.addText(runs, {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fontFace: 'Microsoft YaHei',
    fontSize: opts.fontSize || 15,
    color: opts.color || C.text,
    breakLine: false,
    fit: 'shrink',
    margin: 0.03,
    paraSpaceAfterPt: 10,
  });
}

function addRoundBox(slide, box, fill, line = C.line) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    rectRadius: 0.06,
    fill: { color: fill },
    line: { color: line, pt: 1 },
  });
}

// Slide 1: Cover
{
  const s = pptx.addSlide();
  addBg(s, true);
  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0.22,
    w: 13.333,
    h: 7.28,
    line: { color: C.navy, pt: 0 },
    fill: { color: C.navy },
  });
  s.addShape(pptx.ShapeType.rect, {
    x: 8.9,
    y: 0.22,
    w: 4.433,
    h: 7.28,
    line: { color: C.navy2, pt: 0 },
    fill: { color: C.navy2, transparency: 12 },
  });
  s.addText('AI Data Platform', {
    x: 0.9,
    y: 1.15,
    w: 4.6,
    h: 0.35,
    fontFace: 'Segoe UI',
    fontSize: 20,
    bold: true,
    color: C.gold2,
  });
  s.addText('项目方案', {
    x: 0.9,
    y: 1.72,
    w: 5.2,
    h: 0.8,
    fontFace: 'Microsoft YaHei',
    fontSize: 30,
    bold: true,
    color: C.white,
  });
  s.addText('面向客户：Divoom / 深圳市战音科技有限公司', {
    x: 0.92,
    y: 2.58,
    w: 7.0,
    h: 0.38,
    fontFace: 'Microsoft YaHei',
    fontSize: 20,
    color: 'D8E3F4',
  });
  s.addText('构建产品知识、内容资产、渠道支撑与经营分析的一体化 AI 数据工作台', {
    x: 0.92,
    y: 3.18,
    w: 7.6,
    h: 0.72,
    fontFace: 'Microsoft YaHei',
    fontSize: 18,
    color: C.gold2,
    bold: true,
  });
  addRoundBox(s, { x: 0.92, y: 4.35, w: 7.2, h: 1.55 }, '123154', '295487');
  addBullets(
    s,
    [
      '统一接入官网、产品资料、FAQ、Warranty、证书、渠道文档与业务数据',
      '支持知识问答、模板输出、经营分析和客户提案生成',
      '采用分阶段建设方式，优先形成销售 / 市场 / 客服可直接使用的能力',
    ],
    { x: 1.1, y: 4.62, w: 6.8, h: 1.05 },
    { fontSize: 15, color: C.white },
  );
  s.addText('2026.03', {
    x: 0.92,
    y: 6.48,
    w: 1.4,
    h: 0.28,
    fontFace: 'Segoe UI',
    fontSize: 16,
    color: C.gold2,
  });
  addFooter(s, 1, true);
}

// Slide 2: Customer understanding
{
  const s = pptx.addSlide();
  addBg(s);
  addHeader(s, '01 客户业务理解', '基于官网公开信息与项目沟通方向提炼');
  addRoundBox(s, { x: 0.7, y: 1.45, w: 6.0, h: 4.95 }, C.paleBlue);
  addRoundBox(s, { x: 6.95, y: 1.45, w: 5.7, h: 4.95 }, C.pale);
  s.addText('我们对 Divoom 的理解', {
    x: 0.95,
    y: 1.75,
    w: 3.5,
    h: 0.28,
    fontFace: 'Microsoft YaHei',
    fontSize: 18,
    bold: true,
    color: C.navy,
  });
  addBullets(
    s,
    [
      '国际化消费电子品牌，不是单一硬件售卖，而是“硬件 + App + 社区 + 内容”生态',
      '产品涵盖 Pixel Speaker、Lighting、Backpack、Classic Speaker 等多品类',
      '官网具备 FAQ、Warranty、Certificate、Media、Gallery、Store 等完整内容体系',
      '未来业务不仅依赖产品资料管理，还需要兼顾渠道、客服、内容与经营数据协同',
    ],
    { x: 0.95, y: 2.15, w: 5.5, h: 3.75 },
    { fontSize: 15 },
  );
  s.addText('由此带来的管理挑战', {
    x: 7.2,
    y: 1.75,
    w: 3.8,
    h: 0.28,
    fontFace: 'Microsoft YaHei',
    fontSize: 18,
    bold: true,
    color: C.navy,
  });
  addBullets(
    s,
    [
      '产品资料、FAQ、证书、市场素材、渠道文档分散，复用效率低',
      '销售、市场、客服、海外渠道对同一产品输出口径不一致',
      '新品发布、展会、招商、售后答疑等内容生产成本高',
      '未来 ERP / 订单 / 库存 / 客诉数据难与产品知识形成闭环',
    ],
    { x: 7.2, y: 2.15, w: 5.1, h: 3.75 },
    { fontSize: 15 },
  );
  s.addText('核心判断：该项目应建设为“统一 AI 数据工作台”，而不是单一聊天助手。', {
    x: 0.95,
    y: 6.62,
    w: 10.8,
    h: 0.28,
    fontFace: 'Microsoft YaHei',
    fontSize: 17,
    bold: true,
    color: C.blue,
  });
  addFooter(s, 2);
}

// Slide 3: Goals and value
{
  const s = pptx.addSlide();
  addBg(s);
  addHeader(s, '02 项目目标与价值', '先做知识底座，再逐步接入经营数据与模板输出');
  const cards = [
    ['统一入库', '官网、产品资料、FAQ、Warranty、证书、渠道资料统一沉淀'],
    ['结构化理解', 'quick parse / deep parse 识别产品、合同、技术文档等结构'],
    ['知识问答', '基于知识库做可追溯问答，减少口径偏差'],
    ['模板输出', '自动输出产品介绍、FAQ、培训材料、渠道方案、经营报告'],
    ['多角色使用', '销售、市场、客服、管理层都可直接使用'],
    ['长期扩展', '后续接入 ERP、订单、库存、客诉，形成知识 + 数据双轮能力'],
  ];
  cards.forEach((card, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const x = 0.72 + col * 4.18;
    const y = 1.55 + row * 2.45;
    addRoundBox(s, { x, y, w: 3.72, h: 1.95 }, row === 0 ? C.paleBlue : C.pale);
    s.addText(card[0], {
      x: x + 0.22,
      y: y + 0.22,
      w: 2.4,
      h: 0.25,
      fontFace: 'Microsoft YaHei',
      fontSize: 18,
      bold: true,
      color: C.navy,
    });
    s.addText(card[1], {
      x: x + 0.22,
      y: y + 0.62,
      w: 3.2,
      h: 0.9,
      fontFace: 'Microsoft YaHei',
      fontSize: 13,
      color: C.text,
      fit: 'shrink',
    });
  });
  addFooter(s, 3);
}

// Slide 4: Platform positioning and current capability
{
  const s = pptx.addSlide();
  addBg(s);
  addHeader(s, '03 平台定位与现有能力', '基于 ai-data-platform 现有基础，快速收敛为客户版方案');
  addRoundBox(s, { x: 0.72, y: 1.45, w: 4.15, h: 4.9 }, C.navy, C.navy);
  s.addText('平台定位', {
    x: 1.0,
    y: 1.8,
    w: 2.0,
    h: 0.3,
    fontFace: 'Microsoft YaHei',
    fontSize: 20,
    bold: true,
    color: C.gold2,
  });
  addBullets(
    s,
    [
      '不是替代官网、ERP 或 App',
      '而是位于其上的数据接入层、知识理解层、检索供料层与模板输出层',
      '目标是把内容资产和经营数据转成可复用、可追溯、可输出的企业能力',
    ],
    { x: 0.98, y: 2.25, w: 3.4, h: 3.45 },
    { fontSize: 15, color: C.white },
  );
  addRoundBox(s, { x: 5.1, y: 1.45, w: 7.55, h: 4.9 }, C.pale);
  s.addText('平台当前已具备的基础能力', {
    x: 5.4,
    y: 1.8,
    w: 4.6,
    h: 0.3,
    fontFace: 'Microsoft YaHei',
    fontSize: 20,
    bold: true,
    color: C.navy,
  });
  addBullets(
    s,
    [
      '文档接入与上传，支持 quick parse / deep parse 双层解析',
      '文档分类、structured profile、知识库组织与混合检索',
      '首页 AI 工作台、文档中心、数据源工作台、报表模板与输出中心',
      '支持只读优先的数据接入策略，可为未来 ERP / 电商 / 业务系统接入打基础',
      '已具备 Web、API、Worker 三层结构，适合继续做客户化落地',
    ],
    { x: 5.38, y: 2.28, w: 6.75, h: 3.55 },
    { fontSize: 15 },
  );
  addFooter(s, 4);
}

// Slide 5: Architecture
{
  const s = pptx.addSlide();
  addBg(s);
  addHeader(s, '04 解决方案架构', '统一接入、双层解析、混合检索、模板输出');
  const boxes = [
    { x: 0.7, y: 2.1, w: 2.1, h: 2.2, title: '数据接入层', body: '官网页面\n产品文档\nFAQ / Warranty\n证书 / 媒体\nERP / 订单 / 库存 / 客诉' },
    { x: 3.1, y: 2.1, w: 2.1, h: 2.2, title: '解析理解层', body: '文本抽取\nOCR fallback\nquick parse\ndeep parse\nstructured profile' },
    { x: 5.5, y: 2.1, w: 2.1, h: 2.2, title: '知识检索层', body: '知识库组织\n候选过滤\n混合检索\n证据召回\n结果 rerank' },
    { x: 7.9, y: 2.1, w: 2.1, h: 2.2, title: '模板输出层', body: '产品介绍\nFAQ\n渠道方案\n经营分析\nPPT / 页面 / 表格' },
    { x: 10.3, y: 2.1, w: 2.1, h: 2.2, title: '工作台层', body: 'AI 工作台\n文档中心\n数据源台\n报表中心\n审计与权限' },
  ];
  boxes.forEach((b) => {
    addRoundBox(s, b, C.paleBlue);
    s.addText(b.title, {
      x: b.x + 0.18,
      y: b.y + 0.2,
      w: b.w - 0.36,
      h: 0.25,
      fontFace: 'Microsoft YaHei',
      fontSize: 17,
      bold: true,
      color: C.navy,
      align: 'center',
    });
    s.addText(b.body, {
      x: b.x + 0.2,
      y: b.y + 0.62,
      w: b.w - 0.4,
      h: 1.35,
      fontFace: 'Microsoft YaHei',
      fontSize: 12,
      color: C.text,
      align: 'center',
      valign: 'mid',
      fit: 'shrink',
    });
  });
  for (let i = 0; i < boxes.length - 1; i += 1) {
    s.addText('→', {
      x: boxes[i].x + boxes[i].w + 0.1,
      y: 3.0,
      w: 0.3,
      h: 0.3,
      fontFace: 'Segoe UI',
      fontSize: 26,
      color: C.blue,
      bold: true,
      align: 'center',
    });
  }
  addRoundBox(s, { x: 1.2, y: 5.15, w: 11.0, h: 1.1 }, 'FFF8EC', 'E4C98D');
  s.addText('面向客户的核心价值不是单次回答，而是把“产品知识、内容资产、渠道物料、客服支撑和经营分析”沉淀为统一平台能力。', {
    x: 1.45,
    y: 5.52,
    w: 10.5,
    h: 0.32,
    fontFace: 'Microsoft YaHei',
    fontSize: 16,
    bold: true,
    color: '7A5418',
    align: 'center',
  });
  addFooter(s, 5);
}

// Slide 6: Phase 1 use cases
{
  const s = pptx.addSlide();
  addBg(s);
  addHeader(s, '05 一期建设范围', '优先做“产品知识与内容中台”，最快形成客户价值闭环');
  addRoundBox(s, { x: 0.72, y: 1.5, w: 4.1, h: 4.85 }, C.paleBlue);
  s.addText('一期接入范围', {
    x: 0.98,
    y: 1.82,
    w: 2.2,
    h: 0.26,
    fontFace: 'Microsoft YaHei',
    fontSize: 18,
    bold: true,
    color: C.navy,
  });
  addBullets(
    s,
    [
      '官网产品页与公开内容',
      '产品说明书、规格表、卖点资料',
      'FAQ、Warranty、Certificate',
      '市场海报、展会资料、媒体稿件',
      '渠道销售资料与内部知识文档',
    ],
    { x: 0.98, y: 2.22, w: 3.45, h: 3.55 },
    { fontSize: 15 },
  );
  addRoundBox(s, { x: 5.06, y: 1.5, w: 7.6, h: 4.85 }, C.pale);
  s.addText('一期重点应用场景', {
    x: 5.34,
    y: 1.82,
    w: 3.2,
    h: 0.26,
    fontFace: 'Microsoft YaHei',
    fontSize: 18,
    bold: true,
    color: C.navy,
  });
  const useCases = [
    ['产品知识助手', '快速回答 SKU 卖点、差异、功能说明、证书与保修信息'],
    ['渠道资料整理', '自动输出渠道版产品介绍、方案页、规格对比表、FAQ 手册'],
    ['客服知识支撑', '沉淀标准答复、售后排查建议、版本差异说明'],
    ['市场内容重组', '为新品、展会、招商、社媒提供可复用内容底座'],
  ];
  useCases.forEach((u, idx) => {
    const x = idx % 2 === 0 ? 5.34 : 8.96;
    const y = idx < 2 ? 2.28 : 4.1;
    addRoundBox(s, { x, y, w: 3.15, h: 1.38 }, 'FFFFFF');
    s.addText(u[0], {
      x: x + 0.16,
      y: y + 0.15,
      w: 2.6,
      h: 0.22,
      fontFace: 'Microsoft YaHei',
      fontSize: 16,
      bold: true,
      color: C.blue,
    });
    s.addText(u[1], {
      x: x + 0.16,
      y: y + 0.48,
      w: 2.75,
      h: 0.65,
      fontFace: 'Microsoft YaHei',
      fontSize: 12,
      color: C.text,
      fit: 'shrink',
    });
  });
  addFooter(s, 6);
}

// Slide 7: Roadmap
{
  const s = pptx.addSlide();
  addBg(s);
  addHeader(s, '06 实施路径与阶段目标', '先做实一期，再扩展到经营数据与长期运营');
  const phases = [
    {
      x: 0.92,
      title: 'Phase 1',
      subtitle: '4~6 周',
      fill: 'EAF2FF',
      items: ['建立 Divoom 产品知识库', '接入官网与核心文档', '完成 quick / deep parse 主线', '建立产品问答与 FAQ / Warranty 模板'],
    },
    {
      x: 4.42,
      title: 'Phase 2',
      subtitle: '4~8 周',
      fill: 'F5F9FF',
      items: ['接入更多网页与后台数据源', '接入数据库 / ERP / 电商后台', '增加只读经营分析能力', '增加报表模板与导出能力'],
    },
    {
      x: 7.92,
      title: 'Phase 3',
      subtitle: '持续迭代',
      fill: 'FFF9EF',
      items: ['建立权限与审计体系', '支持多角色模板与自动报告', '支持多区域 / 多渠道扩展', '形成长期运营平台'],
    },
  ];
  phases.forEach((p) => {
    addRoundBox(s, { x: p.x, y: 1.92, w: 3.0, h: 3.75 }, p.fill, 'D4DEEA');
    s.addText(p.title, {
      x: p.x + 0.2,
      y: 2.2,
      w: 1.3,
      h: 0.25,
      fontFace: 'Segoe UI',
      fontSize: 20,
      bold: true,
      color: C.navy,
    });
    s.addText(p.subtitle, {
      x: p.x + 1.9,
      y: 2.22,
      w: 0.7,
      h: 0.2,
      align: 'right',
      fontFace: 'Microsoft YaHei',
      fontSize: 11,
      color: C.muted,
    });
    addBullets(s, p.items, { x: p.x + 0.18, y: 2.7, w: 2.5, h: 2.45 }, { fontSize: 14 });
  });
  s.addText('→', { x: 3.92, y: 3.45, w: 0.3, h: 0.3, fontSize: 28, color: C.blue, bold: true });
  s.addText('→', { x: 7.42, y: 3.45, w: 0.3, h: 0.3, fontSize: 28, color: C.blue, bold: true });
  addRoundBox(s, { x: 0.92, y: 6.0, w: 10.0, h: 0.78 }, '123154', '295487');
  s.addText('建议先用一期服务销售、市场、客服三类角色，尽快形成真实使用反馈，再逐步接入经营数据。', {
    x: 1.2,
    y: 6.28,
    w: 9.45,
    h: 0.24,
    fontFace: 'Microsoft YaHei',
    fontSize: 15,
    bold: true,
    color: C.white,
    align: 'center',
  });
  addFooter(s, 7);
}

// Slide 8: Deliverables and next step
{
  const s = pptx.addSlide();
  addBg(s, true);
  addHeader(s, '07 交付建议与下一步', '先形成可演示、可试用、可扩展的客户版平台', true);
  addRoundBox(s, { x: 0.85, y: 1.65, w: 5.65, h: 4.6 }, '102746', '36506D');
  addRoundBox(s, { x: 6.85, y: 1.65, w: 5.65, h: 4.6 }, '102746', '36506D');
  s.addText('首轮建议交付物', {
    x: 1.12,
    y: 1.98,
    w: 2.5,
    h: 0.26,
    fontFace: 'Microsoft YaHei',
    fontSize: 18,
    bold: true,
    color: C.gold2,
  });
  addBullets(
    s,
    [
      '客户版 AI 工作台',
      '产品知识库初始化',
      '官网 / 文档 / FAQ / Warranty 首批接入',
      '产品问答与客服问答能力',
      '渠道方案 / 产品介绍模板',
      '实施文档与管理员培训',
    ],
    { x: 1.12, y: 2.38, w: 4.7, h: 3.2 },
    { fontSize: 15, color: C.white },
  );
  s.addText('建议下一步', {
    x: 7.12,
    y: 1.98,
    w: 2.1,
    h: 0.26,
    fontFace: 'Microsoft YaHei',
    fontSize: 18,
    bold: true,
    color: C.gold2,
  });
  addBullets(
    s,
    [
      '确认一期目标角色：销售 / 市场 / 客服',
      '确认首批资料清单与接入范围',
      '确认部署方式：本地 / 私有网络 / 服务器',
      '确认后续是否纳入 ERP / 电商 / 售后数据',
      '进入实施排期与样板库搭建',
    ],
    { x: 7.12, y: 2.38, w: 4.7, h: 3.2 },
    { fontSize: 15, color: C.white },
  );
  s.addText('结论：AI Data Platform 适合作为 Divoom 产品知识、内容资产、渠道支撑与经营分析的一体化底座。', {
    x: 1.05,
    y: 6.48,
    w: 11.2,
    h: 0.32,
    fontFace: 'Microsoft YaHei',
    fontSize: 18,
    bold: true,
    color: C.white,
    align: 'center',
  });
  addFooter(s, 8, true);
}

async function main() {
  const output = path.resolve(
    __dirname,
    '..',
    'tmp',
    'AI Data Platform项目方案_Divoom_客户版_2026-03-30.pptx',
  );
  await pptx.writeFile({ fileName: output });
  console.log(output);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
