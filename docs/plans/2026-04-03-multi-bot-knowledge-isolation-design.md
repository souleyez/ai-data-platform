# Multi-Bot Knowledge Isolation Design

## Goal

在同一套平台底座上支持多个业务机器人，并确保：

1. 每个机器人只能看到被授权的知识库和文档。
2. 每个机器人可以绑定不同运行渠道。
3. 普通聊天、报表输出、系统动作、记忆目录都遵守同一套机器人可见性规则。

当前已知场景是：

1. 一个机器人计划接入企业微信。
2. 一个机器人计划接入 Microsoft Teams。

这意味着机器人不再只是“不同人设”，而是：

`机器人 = 身份 + 知识范围 + 能力边界 + 渠道绑定`

## Current State

当前系统已经具备两块基础：

1. 网关模型口径支持 `openclaw` 与 `openclaw/<agentId>`，多机器人方向在网关层有扩展空间。
2. 聊天主链已经收成 memory-first，再按命中文档实时补细节。

当前还缺失的关键点：

1. 记忆目录还是全局单份，不是 per-bot 视图。
2. 文档、知识库、报表输出还没有 bot 级真实隔离。
3. 渠道只是 Web 主界面，没有企业微信/Teams 的 bot 绑定模型。

## Recommended Architecture

推荐采用：

`共享平台底座 + 共享知识资产主干 + per-bot 可见视图 + per-bot 渠道绑定`

不推荐一开始就做：

1. 每个机器人一套独立平台实例。
2. 每个机器人一套独立文档解析链。
3. 每个机器人一套独立向量和记忆全量重建。

原因很简单：

1. 文档解析、OCR、向量、重解析都属于昂贵公共能力，应该共享。
2. 机器人真正需要隔离的是“看到什么”和“能做什么”，不是“整个平台重复跑几份”。
3. 企业微信和 Teams 本质是不同消息渠道，不该倒逼复制整套平台。

## Core Model

建议引入 `BotDefinition`：

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

说明：

1. `visibleLibraryKeys` 是 Phase 1 的主要隔离手段。
2. `includeUngrouped` 和 `includeFailedParseDocuments` 控制边缘文档是否可见。
3. `channelBindings` 解决“哪个机器人跑在哪个渠道”的问题。
4. `externalBotId / tenantId / routeKey` 不是现在就全部接入，但 Phase 1 就要留字段，避免后面重做模型。

## Knowledge Isolation Principle

所有知识相关入口都必须先 resolve bot，再过滤：

1. 记忆目录构建。
2. memory-first 文档选择。
3. 实时供料。
4. 文档详情读取。
5. 报表生成。
6. 系统动作执行。

不能接受的做法：

1. 前端隐藏未授权库，但后端仍能读到。
2. prompt 里声明“你不能看某库”，但供料已经把文档给了模型。
3. 记忆目录是 bot 视图，但实时供料还是全局视图。

## Memory Design

推荐采用两层记忆：

1. 全局知识资产记忆
2. per-bot 记忆视图

文件布局建议：

```text
storage/config/openclaw-memory-catalog.json
storage/config/bots/<botId>/memory-catalog.json
memory/catalog/bots/<botId>/...
```

构建链路：

```text
global document state
  -> global memory catalog
  -> bot visibility filter
  -> per-bot memory catalog
```

理由：

1. 全局 catalog 继续作为知识资产真相源。
2. per-bot catalog 只是裁剪后的投影。
3. 这样既共享主干，又能保证机器人隔离。

## Channel Binding Design

当前已知的渠道目标是：

1. 企业微信 bot
2. Teams bot

因此建议把“渠道绑定”作为 bot 的一等属性，而不是后面临时外挂。

渠道链路建议统一为：

```text
channel event/webhook
  -> channel adapter
  -> normalize inbound message
  -> resolve bot by channel binding
  -> run chat/report/system-action flow with botId
  -> normalize outbound response
```

这里 Web 主界面和企业微信/Teams 的角色不同：

1. Web 主界面是配置、调试、回放、人工验证入口。
2. 企业微信和 Teams 是面向实际业务使用的运行渠道。

## Main UI Governance

bot 配置建议放主界面，不建议第一版放 control plane。

但要严格区分：

1. `bot` 选择：普通模式可见，可用于切换当前机器人。
2. `bot` 配置：只有全智能模式开启且密钥验证通过后才可见。

这意味着：

1. 日常使用者可以选机器人。
2. 只有有权限的人才能新建、编辑、启用、停用、设置默认机器人。
3. Web 主界面会成为 bot 配置与调试台。

control plane 后续可以展示 bot 状态或做远程下发，但不作为 Phase 1 的主要配置入口。

## Phase Plan

### Phase 1

只做最小闭环：

1. 定义 `BotDefinition`
2. 支持 `botId`
3. 按库级范围做隔离
4. 做 per-bot memory catalog
5. 让 memory-first 与 live-detail 使用同一套 bot 过滤
6. Web 主界面支持 bot 选择
7. Web 主界面在全智能模式下支持 bot 配置
8. 在 bot 模型中保留 `channelBindings`

Phase 1 不做：

1. 企业微信适配器
2. Teams 适配器
3. 文档标签级权限
4. bot 级动作矩阵

### Phase 2

接入渠道适配器：

1. 企业微信消息入口
2. Teams 消息入口
3. 渠道消息归一化
4. 渠道绑定 bot 解析

### Phase 3

补 bot 能力矩阵：

1. 哪些 bot 可以运行数据源
2. 哪些 bot 可以生成哪些报表格式
3. 哪些 bot 可以做系统动作

### Phase 4

补细粒度隔离：

1. 文档标签
2. 文档白名单
3. 项目归属
4. 客户归属

## Recommended Product Decision

基于“一个 bot 用企业微信、一个 bot 用 Teams”这个前提，我建议产品定义上明确：

1. 机器人首先是业务入口，不是聊天皮肤。
2. 机器人可以绑定一个主渠道，也可以保留多个渠道绑定字段。
3. Web 主界面主要承担配置和调试，不一定是最终用户主要入口。

这样后面不会把“渠道接入”和“机器人隔离”混成一件事。

## Success Criteria

这条设计成功的标志是：

1. 同一平台可同时存在企业微信 bot 和 Teams bot。
2. 两个 bot 面对同一句问题，会因知识范围不同返回不同结果。
3. 未授权 bot 无法通过任何 fallback 拿到未授权文档。
4. Web、企业微信、Teams 三类入口最终都走同一条 bot-aware 后端链路。
