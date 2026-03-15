# Development Plan - 2026-03-16

## 目标

把 `ai-data-platform` 当前的“文档问答可演示版”推进到更可信、可验证的原型，优先围绕 **论文 / 技术文档解析与问答** 主线展开。

## 当前判断

- 主链路已通：文档扫描 / 解析 / 匹配 / `/api/chat` / Web 展示
- OpenClaw Gateway 已接入，适合作为编排与回答层
- Web 工作台骨架已形成，但多页面仍偏结构完成、业务未完全成熟
- 当前最需要补的不是更多页面，而是：
  1. 技术/论文类文档的分类与召回稳定性
  2. 回答结构与来源引用可信度
  3. 真实材料验证
  4. 阶段性收口与备份

## 第一阶段执行顺序

### 1. 盘清文档链路

当前代码路径：

- 扫描根目录：`apps/api/src/lib/document-store.ts`
  - `DEFAULT_SCAN_DIR` -> `storage/files`
  - `loadParsedDocuments()` 负责递归扫描、缓存复用、解析调度
- 文档解析：`apps/api/src/lib/document-parser.ts`
  - 当前支持 `txt` / `md` / `pdf`
  - 负责分类、摘要、摘录、标签、合同字段提取
- 文档分类配置：`apps/api/src/lib/document-config.ts`
  - 提供按目录关键词映射业务分类
- 文档接口：`apps/api/src/routes/documents.ts`
  - 提供列表、详情、扫描、配置保存
- 对话入口：`apps/api/src/routes/chat.ts`
  - 调用 `runChatOrchestration()`
- Web chat proxy：`apps/web/app/api/chat/route.js`
  - 透传到 `/api/chat`
- Web 文档中心：`apps/web/app/documents/page.js`
  - 展示分类绑定、统计与列表

当前最可能的薄弱点：

1. `document-store.ts` 的 prompt 匹配仍以轻量关键词打分为主，真实文档下可能误召回
2. `document-parser.ts` 仍是轻摘要/轻特征抽取，对论文结构支持较弱
3. 回答层虽然可返回 sources/panel，但是否稳定依赖正确召回与上下文质量

### 2. 建最小验证集

建议先做：

- 论文类文档：5 份
- 技术文档：5 份
- 每类 5-10 个问题

问题覆盖：

- 文档主要内容
- 方法 / 方案 / 模块
- 结果 / 结论 / 限制
- 对比类问题
- 带出处的问题

### 3. 跑现状测试

记录以下维度：

- 命中文档是否正确
- 是否跨类误召回
- 回答是否泛化
- sources 是否清楚
- 面板/正文/来源是否一致

### 4. 只先修一个最高价值问题

预期候选：

- 技术/论文问题被错误跨类召回
- 回答过泛，像通用聊天而不是文档分析
- 引用来源不够具体

## 本周任务

### 后端

- 收紧 technical / paper 路由与召回逻辑
- 必要时区分：路径分类 / 文件名特征 / 内容特征
- 为论文类补更清晰的结构化提取（目标/方法/结果/局限）
- 统一 chat 输出结构字段约定

### 前端

- 强化 sources 展示可读性
- 让 documents/detail/chat 的字段语义一致
- 减少“demo 感”文案，增强“分析结果”表达

### 测试

- 建立最小测试问题集
- 对真实资料做一轮验证
- 记录错误样例，为下一轮优化提供依据

## 里程碑前收口

- 清理缓存与构建产物
- 补 `.gitignore`（如需要）
- 做一次清晰提交
- 做一次备份

## 这轮开始动作

1. 梳理 orchestrator 与 chat 返回结构
2. 整理最小验证集模板
3. 选定第一优先修复项
