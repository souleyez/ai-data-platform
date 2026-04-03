# Phase 1 Bot Visibility Implementation Checklist

## Goal

把 Phase 1 收成一套可直接开工的实施清单，只解决：

1. 多 bot 定义
2. 聊天传 `botId`
3. bot 级知识库可见范围
4. per-bot 记忆视图
5. memory-first 与 live-detail 的一致过滤
6. Web 主界面 bot 选择
7. 全智能模式下的 bot 配置
8. 为企业微信和 Teams 预留渠道绑定模型

## Delivery Boundary

Phase 1 完成后，系统应满足：

1. 前台可选择 bot
2. `/api/chat` 可接收 `botId`
3. 不同 bot 因知识范围不同返回不同结果
4. 未授权 bot 不能通过库名、文档名、最近解析、失败重解析等 fallback 越权
5. Web 主界面可在全智能模式下配置 bot
6. bot 模型已包含企业微信和 Teams 的渠道绑定字段

## Work Package 1: Bot Config And Resolution

### Add

1. `apps/api/src/lib/bot-definitions.ts`
2. `config/bots.default.json`

### Responsibilities

1. 读取默认 bot 配置
2. 读取本地覆盖配置 `storage/config/bots.json`
3. 返回启用 bot 列表
4. 解析默认 bot
5. 校验 `botId`
6. 解析 `channelBindings`

### Required APIs

```ts
listBotDefinitions()
getDefaultBotDefinition()
resolveBotDefinition(botId?: string)
resolveBotForChannel(channel, routeContext?)
```

### Rules

1. 只能有一个默认 bot
2. 禁用 bot 不能被聊天请求选中
3. `channelBindings` 至少支持 `web | wecom | teams`
4. Phase 1 虽不接企业微信/Teams 适配器，但模型字段必须存在

## Work Package 2: Bot Visibility Filter

### Add

1. `apps/api/src/lib/bot-visibility.ts`

### Responsibilities

1. 过滤 bot 可见知识库
2. 过滤 bot 可见文档
3. 给记忆与供料层复用同一套规则

### Required APIs

```ts
filterLibrariesForBot(bot, libraries)
filterDocumentsForBot(bot, documents)
isDocumentVisibleToBot(bot, document)
```

### Phase 1 Rules

1. 主过滤条件是 `visibleLibraryKeys`
2. `includeUngrouped=false` 时，不可见 `ungrouped`
3. `includeFailedParseDocuments=false` 时，不可见失败文档

## Work Package 3: Bot-Aware Memory Catalog

### Add

1. `apps/api/src/lib/bot-memory-catalog.ts`

### Change

1. `apps/api/src/lib/openclaw-memory-catalog.ts`
2. `apps/api/src/lib/openclaw-memory-selection.ts`
3. `apps/api/src/lib/openclaw-memory-sync.ts`

### Responsibilities

1. 基于全局 catalog 为每个 bot 生成裁剪后的记忆视图
2. 支持按 `botId` 读取记忆状态
3. 同步时同时刷新全局 catalog 和 per-bot catalog

### Recommended File Layout

```text
storage/config/openclaw-memory-catalog.json
storage/config/bots/<botId>/memory-catalog.json
memory/catalog/bots/<botId>/...
```

### Rules

1. bot memory 只从全局资产裁剪，不重复跑解析
2. 无效 bot 不得继续走聊天主链
3. 企业微信 bot 与 Teams bot 都共享全局资产源，只是视图不同

## Work Package 4: Chat Request Plumbing

### Change

1. `apps/api/src/routes/chat.ts`
2. `apps/api/src/lib/orchestrator.ts`
3. `apps/api/src/lib/knowledge-chat-dispatch.ts`
4. `apps/api/src/lib/chat-system-context.ts`

### Request Shape

```ts
{
  botId?: string;
  channel?: "web";
}
```

### Responsibilities

1. `/api/chat` 接收 `botId`
2. 后端 resolve bot
3. 系统上下文带 bot 身份和渠道
4. 记忆选文和实时供料都使用 bot 过滤

### Required Debug Fields

```ts
{
  botId: string;
  botName: string;
  channel: "web" | "wecom" | "teams";
  visibleLibraries: string[];
}
```

## Work Package 5: Bot-Aware Supply

### Change

1. `apps/api/src/lib/knowledge-supply.ts`
2. `apps/api/src/lib/knowledge-chat-dispatch.ts`
3. `apps/api/src/lib/knowledge-execution.ts`

### Responsibilities

1. `prepareKnowledgeScope(...)` 支持 bot 过滤
2. `prepareKnowledgeRetrieval(...)` 不得越过 bot 范围
3. recent parsed / failed parse / recent upload / image fallback 也按 bot 过滤

### Rules

1. memory-first 选中的文档必须先通过 bot 可见性校验
2. `preferredLibraries` 不能越过 bot 可见范围
3. 用户请求未授权库时，应明确返回“当前 bot 不可见该知识范围”

## Work Package 6: Bot List API

### Add

1. `apps/api/src/routes/bots.ts`

### Endpoints

```text
GET /api/bots
GET /api/bots/default
```

### Response Shape

只返回前台需要的基础信息：

```ts
{
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  channelBindings: Array<{
    channel: "web" | "wecom" | "teams";
    enabled: boolean;
  }>;
}
```

### Full-Mode Write APIs

如果主界面要在全智能模式下直接配置 bot，则增加：

```text
POST /api/bots
PATCH /api/bots/:id
```

写接口必须在后端校验：

1. 当前会话处于全智能模式
2. 当前密钥已验证通过

## Work Package 7: Frontend Bot Selection And Full-Mode Config

### Change

1. `apps/web/app/use-home-page-controller.js`
2. `apps/web/app/home-controller-actions.js`
3. `apps/web/app/home-api.js`
4. `apps/web/app/components/FullIntelligenceModeButton.js`
5. 聊天页相关组件

### Add

1. `apps/web/app/components/BotSelector.js`
2. `apps/web/app/components/BotConfigPanel.js`

### Responsibilities

1. 加载 bot 列表
2. 默认选中系统默认 bot
3. 本地持久化用户最近一次选择
4. 发消息时把 `botId` 带到 `/api/chat`
5. 仅在全智能模式下显示 bot 配置入口

### Rules

1. 普通模式下可以切换 bot，但不能配置 bot
2. bot 配置入口只在全智能模式密钥验证通过后出现
3. bot 配置界面放主界面，但不干扰普通聊天主视图
4. Web 中的 bot selector 兼具使用和调试价值，最终业务入口仍可能是企业微信或 Teams

## Work Package 8: Main-UI Bot Config Surface

### Recommendation

主界面中的 bot 配置面板 Phase 1 只做最小能力：

1. 新建 bot
2. 编辑名称、说明、系统提示
3. 选择可见知识库
4. 配置渠道绑定开关
5. 启用 / 停用
6. 设为默认

### Channel Binding Form

至少支持：

1. `web` 启用开关
2. `wecom` 启用开关 + `routeKey`
3. `teams` 启用开关 + `tenantId`

说明：

1. Phase 1 这里只是配置字段，不代表渠道消息已经接通
2. 这样可以先把“企业微信 bot / Teams bot”的模型定死

## Work Package 9: Channel-Aware Bot Resolution Model

### Phase 1 Only Reserve

不实现适配器，但要把解析规则定下来：

1. Web 请求可显式带 `botId`
2. Web 未带 `botId` 时可回退默认 bot
3. 企业微信后续应按 `channel=wecom` + `routeKey` 解析 bot
4. Teams 后续应按 `channel=teams` + `tenantId` 解析 bot
5. 外部渠道不建议用“全局默认 bot”静默兜底

## Testing Checklist

### New Tests

1. `bot-definitions.test.ts`
2. `bot-visibility.test.ts`
3. `chat-bot-routing.test.ts`
4. `bot-memory-catalog.test.ts`
5. `bot-config-full-mode-guard.test.ts`
6. `bot-channel-resolution.test.ts`

### Update Existing Tests

1. `knowledge-supply.test.ts`
2. `openclaw-memory-selection.test.ts`
3. `knowledge-execution-answer.test.ts`

### Must-Cover Cases

1. 默认 bot fallback
2. 不同 bot 可见不同库
3. 最近解析 fallback 不越权
4. 失败重解析 fallback 不越权
5. 普通模式下不可写 bot 配置
6. 全智能模式下可写 bot 配置
7. `wecom` 与 `teams` 绑定字段可正确解析与保存

## Rollout Order

严格按顺序：

1. `bot-definitions.ts`
2. `bot-visibility.ts`
3. bot-aware memory catalog
4. `/api/chat` 接 `botId`
5. supply 统一接 bot 过滤
6. `/api/bots`
7. Web bot selector
8. 主界面全智能模式下的 bot 配置面板
9. 后续再做企业微信与 Teams 适配器

## Suggested Commits

建议拆成 5 笔：

1. `Add bot definitions and visibility filtering`
2. `Add per-bot memory catalog views`
3. `Make chat and supply bot-aware`
4. `Add main-ui bot selector and full-mode bot config`
5. `Reserve channel bindings for wecom and teams bots`

## Exit Criteria

可以认为 Phase 1 做完的标准：

1. 仓库里有 bot 配置模型和默认配置
2. 前台能切换 bot
3. 聊天请求能稳定传 `botId`
4. per-bot memory 和 live-detail 一致生效
5. bot 配置只能在全智能模式下进行
6. 企业微信 bot 与 Teams bot 的绑定字段已经纳入模型
