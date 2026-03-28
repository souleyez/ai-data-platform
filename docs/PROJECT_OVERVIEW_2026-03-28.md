# AI Data Platform 项目说明

日期：2026-03-28

## 1. 项目定位

`ai-data-platform` 是一个面向知识型资料管理、结构化理解、检索供料和报告输出的工作台系统。

系统当前的核心目标是把以下几件事串成一条稳定主线：

- 外部资料进入系统
- 文档快速入库并完成基础理解
- 后台持续做更深的结构化解析
- 按知识库范围检索证据并供给云端模型
- 按共享输出模板生成表格、静态页、PPT、文档等结果

系统不把 OpenClaw 当成业务主系统，而是把它作为云端理解与生成能力。项目自身负责：

- 数据源接入
- 文档入库
- quick/deep parse
- 向量化与混合检索
- 模板约束
- 结果持久化

## 2. 当前产品结构

### 2.1 首页工作台

首页是主交互入口，承担两类能力：

- 普通云端问答
- 基于知识库材料的回答或输出

当前策略是单入口对话：

- 普通问题直接走云端模型
- 判断出按库意向时，系统只做最小补槽
- 时间、内容范围、输出形式主要用于筛选本次参与消费的库内文件
- 系统尽量做“检索与供料层”，不做过重的本地编排

另外，首页本地对话记忆已同步系统反馈：

- 上传反馈
- 采集反馈
- 分组反馈
- 最近上传文档摘要

这样用户追问刚上传文档时，系统能基于最近摘要和必要的详细解析结果继续回答。

### 2.2 文档中心

文档中心是知识库运营台，负责：

- 上传文档
- 查看分组
- 新建分组
- 查看文档详情
- 查看 quick/deep parse 状态

当前文档主线已经稳定为：

- 上传后先做 `quick parse`
- 自动推荐并直接入库
- 再异步进入 `deep parse`
- deep parse 结果继续用于详情页、检索和按库输出

文档中心性能是系统硬约束：

- 打开列表不触发隐式全量重扫
- deep parse、向量化、采集都走后台任务
- 不允许再把文档中心拖回慢页

### 2.3 数据源工作台

数据源页已经从旧拼装页切到新的采集工作台。

当前支持的数据源类型：

- `web_public`
- `web_login`
- `web_discovery`
- `database`
- `erp`
- `upload_public`

当前已具备：

- 新建和编辑数据源
- 绑定目标知识库
- 启停和立即执行
- 运行记录
- 预置公开站点目录
- 自然语言整理采集需求
- 公开分享型上传数据源

统一外部上传入口现在已经被收进数据源体系，而不是文档中心单独能力。

### 2.4 报表中心

报表中心当前已经收成两块：

- 输出模板
- 已出报表

自然语言调整报表不放在报表中心，而是放在首页右侧当前报表工作区。

模板中心已经改成共享模板库：

- 所有知识库共享一套模板资产
- 默认输出模式包含：
  - 数据可视化静态页
  - PPT
  - 表格
  - 文档
- 每种模式可上传多份参考模板

## 3. 系统核心链路

### 3.1 文档进入系统

来源可以是：

- 手动上传
- 数据源采集
- 公开分享上传型数据源

统一流程：

1. 原始文件落盘
2. `quick parse`
3. 自动分组并直接入库
4. 入 `deep parse` 队列
5. deep parse 完成后进入向量化与混合检索

### 3.2 文档理解

文档理解分两层：

- `quick parse`
  - 目标是快
  - 负责基础文本、摘要、初步 `schemaType`、初步 `structuredProfile`
- `deep parse`
  - 目标是深
  - 负责证据块、实体、claims、表格片段、更完整的 `structuredProfile`

当前系统已经把 `schemaType` 和 `structuredProfile` 独立成专门模块，重点覆盖：

- `resume`
- `formula`
- `paper`
- `technical`
- `contract`
- `generic`

### 3.3 检索与供料

系统当前不是把知识库回答做成一个很重的本地代理，而是做成“筛文件、找证据、喂模型”：

1. 判断是否存在按库意向
2. 命中目标知识库
3. 用时间范围过滤库内文件
4. 用内容范围继续缩小候选
5. 做混合检索
   - 关键词/规则
   - 向量召回
   - rerank
6. 把高相关摘要、字段和证据块供给云端模型

当前时间与内容约束，已经不只是提示词，而是参与实际候选文件过滤。

### 3.4 模板输出

输出模板当前已经形成共享模板库和统一 envelope：

- `tableColumns`
- `pageSections`
- `fixedStructure`
- `variableZones`
- `outputHint`

知识库输出不是只给云端一段“请按模板输出”的自然语言提示，而是：

1. 先选模板
2. 把模板固定结构和可变区域一起送入上下文
3. 云端生成结果
4. 后端再做结果归一化和修复

目前重点模板语义已经覆盖：

- 简历
- 标书
- 订单经营
- 配方

## 4. 当前代码结构

### 4.1 应用层

- `apps/api`
  - Fastify API
- `apps/web`
  - Next.js Web 工作台
- `apps/worker`
  - 后台调度与异步任务

### 4.2 关键 API 路由

- `apps/api/src/routes/chat.ts`
- `apps/api/src/routes/documents.ts`
- `apps/api/src/routes/datasources.ts`
- `apps/api/src/routes/reports.ts`
- `apps/api/src/routes/web-captures.ts`
- `apps/api/src/routes/health.ts`
- `apps/api/src/routes/model-config.ts`

### 4.3 关键后端模块

文档与解析：

- `apps/api/src/lib/document-parser.ts`
- `apps/api/src/lib/document-schema.ts`
- `apps/api/src/lib/document-store.ts`
- `apps/api/src/lib/document-deep-parse-queue.ts`
- `apps/api/src/lib/document-retrieval.ts`
- `apps/api/src/lib/document-vector-index.ts`
- `apps/api/src/lib/document-vector-records.ts`

知识库回答与输出：

- `apps/api/src/lib/orchestrator.ts`
- `apps/api/src/lib/knowledge-plan.ts`
- `apps/api/src/lib/knowledge-evidence.ts`
- `apps/api/src/lib/knowledge-execution.ts`
- `apps/api/src/lib/knowledge-output.ts`
- `apps/api/src/lib/knowledge-template.ts`
- `apps/api/src/lib/openclaw-adapter.ts`

报表中心：

- `apps/api/src/lib/report-center.ts`

数据源：

- `apps/api/src/lib/datasource-definitions.ts`
- `apps/api/src/lib/datasource-provider.ts`
- `apps/api/src/lib/datasource-service.ts`
- `apps/api/src/lib/datasource-execution.ts`
- `apps/api/src/lib/datasource-planning.ts`
- `apps/api/src/lib/datasource-presets.ts`
- `apps/api/src/lib/datasource-database-connector.ts`
- `apps/api/src/lib/datasource-erp-connector.ts`

### 4.4 关键前端页面

- `apps/web/app/page.js`
- `apps/web/app/documents/page.js`
- `apps/web/app/datasources/page.js`
- `apps/web/app/reports/page.js`
- `apps/web/app/HomePageClient.js`
- `apps/web/app/use-home-page-controller.js`
- `apps/web/app/home-controller-actions.js`

## 5. 当前架构原则

### 5.1 不修改 OpenClaw 本体

这是当前项目最重要的技术边界。

所有能力增强都放在项目自身：

- provider
- adapter
- workspace-level logic
- task queue
- retrieval
- template system

这样后续 OpenClaw 升级时，项目可以低成本同步。

### 5.2 本地负责供料，云端负责理解与生成

本地负责：

- 入库
- 索引
- 过滤
- 检索
- 模板约束
- 结果归一化

云端负责：

- 理解问题
- 利用供给的证据回答
- 按模板约束生成结果

### 5.3 页面先稳，底层持续演进

项目最近几轮的主要策略是：

- 页面改动收敛
- 主要做底层能力增强
- 避免反复翻 UI

这是当前正确方向，因为系统主要瓶颈已经从“有没有页面”变成：

- 检索质量
- 供料质量
- 模板约束质量
- 数据源执行能力

## 6. 当前成熟度判断

### 6.1 已经成型的部分

- 文档 `quick / deep parse` 主线
- 自动分组直接入库
- 字段级向量记录
- 混合检索
- 单入口按库回答/输出
- 共享模板库
- 报表中心持久化
- 数据源工作台底座

### 6.2 仍在建设中的部分

- `database` 真实只读查询
- `erp` 真实 API / session 抽取
- 模板学习能力
- deep parse provider 化
- 云端稳定性与环境一致性

### 6.3 当前最值得继续投入的主线

1. 数据源执行链做实
2. deep parse provider 化
3. 检索与供料继续收紧
4. 共享模板库继续增强
5. 自动化回归补齐

## 7. 已知风险

- 本地云端路由环境仍可能偶发 fallback
- 某些历史文档和旧文档仍存在编码污染痕迹
- `database / erp` 当前仍是连接器骨架，不是完整生产连接器
- 深解析和模板学习仍未完全 provider 化

## 8. 建议阅读顺序

新接手这个项目时，建议按这个顺序理解：

1. `apps/api/src/lib/orchestrator.ts`
2. `apps/api/src/lib/knowledge-execution.ts`
3. `apps/api/src/lib/document-parser.ts`
4. `apps/api/src/lib/document-schema.ts`
5. `apps/api/src/lib/document-retrieval.ts`
6. `apps/api/src/lib/report-center.ts`
7. `apps/api/src/lib/datasource-definitions.ts`
8. `apps/api/src/lib/datasource-execution.ts`

## 9. 一句话总结

这个项目当前最准确的定义，不是“聊天工具”也不是“单纯文档库”，而是：

一个以知识库为核心、以检索供料为主、以共享模板输出为落点、并持续扩展多种数据源接入能力的 AI 文档数据助理平台。
