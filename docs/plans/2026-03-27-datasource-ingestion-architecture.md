# 数据源接入与采集架构方案

日期：2026-03-27  
范围：数据源页面与底层采集架构  
原则：不修改 OpenClaw 本体，只在本项目内增加适配层、任务流、workspace skills 和存储结构

## 1. 目标

本轮不是继续堆网页抓取按钮，而是把“数据源”做成统一接入层，支持以下能力：

1. 手动增加数据源，含登录信息。
2. 尽量利用 OpenClaw 现有浏览器和 skills 能力进行正文采集，减少页面噪声和验证干扰。
3. 支持关联采集，同站点内识别内容链接，按规则持续采集。
4. 内置一批公开公示类招投标网站和国际公开学术资料平台，便于快速建立知识库。
5. 支持数据库连接信息录入和只读采集。
6. 支持 ERP 后台订单、客诉、库存等业务数据采集。
7. 采集结果统一落成文档，走现有 quick parse / deep parse 主线。
8. 数据源页面最终升级成“采集工作台”，让用户在一个工作栏里完成大多数采集配置和运维。

本方案的目标不是“一次性支持所有来源的完整自动化”，而是先建立一条可持续扩展的数据源总线：

- `数据源定义`
- `认证与连接`
- `发现链接`
- `正文提取`
- `采集调度`
- `入库`
- `日常 deep parse`

## 2. 设计原则

### 2.1 平台侧只做编排，不改 OpenClaw 本体

所有浏览器、登录、页面交互、技能能力，全部通过以下方式接入：

- OpenClaw Browser
- OpenClaw Browser Login
- OpenClaw workspace skills
- 本项目自己的 provider / adapter

禁止事项：

- 不修改 OpenClaw 内部代码
- 不在 OpenClaw 升级链路里打补丁
- 不把业务逻辑塞进 OpenClaw 本体目录

这样后续 OpenClaw 升级时，本项目只需要验证适配层，不需要重新 merge 魔改。

### 2.2 数据源层与解析层解耦

数据源层只负责“把内容带回来”，不负责深度结构化。

职责拆分：

- 数据源层：发现链接、认证、正文抽取、去重、持续调度
- 文档解析层：quick parse / deep parse / structuredProfile
- 知识库输出层：检索、模板、证据、报表输出

### 2.3 采集必须绑定目标知识库

默认规则改成：

- 新建采集任务时必须绑定一个或多个目标知识库
- 采集结果直接落到对应知识库
- 不再允许“采到了但不知道归哪”的中间状态

这样后续：

- deep parse
- 向量化
- 混合检索
- 模板输出

都能直接围绕目标知识库展开。

### 2.4 采集结果统一落成文档

采集结果不做成孤立的数据资产，而是统一转成文档入库，保留：

- 来源 URL
- 来源站点
- 抓取时间
- 数据源 ID
- 采集任务 ID
- 采集摘要

然后走现有主线：

- quick parse
- deep parse
- 向量化
- 知识库输出

### 2.5 文档中心性能是硬约束

后续数据源能力增强不能把文档中心重新拖慢。

必须坚持：

- 采集结果异步入库
- deep parse 异步执行
- 向量化异步执行
- 打开文档中心不触发隐式重扫或重解析

### 2.6 配置优先可运营，而不是一开始就追求全自动

优先支持：

- 公共招投标网站
- 国际公开学术资料平台
- 登录后正文页
- 数据库 / ERP 只读接入

暂不优先：

- 强依赖复杂反爬对抗的站点
- 高频动态站点的全量镜像
- 完全无人值守的复杂登录流程

## 3. 数据源模型

建议新增统一数据模型：

- `DatasourceDefinition`
- `DatasourceRun`
- `DatasourceCredential`
- `DatasourceTargetLibrary`

### 3.1 `DatasourceDefinition`

建议字段：

- `id`
- `name`
- `kind`
  - `web_public`
  - `web_login`
  - `web_discovery`
  - `database`
  - `erp`
- `status`
  - `active`
  - `paused`
  - `draft`
  - `error`
- `schedule`
  - `manual`
  - `daily`
  - `weekly`
  - `cron-like` 扩展预留
- `targetLibraries`
- `config`
- `createdAt`
- `updatedAt`
- `lastRunAt`
- `nextRunAt`
- `lastStatus`
- `lastSummary`

### 3.2 `DatasourceTargetLibrary`

建议字段：

- `key`
- `label`
- `mode`
  - `primary`
  - `secondary`

说明：

- 至少一个 primary
- 允许一个采集任务同时落多个库
- 但 deep parse / 模板输出时优先使用 primary

### 3.3 `DatasourceCredential`

建议字段：

- `id`
- `kind`
  - `http_basic`
  - `form_login`
  - `cookie_session`
  - `database_password`
  - `api_token`
- `origin`
- `username`
- `secretRef`
- `updatedAt`

注意：

- 密码和 token 仍然加密存储
- 页面不直接回显明文

### 3.4 `DatasourceRun`

建议字段：

- `id`
- `datasourceId`
- `startedAt`
- `finishedAt`
- `status`
  - `running`
  - `success`
  - `partial`
  - `failed`
- `discoveredCount`
- `capturedCount`
- `ingestedCount`
- `documentIds`
- `libraryKeys`
- `summary`
- `errorMessage`

## 4. 数据源类型

### 4.1 `web_public`

适合：

- 公开网站
- 招标公告页
- 学术公开页
- 政策公告页

配置字段建议：

- `baseUrl`
- `seedUrls`
- `focusKeywords`
- `listingSelectors`
- `detailSelectors`
- `urlIncludePatterns`
- `urlExcludePatterns`
- `maxItemsPerRun`

### 4.2 `web_login`

适合：

- 需要登录后查看正文的网站
- 供应链后台
- 客服后台
- 会员内容系统

配置字段建议：

- `loginMode`
  - `manual_session`
  - `credential`
- `credentialRef`
- `loginEntryUrl`
- `postLoginLandingUrl`
- `sessionPersistenceMode`

### 4.3 `web_discovery`

适合：

- 列表页到详情页
- 站内持续采集
- 按关键词和栏目进行长期跟踪

配置字段建议：

- `seedUrls`
- `listingSelectors`
- `detailSelectors`
- `nextPageSelector`
- `keywordMode`
- `maxDepth`
- `maxItemsPerRun`

### 4.4 `database`

适合：

- MySQL
- PostgreSQL
- SQL Server
- Oracle
- ClickHouse

配置字段建议：

- `dbType`
- `host`
- `port`
- `database`
- `username`
- `credentialRef`
- `sslMode`
- `readOnly`
- `tablesOrViews`
- `incrementalColumn`
- `queryTemplate`

### 4.5 `erp`

适合：

- ERP 订单
- 客诉
- 库存
- 发货
- 回款

配置字段建议：

- `erpKind`
- `connectMode`
  - `api`
  - `database`
  - `browser`
- `apiBaseUrl`
- `dbRef`
- `credentialRef`
- `moduleScopes`
- `incrementalStrategy`

## 5. 推荐的 OpenClaw 能力用法

### 5.1 推荐 1：OpenClaw Browser

最值得优先使用。

适合：

- 列表页进入详情页
- 登录后页面导航
- 富前端页面正文抓取
- 站点内连续点击采集

建议用法：

- 平台内通过 provider 调用 OpenClaw Browser
- 优先使用 `snapshot` + DOM 选择 + 正文选择器
- 不让模型自由浏览全站，必须受 datasource scope 约束

参考：

- [OpenClaw Browser CLI](https://docs.openclaw.ai/cli/browser)
- [OpenClaw Browser Tool](https://docs.openclaw.ai/tools/browser)

### 5.2 推荐 2：Browser Login

官方建议：需要登录的站点，优先人工在 OpenClaw 浏览器 profile 中登录，而不是把凭据直接交给模型自动登录。

适合：

- ERP 后台
- 招采后台
- 供应商门户
- 需要短信或图形验证码的平台

建议用法：

- 记录 `loginMode = manual_session`
- 用户在 OpenClaw 托管浏览器里手动登录
- 项目侧复用登录态进行受控采集

参考：

- [OpenClaw Browser Login](https://docs.openclaw.ai/tools/browser-login)

### 5.3 推荐 3：Workspace Skills

OpenClaw 官方支持 workspace skills，且 workspace skills 优先级最高。对本项目最稳的做法是自己做 skill，而不是依赖不受控的第三方抓取 skill。

建议新增两类 workspace skill：

- `site-body-extract`
  - 从页面结构里提取正文
  - 只输出干净正文、标题、摘要、时间、链接
- `site-link-discovery`
  - 从列表页识别内容链接
  - 只输出候选详情页 URL 与基础标题

参考：

- [OpenClaw Skills](https://docs.openclaw.ai/skills)

## 6. 公开站点建议清单

### 6.1 国内公开招投标与公示平台

1. 全国公共资源交易平台  
   [https://www.ggzy.gov.cn/](https://www.ggzy.gov.cn/)

2. 中国政府采购网  
   [https://www.ccgp.gov.cn/](https://www.ccgp.gov.cn/)

3. 中国招标投标公共服务平台  
   [http://www.cebpubservice.com/](http://www.cebpubservice.com/)

4. 武汉市公共资源交易服务平台  
   [https://ggzyfw.wuhan.gov.cn/whggzy/](https://ggzyfw.wuhan.gov.cn/whggzy/)

5. 省级公共资源交易平台  
   例如：
   - 北京：[https://ggzyfw.beijing.gov.cn/](https://ggzyfw.beijing.gov.cn/)
   - 广东：[https://ygp.gdzwfw.gov.cn/](https://ygp.gdzwfw.gov.cn/)
   - 湖北：[https://www.hbggzyfwpt.cn/](https://www.hbggzyfwpt.cn/)

### 6.2 国际公开学术与资料平台

优先收录这些公开、可持续采集、对知识库价值高的站点：

1. PubMed  
   [https://pubmed.ncbi.nlm.nih.gov/](https://pubmed.ncbi.nlm.nih.gov/)

2. PubMed Central  
   [https://pmc.ncbi.nlm.nih.gov/](https://pmc.ncbi.nlm.nih.gov/)

3. arXiv  
   [https://arxiv.org/](https://arxiv.org/)

4. DOAJ  
   [https://doaj.org/](https://doaj.org/)

5. WHO IRIS  
   [https://iris.who.int/](https://iris.who.int/)

6. OpenAlex  
   [https://openalex.org/](https://openalex.org/)

7. Semantic Scholar  
   [https://www.semanticscholar.org/](https://www.semanticscholar.org/)

8. Crossref  
   [https://www.crossref.org/](https://www.crossref.org/)

9. bioRxiv  
   [https://www.biorxiv.org/](https://www.biorxiv.org/)

10. medRxiv  
   [https://www.medrxiv.org/](https://www.medrxiv.org/)

## 7. 推荐采集架构

### 7.1 三段式采集

所有数据源统一走三段式：

1. `discover`
   - 找到候选内容页
2. `extract`
   - 抽正文与元数据
3. `ingest`
   - 入库并进入 quick parse

### 7.2 `discover`

对列表型站点：

- 从 seed 页面提取候选链接
- 按 include / exclude 规则过滤
- 对标题、URL、摘要做去重
- 产出候选详情页

### 7.3 `extract`

优先顺序：

1. OpenClaw Browser + workspace skill 正文抽取
2. 当前项目内 `trafilatura` 正文抽取
3. fallback HTML 清洗

### 7.4 `ingest`

入库时只做：

- 原文保存
- 元数据保存
- quick parse
- 初步分组建议

不在采集链里同步等待 deep parse。

## 8. 关联采集设计

### 8.1 同站点持续采集

支持：

- 列表页 -> 详情页
- 当前栏目 -> 下一页
- 当前关键词 -> 每日 / 每周增量采集

为此 datasource 建议补这些字段：

- `seedUrls`
- `listingSelectors`
- `detailSelectors`
- `nextPageSelector`
- `keywordMode`
- `maxDepth`
- `maxItemsPerRun`

### 8.2 关键字定向采集

针对公开招标网站，用户输入：

- 关键词
- 行业
- 地区
- 时间范围

系统做法：

- 先限制到指定站点 / 栏目
- 再带关键词做站内搜索或列表过滤
- 再持续采集命中的详情页

### 8.3 结果去重

去重建议同时做：

- URL 去重
- 标题近似去重
- 正文哈希去重
- 公告编号 / 项目编号去重

## 9. 数据库与 ERP 采集

### 9.1 数据库采集原则

- 默认只读
- 只允许白名单 SQL
- 不支持任意写入
- 优先采集视图或只读用户

### 9.2 采集形态

建议支持两种：

1. 表 / 视图同步
   - 定期抽取新增 / 更新记录
2. 查询模板同步
   - 用户配置固定 SQL 模板
   - 系统按周期执行

### 9.3 ERP 推荐模块

第一阶段只接：

- 订单
- 售后 / 客诉
- 库存
- 发货
- 回款

### 9.4 ERP 入库形式

ERP 数据建议直接进入专门知识库：

- `订单分析`
- `客诉分析`
- `库存分析`

必要时同步生成业务摘要文档，便于后续 deep parse 和模板输出。

## 10. 数据源页面目标形态

数据源页面最终应升级成“采集工作台”，尽量在一个工作栏里解决大多数采集需求。

### 10.1 配置能力

支持：

- 手动输入网址 / 站点 / 数据库 / ERP / API
- 输入登录信息或引用已保存凭据
- 选择目标知识库
- 配置采集频率、关键词、范围、条数上限
- 让模型先把自然语言需求整理成结构化采集配置

### 10.2 状态工作台

必须清楚展示：

- 当前状态
  - `运行中 / 暂停 / 异常 / 草稿`
- 已采集多少
- 上次采集时间
- 下次采集时间
- 落了哪些知识库
- 最近一次结果摘要
- 启停
- 编辑
- 删除

## 11. 模型辅助配置

建议增加一条配置辅助链：

用户先用自然语言描述采集需求，例如：

- 每周抓取奶粉配方相关论文，放到配方知识库
- 定期采集广东省招标公告里和医疗设备相关的内容，进标书库
- 每天同步 ERP 中新增订单和客诉，分别进订单分析和客诉分析

然后系统：

1. 汇总需求
2. 模型整理成结构化配置草案
3. 用户确认 / 修改
4. 生成数据源定义与任务

## 12. 推荐实施顺序

### M1：底层数据模型与 provider 接口

先做：

- `DatasourceDefinition`
- `DatasourceRun`
- `DatasourceCredential`
- `DatasourceTargetLibrary`
- 统一 datasource provider 接口

### M2：公开网页采集

先做：

- `web_public`
- `web_discovery`
- 公开招投标网站
- 国际公开学术平台

### M3：登录态采集

先做：

- `web_login`
- Browser Login session 复用
- 登录态 datasource 管理

### M4：数据库与 ERP

先做：

- `database`
- `erp`
- 订单 / 客诉 / 库存知识库绑定

### M5：模型辅助配置与模板学习

后续支持：

- 自然语言采集需求转结构化配置
- 截图 / 链接学习模板
- 输出模板资产沉淀

## 13. 关键架构决策

### ADR-001 不修改 OpenClaw 本体

决策：

- 所有增强只放项目侧

原因：

- OpenClaw 升级无负担
- 降低维护成本
- 避免核心依赖被业务逻辑污染

### ADR-002 登录站点优先人工登录复用 session

决策：

- 优先 Browser Login 推荐流，而非自动登录

原因：

- 更容易绕开验证
- 更少触发风控
- 更适合 ERP / 后台类场景

### ADR-003 采集必须绑定知识库

决策：

- 不再允许游离采集结果

原因：

- 入库归属明确
- 后续 deep parse 更清晰
- 向量化和检索直接围绕目标知识库展开

### ADR-004 文档中心性能优先于采集“实时感”

决策：

- 采集、deep parse、向量化全部后台化

原因：

- 避免文档中心再次被拖慢
- 维持知识库运营台的稳定体验

## 14. 下一步建议

最稳的下一步不是直接改页面，而是先做这 3 件底层工作：

1. 定义 `DatasourceDefinition / DatasourceRun / DatasourceCredential / DatasourceTargetLibrary`
2. 在现有 `web-capture` 之上抽出统一 datasource provider 接口
3. 新增 `web_public / web_login / database` 三类 provider 骨架

等这层稳定后，再去做数据源页面的大调整，风险最低。

## 参考资料

- [OpenClaw Browser CLI](https://docs.openclaw.ai/cli/browser)
- [OpenClaw Browser Tool](https://docs.openclaw.ai/tools/browser)
- [OpenClaw Browser Login](https://docs.openclaw.ai/tools/browser-login)
- [OpenClaw Skills](https://docs.openclaw.ai/skills)
- [全国公共资源交易平台](https://www.ggzy.gov.cn/)
- [中国政府采购网](https://www.ccgp.gov.cn/)
- [武汉市公共资源交易服务平台](https://ggzyfw.wuhan.gov.cn/)
