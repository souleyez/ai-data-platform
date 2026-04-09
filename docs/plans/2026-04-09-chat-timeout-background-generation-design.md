# Chat Timeout Background Generation Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 当聊天请求在同步窗口内无法完成时，自动转为后台继续生成，并把最终结果沉淀到报表中心。

**Architecture:** 聊天入口在超时阈值前不再死等云端完成，而是创建一个可持久化的后台生成任务和一个报表中心占位记录，立即回复用户“已转入报表中心继续生成”。后台 worker 继续调用 OpenClaw 完成生成，并把结果回填到报表中心；纯文本结果优先落成 `md`。

**Tech Stack:** Fastify API, OpenClaw gateway, report center state, runtime state files, web chat panel.

---

## 目标边界

只处理这一类情况：

- `/api/chat` 同步调用超过阈值，例如 45 秒
- 聊天请求仍然值得继续生成，不应直接失败
- 完成后需要存进“已出报表”

不改这两件事：

- “按库按模板输出”的现有确认编排保留
- 普通聊天的语义判断不回到宿主层

## 现状结论

### 已有能力

- 聊天入口在 [orchestrator.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/orchestrator.ts) 统一收口。
- OpenClaw 请求超时来自 [openclaw-adapter.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/openclaw-adapter.ts)，当前默认 45 秒。
- 报表中心已支持持久化输出，入口在 [chat-output-persistence.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/chat-output-persistence.ts) 和 [report-center.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/report-center.ts)。
- 报表中心输出类型已经包含 `md`，`createReportOutput()` 也支持 `kind: 'md'`。

### 当前缺口

- `persistChatOutputIfNeeded()` 只保存非 `answer` 输出，纯文本聊天结果不会落库。
- `ReportOutputRecord.status` 目前只有 `'ready'`，没有 `'processing'` 或 `'failed'`。
- `/api/chat` 一旦超时就直接 fallback，没有“后台续跑”机制。
- 前端聊天面板收到失败后只显示“云端问答未返回结果”，不会引导用户去报表中心。

## 方案选项

### 方案 A：只增大聊天超时

做法：

- 把 OpenClaw 聊天超时从 45 秒调到 120-180 秒

优点：

- 改动最小

缺点：

- 用户界面长时间无响应
- 长文档成稿仍可能超时
- 不能把结果沉淀到报表中心

结论：

- 不推荐，最多作为辅助配置

### 方案 B：请求内超时后启动内存后台 Promise

做法：

- `/api/chat` 超过阈值后，创建一个不受当前请求等待的 Promise 继续生成
- 当前请求立即返回“已转报表中心”

优点：

- 开发快

缺点：

- 进程重启即丢任务
- 无法可靠恢复
- 调试和并发控制都差

结论：

- 可做 PoC，不适合正式模式

### 方案 C：持久化后台生成任务 + 报表中心占位记录

做法：

- `/api/chat` 在接近超时阈值时创建后台任务
- 同时创建报表中心占位记录，状态为 `processing`
- 当前请求立即返回“已转入报表中心继续生成”
- worker 持续执行并在完成后更新报表记录

优点：

- 可恢复
- 用户体验稳定
- 和“已出报表”天然对齐

缺点：

- 需要补任务状态和更新接口

结论：

- 推荐方案

## 推荐设计

### 一、增加后台聊天生成任务状态

新增一个轻量 runtime state，例如：

- `storage/config/chat-background-jobs.json`

每个任务至少包含：

- `id`
- `status: queued | running | succeeded | failed`
- `prompt`
- `chatHistory`
- `sessionUser`
- `createdAt`
- `startedAt`
- `finishedAt`
- `latestDocumentPath`
- `reportOutputId`
- `error`
- `resultKind`

用途：

- 让后台续跑可恢复
- 让失败可诊断
- 让报表中心记录可反查到来源任务

### 二、扩展报表中心状态模型

把 [report-center.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/report-center.ts) 的 `ReportOutputRecord.status` 从单值：

- `ready`

扩成：

- `processing`
- `ready`
- `failed`

并允许创建“占位报表”：

- `kind = md`
- `format = md`
- `status = processing`
- `content = 当前仍在生成中`
- `summary = 该内容由聊天超时后转入后台继续生成`

### 三、让聊天入口在阈值后快速返回

在 [orchestrator.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/orchestrator.ts) 增加一层包装：

- 不直接把 OpenClaw timeout 视为最终失败
- 当请求满足“可转后台”的条件时：
  - 创建后台任务
  - 创建报表中心占位记录
  - 返回一个普通 assistant answer

建议返回文案：

- “这次内容较长，已转入报表中心继续生成。生成完成后会出现在‘已出报表’里。”

同时把 `savedReport` 一并返回，让前端能直接选中该占位记录。

### 四、定义哪些聊天结果转成什么格式

最小规则建议：

- 纯文字长结果：`md`
- 明确要求文档：`md` 先落地，后续再考虑 `doc`
- 原本就是结构化 page/table/ppt：沿用原有格式

也就是：

- 先不要在后台直接生成 docx
- 先用 `md` 把长文完整保存
- 后续如有需要，再从 `md` 导出 docx/pdf

### 五、后台 worker 的执行方式

建议单独做一个轻量 worker 轮询任务文件：

- 可在 API 进程启动时挂一个低频轮询器
- 每次只拉一个 `queued` 任务执行
- 执行时调用与聊天相同的 OpenClaw 供料方式
- 完成后更新对应 report output

关键点：

- worker 不能再复用原来的“请求超时即抛错”行为
- worker 应使用更长 timeout，例如 180-300 秒
- worker 要把最终结果写回 report output `content`

### 六、前端交互最小改动

聊天前端在 [home-controller-actions.js](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/web/app/home-controller-actions.js) 里已经会处理 `savedReport`。

所以最小前端改动只需要：

- 聊天返回 `savedReport` 占位记录时，直接选中它
- 报表列表里识别 `processing` 和 `failed`
- 对 `processing` 显示“生成中”
- 在页面上定时刷新报表列表，或在打开报表中心时刷新

这比新增一套聊天侧进度 UI 更省。

## 风险点

### 1. 结果幂等

同一句话如果用户重复点两次，可能产生两个后台任务。

最小规避：

- 用 `prompt + latestDocumentPath + recent chat history hash` 做去重键

### 2. 任务丢失

如果只做内存 Promise，会在重启后丢失。

所以推荐必须持久化任务文件。

### 3. 报表分组归属

纯文本聊天结果未必天然属于某个模板分组。

建议默认策略：

- 优先落到当前命中的知识库分组
- 若无明确分组，则落到一个通用 group，例如“chat-generated”

### 4. 长文输出内容过大

Markdown 内容可能很长。

建议：

- report center 记录保留摘要 + 全量 content
- 如内容过大，再补一个 `storage/files/reports/*.md` 实体文件路径

## 实施顺序

### Phase 1：打通后台续跑闭环

1. 扩展 report output `status`
2. 新增后台聊天任务状态文件
3. 新增创建占位报表记录的 helper
4. 聊天超时后返回“已转报表中心”
5. worker 完成后把纯文本结果写回 `md`

### Phase 2：前端可视化

1. 报表列表显示 `processing/failed`
2. 聊天返回后自动选中占位报表
3. 轮询或按需刷新报表列表

### Phase 3：增强

1. 支持失败重试
2. 支持从 `md` 导出 `docx/pdf`
3. 支持进度日志和执行耗时展示

## 推荐结论

建议直接做“方案 C：持久化后台生成任务 + 报表中心占位记录”。

原因很简单：

- 它和你要的“对话继续进行”兼容
- 它和现有报表中心模型天然兼容
- `md` 作为纯文字落点已经有现成支撑
- 它不需要把宿主层重新做复杂语义编排，只是在超时边界多一个异步承接面

## 一个需要最终拍板的小点

我建议默认把后台续跑结果优先落到：

- 当前命中的知识库分组

如果没有命中分组，再落到：

- `chat-generated`

这是最稳的默认值。
