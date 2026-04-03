# Phase 1 Bot Visibility Implementation Design

## Goal

在不重做整个平台的前提下，先实现 bot 级知识可见范围，并为企业微信与 Teams 的渠道绑定预留模型。

Phase 1 只解决：

1. 平台能定义多个 bot。
2. 聊天请求可以明确指定 `botId`。
3. bot 只能看到被授权知识库内的文档。
4. memory-first 与 live-detail 使用同一套 bot 过滤规则。
5. bot 模型里预留渠道绑定，但暂不实现渠道适配器。

## Why Phase 1 First

这一阶段的目标不是做完整 bot 平台，而是先验证最关键的产品假设：

1. 同一平台上可以存在多个业务 bot。
2. 不同 bot 面对同一句知识问题，会因为可见知识不同而给出不同答案。
3. Web 主界面可以作为 bot 配置与调试台。
4. 后续企业微信与 Teams 只是消息接入层，不需要复制平台。

## Scope

Phase 1 包含：

1. bot 定义与读取
2. `/api/chat` 接收 `botId`
3. bot 级知识库可见范围
4. per-bot 记忆目录视图
5. bot 级实时供料过滤
6. Web 主界面 bot selector
7. Web 主界面在全智能模式下的 bot 配置入口
8. `channelBindings` 字段预留

Phase 1 不包含：

1. 企业微信消息适配器
2. Teams 消息适配器
3. bot 级动作权限矩阵
4. 文档标签级细粒度权限
5. control plane 远程下发 bot 配置

## Storage Decision

### Recommendation

Phase 1 的 bot 配置先放主平台本地配置层：

```text
config/bots.default.json
storage/config/bots.json
```

### Reasoning

1. bot 可见范围会直接影响聊天、记忆目录、供料和报表读取，属于主平台运行态配置。
2. 现在 control plane 更偏交付和运营，不适合先承担 bot 主配置。
3. 先在主平台跑通，后续如需远程下发，再把 source 切到 control plane 覆盖即可。

## Data Model

Phase 1 建议最小模型：

```ts
type BotDefinition = {
  id: string;
  name: string;
  slug: string;
  description: string;
  enabled: boolean;
  isDefault: boolean;
  systemPrompt: string;
  visibleLibraryKeys: string[];
  includeUngrouped: boolean;
  includeFailedParseDocuments: boolean;
  channelBindings: Array<{
    channel: "web" | "wecom" | "teams";
    enabled: boolean;
    externalBotId?: string;
    tenantId?: string;
    routeKey?: string;
  }>;
  updatedAt: string;
};
```

### Notes

1. Phase 1 先只按 `visibleLibraryKeys` 做主隔离。
2. `includeUngrouped` 和 `includeFailedParseDocuments` 保留为布尔开关。
3. `channelBindings` Phase 1 只存，不跑真实渠道适配。
4. 当前预期可先配置两个 bot：
   - 企业微信 bot
   - Teams bot

## Example Config

```json
{
  "version": 1,
  "updatedAt": "2026-04-03T18:00:00.000Z",
  "items": [
    {
      "id": "wecom-assistant",
      "name": "企业微信助理",
      "slug": "wecom-assistant",
      "description": "面向企业微信使用场景的业务助理",
      "enabled": true,
      "isDefault": true,
      "systemPrompt": "",
      "visibleLibraryKeys": ["contracts", "bids"],
      "includeUngrouped": false,
      "includeFailedParseDocuments": false,
      "channelBindings": [
        {
          "channel": "web",
          "enabled": true
        },
        {
          "channel": "wecom",
          "enabled": true,
          "routeKey": "default-wecom"
        }
      ],
      "updatedAt": "2026-04-03T18:00:00.000Z"
    },
    {
      "id": "teams-assistant",
      "name": "Teams 助理",
      "slug": "teams-assistant",
      "description": "面向 Teams 使用场景的业务助理",
      "enabled": true,
      "isDefault": false,
      "systemPrompt": "",
      "visibleLibraryKeys": ["delivery", "project-status"],
      "includeUngrouped": false,
      "includeFailedParseDocuments": false,
      "channelBindings": [
        {
          "channel": "web",
          "enabled": true
        },
        {
          "channel": "teams",
          "enabled": true,
          "tenantId": "placeholder-tenant"
        }
      ],
      "updatedAt": "2026-04-03T18:00:00.000Z"
    }
  ]
}
```

## Backend Design

### New Module

新增：

```text
apps/api/src/lib/bot-definitions.ts
```

职责：

1. 读取默认配置与本地覆盖配置
2. 返回启用中的 bot 列表
3. 解析默认 bot
4. 校验 `botId`
5. 解析渠道绑定

建议提供：

```ts
listBotDefinitions()
getBotDefinition(botId?: string)
getDefaultBotDefinition()
resolveBotDefinition(botId?: string)
resolveBotForChannel(channel, routeContext?)
```

### Visibility Resolution

新增：

```text
apps/api/src/lib/bot-visibility.ts
```

职责：

1. 根据 `visibleLibraryKeys` 过滤知识库
2. 根据开关过滤 `ungrouped` 和失败文档
3. 给记忆、供料、报表、动作层提供统一的 bot 过滤器

建议接口：

```ts
filterLibrariesForBot(bot, libraries)
filterDocumentsForBot(bot, documents)
isDocumentVisibleToBot(bot, document)
```

## Chat Flow Change

### Request Shape

Phase 1 的 Web 聊天请求建议变为：

```ts
{
  botId?: string;
  channel?: "web";
}
```

后续渠道适配器接入后，Web/企业微信/Teams 都遵守同一条链路，只是 `channel` 不同。

### Orchestration Flow

Phase 1 后的主链：

```text
/api/chat
  -> resolve bot
  -> validate bot/channel binding
  -> build system context using bot identity
  -> load bot memory state
  -> memory-first selection within bot scope
  -> prepare live detail supply within bot scope
  -> invoke gateway
```

### Files Likely To Change

1. [chat.ts](C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/routes/chat.ts)
2. [orchestrator.ts](C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/orchestrator.ts)
3. [knowledge-chat-dispatch.ts](C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/knowledge-chat-dispatch.ts)
4. [knowledge-supply.ts](C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/knowledge-supply.ts)
5. [chat-system-context.ts](C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/chat-system-context.ts)

## Memory View Design

### Recommendation

不要让 bot 直接读全局记忆目录，Phase 1 就应做 bot 视图。

建议文件：

```text
storage/config/openclaw-memory-catalog.json
storage/config/bots/<botId>/memory-catalog.json
memory/catalog/bots/<botId>/...
```

### Build Strategy

```text
global asset state
  -> global memory catalog
  -> bot visibility filter
  -> per-bot memory catalog
```

规则：

1. 全局 catalog 继续是资产真相源。
2. per-bot catalog 只是裁剪后的投影。
3. Phase 1 的企业微信 bot 和 Teams bot 都从同一个全局资产层裁剪。

## Supply Consistency Rule

Phase 1 必须遵守：

1. memory-first 选文按 bot 过滤
2. live-detail 供料按 bot 过滤
3. recent parsed / failed parse / recent upload / image fallback 也按 bot 过滤

否则会再次出现：

1. bot 记忆里不可见
2. 但 fallback 供料又把文档送给模型

## Frontend Design

### Main UI Role

主界面承担两层角色：

1. 日常使用时的 bot 选择器
2. 全智能模式下的 bot 配置与调试入口

### Bot Selection

建议：

1. 首屏或聊天区增加 `bot` 切换器
2. 默认选中系统默认 bot
3. 本地持久化最近一次选择
4. 发消息时把 `botId` 带到 `/api/chat`

### Bot Configuration

建议：

1. 不放 control plane，放主界面
2. 只有在全智能模式开启且密钥验证通过时才显示配置入口
3. 普通模式下只能使用/切换 bot，不能创建或编辑
4. 配置 UI 应至少支持：
   - 名称
   - 说明
   - 可见知识库
   - 渠道绑定开关
   - 默认 bot
   - 启用/停用

### Files Likely To Change

1. [use-home-page-controller.js](C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/web/app/use-home-page-controller.js)
2. [home-controller-actions.js](C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/web/app/home-controller-actions.js)
3. [Sidebar.js](C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/web/app/components/Sidebar.js)
4. [FullIntelligenceModeButton.js](C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/web/app/components/FullIntelligenceModeButton.js)
5. 新增 `BotSelector` 和 `BotConfigPanel`

## API For Frontend

主平台建议新增：

```text
GET /api/bots
GET /api/bots/default
```

如果要在全智能模式下允许直接配置 bot，再补：

```text
POST /api/bots
PATCH /api/bots/:id
```

写接口后端必须再次校验：

1. 当前会话已开启全智能模式
2. 当前密钥验证通过

## Channel Binding And Transport

### Phase 1 Position

Phase 1 不做企业微信和 Teams 适配器，但要把运行渠道设计放进模型。

### Later Flow

后续接企业微信和 Teams 时建议统一：

```text
wecom webhook / teams webhook
  -> channel adapter
  -> normalize message
  -> resolve bot by channelBindings
  -> invoke shared chat flow with botId
  -> normalize response
```

### Binding Rule

建议默认规则：

1. Web 可作为多个 bot 的调试入口
2. 企业微信请求必须命中绑定到 `wecom` 的 bot
3. Teams 请求必须命中绑定到 `teams` 的 bot
4. 外部渠道不能用“默认 bot 全局兜底”掩盖绑定错误

## System Context Design

系统上下文里建议补：

1. bot 名称
2. bot 角色说明
3. bot 当前可见知识范围
4. bot 当前运行渠道

原则：

1. 模型应知道自己当前是企业微信 bot 还是 Teams bot
2. 模型应明确自己看不到未授权知识范围

## Read Model Impact

聊天 debug 字段建议加：

```ts
{
  botId: string;
  botName: string;
  channel: "web" | "wecom" | "teams";
  visibleLibraries: string[];
}
```

## Migration Plan

Phase 1 可以无迁移风险启动：

1. 若无 `bots.json`，自动生成默认 bot
2. 默认 bot 可见现有全部库
3. 旧请求不带 `botId` 时，自动落到默认 bot
4. 现有 Web 对话继续可用
5. 企业微信和 Teams 适配器后续再接，不影响当前 Web 主链

## Testing Plan

至少补以下测试：

1. `bot-definitions.test.ts`
   - 默认 bot 解析
   - bot 启用/禁用
   - channelBindings 解析
2. `bot-visibility.test.ts`
   - bot 只能看到授权库
   - 未分组和失败文档开关生效
3. `knowledge-supply-bot.test.ts`
   - memory-first 与 live-detail 不越权
4. `chat-routes-bot.test.ts`
   - `/api/chat` 带 `botId` 后返回不同供料结果
5. `bot-channel-resolution.test.ts`
   - channel 与 bot 绑定解析正确

## Rollout Order

推荐顺序：

1. `bot-definitions.ts`
2. `bot-visibility.ts`
3. per-bot memory catalog
4. `/api/chat` 增加 `botId`
5. Web bot selector
6. 全智能模式下的 bot 配置面板
7. 后续再接企业微信和 Teams 渠道适配器

## Success Criteria

Phase 1 成功的标准：

1. 仓库中存在 bot 配置模型与默认配置
2. Web 前台可以切换 bot
3. 普通聊天请求稳定传 `botId`
4. per-bot memory 与 live-detail 使用同一套规则
5. 企业微信 bot 与 Teams bot 的配置字段已经具备
6. bot 配置只能在全智能模式下进行
