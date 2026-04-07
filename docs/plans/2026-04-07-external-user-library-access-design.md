# External User Library Access Design

## Goal

在现有多机器人权限模型上新增一层“外部用户权限映射”，支持：

1. 第三方机器人继续按渠道绑定到同一个 bot。
2. 通过接口同步第三方用户表、组表、组成员关系。
3. 在管理界面里按人、按组配置可见文档库。
4. 同一个第三方机器人面对不同外部用户时，只回答该用户有权限访问的文档库内容。

这项能力是**新增一层权限收窄**，不是替代当前 bot 权限。

## Scope

第一版只做：

1. 外部渠道用户身份映射
2. 按用户/按组配置文档库可见范围
3. 在聊天供料链路里做真实权限收窄
4. 先支持通过 HTTP 接口同步外部用户目录
5. 先按渠道分别管理身份，不做跨渠道统一身份

第一版不做：

1. 替换 `libraryAccessLevel` 或 `visibleLibraryKeys`
2. 文档级、字段级 ACL
3. 跨渠道用户合并
4. 外部组织架构双向写回
5. 通用规则引擎或复杂 deny/allow 优先级编辑器

## Guardrails

1. 不替代现有 bot 可见性模型
2. 不把 per-user 权限直接塞进 prompt，而是后端真实过滤
3. 不让 per-bot memory catalog 在共享 bot 场景下越权
4. 不引入第二套知识系统
5. 不把目录同步做成“数据源采集内容入库”

## Current State

当前主链已经具备三块可以复用的基础：

1. 渠道消息入口已经能拿到 `senderId` / `senderName` / `routeKey` / `tenantId`
2. bot 已有 `libraryAccessLevel` 和 `visibleLibraryKeys`
3. 文档、记忆目录、供料检索已经统一经过 bot 可见性过滤

关键现状文件：

- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\bot-definitions.ts`
- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\bot-visibility.ts`
- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\channel-ingress.ts`
- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\openclaw-memory-selection.ts`
- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\knowledge-chat-dispatch.ts`
- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\web\app\components\BotConfigPanel.js`

当前还缺失：

1. 外部用户目录的同步和缓存
2. 用户/组级文档库授权
3. 在 bot 上限之下按外部用户动态计算 `effectiveVisibleLibraryKeys`
4. 针对共享 bot 的 memory-first 安全过滤

## Core Decision

### Decision 1: 保留 bot 权限，新增外部用户权限层

最终权限不再只取 bot，而是：

`effective libraries = bot upper bound ∩ external subject assignment`

这里的 bot upper bound 指：

1. `libraryAccessLevel`
2. `visibleLibraryKeys`
3. `includeUngrouped`
4. `includeFailedParseDocuments`

外部用户映射只负责进一步收窄，不负责放大 bot 权限。

### Decision 2: 权限默认收紧，不做宽松回退

当某个第三方渠道绑定启用了“外部用户映射”后：

1. 如果外部用户未匹配到目录用户，默认无库权限
2. 如果匹配到了用户但未配置任何用户/组授权，默认无库权限
3. Web 调试入口不受这套外部用户权限影响，仍按 bot 级权限工作

### Decision 3: 目录同步与权限配置分层存储

不把同步配置、目录快照、权限策略混在 `bots.json`。

建议拆为三类运行态文件：

```text
storage/config/channel-directory-sources.json
storage/config/channel-directory-cache/<sourceId>.json
storage/config/channel-user-access-policies.json
```

### Decision 4: 同一个 bot 被多人共享时，memory-first 必须按请求再次过滤

当前 `loadBotMemorySelectionState(botId)` 加载的是 per-bot memory 视图。

这在“一个 bot 只服务一个权限范围”时成立，但在“同一个 wecom bot 服务很多不同用户”时不够安全。

因此第一版要求：

1. memory selection 的候选集必须带 `effectiveVisibleLibraryKeys` 过滤
2. 不能仅依赖 per-bot memory catalog 做最终候选
3. 对启用了外部用户映射的请求，优先使用全局 memory state + effective library set 过滤

## Recommended Architecture

推荐模型：

`bot = 渠道身份入口 + 上限权限`

`external subject access = 用户/组级收窄权限`

`chat request = bot identity + external sender identity + effective library scope`

### High-Level Flow

```text
channel message
  -> resolve bot by channel binding
  -> resolve sender identity from senderId / tenantId / routeKey
  -> load external directory snapshot
  -> resolve user + groups
  -> load user/group library assignments
  -> intersect with bot upper bound
  -> build effectiveVisibleLibraryKeys
  -> memory-first selection with effective scope
  -> live retrieval with effective scope
  -> answer
```

## Data Model

### 1. Bot Channel Binding Extension

现有 `BotChannelBinding` 不需要重做，只新增一个引用：

```ts
type BotChannelBinding = {
  channel: "web" | "wecom" | "teams" | "qq" | "feishu";
  enabled: boolean;
  externalBotId?: string;
  tenantId?: string;
  routeKey?: string;
  directorySourceId?: string;
};
```

说明：

1. bot 继续保留库级上限权限
2. 外部用户目录来源按 channel binding 绑定
3. 一个渠道绑定最多引用一个目录源

### 2. Channel Directory Source

```ts
type ChannelDirectorySource = {
  id: string;
  botId: string;
  channel: "wecom" | "teams" | "qq" | "feishu";
  routeKey?: string;
  tenantId?: string;
  externalBotId?: string;
  enabled: boolean;
  sourceType: "http-json";
  request: {
    url: string;
    method: "GET" | "POST";
    headers: Array<{ key: string; value: string; secret: boolean }>;
    bodyTemplate?: string;
    timeoutMs?: number;
  };
  fieldMapping: {
    userIdField: string;
    userNameField: string;
    groupIdField: string;
    groupNameField: string;
    membershipUserIdField: string;
    membershipGroupIdField: string;
  };
  responseMapping: {
    usersPath: string;
    groupsPath: string;
    membershipsPath: string;
  };
  sync: {
    mode: "manual" | "interval";
    intervalMinutes?: number;
  };
  lastSyncAt?: string;
  lastSyncStatus?: "idle" | "success" | "error";
  lastSyncMessage?: string;
  updatedAt: string;
};
```

### 3. Channel Directory Snapshot

```ts
type ChannelDirectorySnapshot = {
  sourceId: string;
  updatedAt: string;
  users: Array<{
    externalUserId: string;
    displayName: string;
    raw?: Record<string, unknown>;
  }>;
  groups: Array<{
    externalGroupId: string;
    displayName: string;
    raw?: Record<string, unknown>;
  }>;
  memberships: Array<{
    externalUserId: string;
    externalGroupId: string;
  }>;
};
```

### 4. User/Group Access Policy

```ts
type ChannelUserAccessPolicy = {
  id: string;
  sourceId: string;
  subjectType: "user" | "group";
  subjectId: string;
  visibleLibraryKeys: string[];
  updatedAt: string;
  updatedBy: string;
};
```

### 5. Resolved Access Context

```ts
type ResolvedChannelAccess = {
  botId: string;
  channel: "wecom" | "teams" | "qq" | "feishu";
  senderId: string;
  matchedUserId: string;
  matchedGroupIds: string[];
  botVisibleLibraryKeys: string[];
  assignedLibraryKeys: string[];
  effectiveVisibleLibraryKeys: string[];
  source: "bot-only" | "external-user-mapping";
  denyReason?: "directory_user_not_found" | "no_assignment";
};
```

## Storage Design

### New Files

```text
storage/config/channel-directory-sources.json
storage/config/channel-user-access-policies.json
storage/config/channel-directory-cache/<sourceId>.json
storage/config/channel-directory-sync-status.json
```

### Rationale

1. `sources` 是控制面配置
2. `cache` 是外部目录快照
3. `policies` 是按人/组的授权
4. `sync-status` 是运维可观测状态

这样后续如果迁到数据库，也能按职责平移，不用二次拆分。

## Permission Resolution Rules

第一版固定规则如下：

1. 先计算 bot 上限可见库
2. 如果当前请求没有启用 `directorySourceId`，按现有 bot 规则工作
3. 如果启用了目录映射：
   - 用 `senderId` 匹配外部用户
   - 根据 membership 找出所属组
   - 用户授权库和组授权库做并集
   - 最终结果与 bot 上限做交集
4. 若目录启用但用户未命中或没有任何授权：
   - `effectiveVisibleLibraryKeys = []`
   - 回答时返回安全提示，不进入库内召回

### Effective Access Formula

```text
botUpperBound = bot-visible-libraries
subjectAssigned = userLibraries ∪ groupLibraries
effective = botUpperBound ∩ subjectAssigned
```

## External Directory Sync Contract

第一版先支持通用 HTTP JSON，不直接绑定某个厂商 SDK。

### Expected Response Example

```json
{
  "users": [
    { "id": "zhangsan", "name": "张三" },
    { "id": "lisi", "name": "李四" }
  ],
  "groups": [
    { "id": "risk-team", "name": "风险组" },
    { "id": "ops-team", "name": "运营组" }
  ],
  "memberships": [
    { "userId": "zhangsan", "groupId": "risk-team" },
    { "userId": "lisi", "groupId": "ops-team" }
  ]
}
```

### Why HTTP JSON First

1. 最小实现成本低
2. 方便对接企业内部现有账号/组织接口
3. 不把第一版绑定死在某个第三方平台 SDK

后续再按需要新增：

1. wecom-contact-api
2. teams-graph-api
3. datasource-table

## Backend Design

### New Modules

新增：

```text
apps/api/src/lib/channel-directory-sources.ts
apps/api/src/lib/channel-directory-sync.ts
apps/api/src/lib/channel-user-access-policies.ts
apps/api/src/lib/channel-access-resolver.ts
```

职责分别是：

1. `channel-directory-sources.ts`
   - 管理目录源配置
   - 解析 bot/channel/source 对应关系

2. `channel-directory-sync.ts`
   - 拉取外部目录接口
   - 映射 users / groups / memberships
   - 写入缓存和同步状态

3. `channel-user-access-policies.ts`
   - 读写用户/组授权
   - 查询 subject 级文档库权限

4. `channel-access-resolver.ts`
   - 输入 bot + channel + senderId
   - 输出 `ResolvedChannelAccess`
   - 统一封装 deny-by-default 逻辑

### Existing Module Changes

#### `bot-definitions.ts`

扩展 `BotChannelBinding`：

1. 新增 `directorySourceId`
2. `buildPublicBotSummary` / manage 接口里返回映射摘要

#### `channel-ingress.ts`

在 `resolveBotForChannel()` 之后新增：

1. `resolveChannelAccessContext()`
2. 把 `effectiveVisibleLibraryKeys` 作为请求上下文带进聊天主链

#### `knowledge-chat-dispatch.ts`

当前只传 `botDefinition.visibleLibraryKeys` 还不够。

需要改成优先接收：

```ts
{
  botDefinition,
  effectiveVisibleLibraryKeys,
  accessContext,
}
```

#### `knowledge-supply.ts`

新增可选输入：

```ts
effectiveVisibleLibraryKeys?: string[]
```

并以此覆盖当前单纯依赖 bot 的库过滤。

#### `openclaw-memory-selection.ts`

这是本方案最关键的安全改动之一。

需要新增：

```ts
selectOpenClawMemoryDocumentCandidates({
  requestText,
  libraries,
  limit,
  botId,
  effectiveVisibleLibraryKeys,
  forceGlobalState,
})
```

规则：

1. 普通 bot 仍可走 per-bot state
2. 启用了 external user mapping 的请求，优先从全局 memory state 按 `effectiveVisibleLibraryKeys` 过滤

否则同一个 bot 的 memory 目录会提前看到不属于当前用户的文档候选。

## API Design

### 1. Source Config

```text
GET    /api/bots/:id/channel-directory-sources
POST   /api/bots/:id/channel-directory-sources
PATCH  /api/bots/:id/channel-directory-sources/:sourceId
POST   /api/bots/:id/channel-directory-sources/:sourceId/sync
```

返回内容应包含：

1. source 基本配置
2. 最近同步状态
3. users / groups 数量

### 2. Directory Subjects

```text
GET /api/bots/:id/channel-directory-sources/:sourceId/subjects?type=user|group&query=...
GET /api/bots/:id/channel-directory-sources/:sourceId/subjects/:subjectType/:subjectId
```

用于：

1. 搜索用户
2. 搜索组
3. 打开单个用户或组的详情与授权面板

### 3. Access Policies

```text
GET   /api/bots/:id/channel-directory-sources/:sourceId/access-policies
PATCH /api/bots/:id/channel-directory-sources/:sourceId/access-policies
```

第一版 `PATCH` 支持批量 upsert：

```json
{
  "items": [
    {
      "subjectType": "user",
      "subjectId": "zhangsan",
      "visibleLibraryKeys": ["合同库", "新世界IOA"]
    },
    {
      "subjectType": "group",
      "subjectId": "risk-team",
      "visibleLibraryKeys": ["投标库", "合同库"]
    }
  ]
}
```

### 4. Access Preview

```text
POST /api/bots/:id/channel-directory-sources/:sourceId/access-preview
```

输入：

```json
{
  "senderId": "zhangsan"
}
```

返回：

```json
{
  "matchedUserId": "zhangsan",
  "matchedGroupIds": ["risk-team"],
  "botVisibleLibraryKeys": ["合同库", "投标库", "新世界IOA"],
  "assignedLibraryKeys": ["合同库", "新世界IOA"],
  "effectiveVisibleLibraryKeys": ["合同库", "新世界IOA"]
}
```

这个接口很重要，因为它能让管理员在 UI 上直接验证某个用户最终能看到哪些库。

## UI Design

### Bot Config Layer

在现有 [BotConfigPanel.js](C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/web/app/components/BotConfigPanel.js) 上新增一块：

`外部用户映射`

每个渠道绑定下新增：

1. 开关：是否启用外部用户映射
2. 选择或新建目录源
3. 目录同步状态
4. “立即同步”按钮
5. “管理用户权限”入口

### Subject Access UI

新增一个单独面板，不塞进 bot 编辑器正文里：

```text
外部用户权限管理
  - 左侧：用户 / 组列表、搜索、筛选
  - 中间：当前主体信息、所属组
  - 右侧：文档库多选授权 + 最终权限预览
```

理由：

1. “按人 / 组配置库权限”天然是列表工作流
2. 直接塞进 bot 配置页会很快变成复杂编辑器
3. 单独面板可以支持搜索、预览、批量授权

### UI Rules

1. bot 上限库仍在 bot 配置页展示
2. 用户/组授权页只允许配置 bot 上限范围内的库
3. 页面上显式展示：
   - bot 上限
   - 用户直接授权
   - 组授权
   - 最终生效库

## Rollout Plan

### Phase A: Storage and Sync

目标：

1. 能保存目录源
2. 能同步 users/groups/memberships
3. 能保存用户/组授权

**Files**

- Add: `apps/api/src/lib/channel-directory-sources.ts`
- Add: `apps/api/src/lib/channel-directory-sync.ts`
- Add: `apps/api/src/lib/channel-user-access-policies.ts`
- Add: `apps/api/src/routes/channel-directory.ts`
- Test: `apps/api/test/channel-directory-sync.test.ts`
- Test: `apps/api/test/channel-user-access-policies.test.ts`

### Phase B: Runtime Access Enforcement

目标：

1. 第三方消息入口根据 `senderId` 真实算出最终可见库
2. memory-first 和 live retrieval 都使用同一套 effective scope

**Files**

- Add: `apps/api/src/lib/channel-access-resolver.ts`
- Modify: `apps/api/src/lib/channel-ingress.ts`
- Modify: `apps/api/src/lib/openclaw-memory-selection.ts`
- Modify: `apps/api/src/lib/knowledge-chat-dispatch.ts`
- Modify: `apps/api/src/lib/knowledge-supply.ts`
- Test: `apps/api/test/channel-access-resolver.test.ts`
- Test: `apps/api/test/channel-ingress-access.test.ts`
- Test: `apps/api/test/knowledge-supply-external-access.test.ts`

### Phase C: UI and Admin Flow

目标：

1. 管理员可配置目录源
2. 可同步外部目录
3. 可按用户/按组配置文档库授权
4. 可预览某用户的最终权限

**Files**

- Modify: `apps/web/app/components/BotConfigPanel.js`
- Add: `apps/web/app/components/ExternalUserAccessPanel.js`
- Add: `apps/web/app/components/ExternalDirectorySourceCard.js`
- Modify: `apps/web/app/home-api.js`
- Test: `apps/web/app/reports/page.js`
- Build verify: `corepack pnpm --filter web build`

### Phase D: Pilot

第一批只建议试点：

1. 渠道：企业微信
2. bot：一个共享业务机器人
3. 目录源：一个 HTTP JSON 接口
4. 文档库：2 到 5 个真实业务库

试点通过后再扩 Teams / QQ / 飞书。

## Verification Plan

第一版必须覆盖：

1. 同一个 bot，不同 `senderId`，答案可见库不同
2. 用户显式授权覆盖组授权并集场景
3. 未匹配到用户时默认拒绝库内访问
4. bot 上限小于用户授权时，最终仍按 bot 上限收窄
5. memory-first 候选不会漏出当前用户无权限库
6. 同步失败时旧快照可继续读，但 UI 显示同步失败状态

建议最小验证命令：

```powershell
corepack pnpm --filter api exec tsx --test test/channel-directory-sync.test.ts test/channel-user-access-policies.test.ts test/channel-access-resolver.test.ts test/channel-ingress-access.test.ts test/knowledge-supply-external-access.test.ts
corepack pnpm --filter api build
corepack pnpm --filter web build
```

## Risks

1. 外部用户表字段不稳定，导致同步映射失败
2. 组成员关系变更后，权限存在同步延迟
3. `senderId` 在不同渠道口径不一致
4. 共享 bot 的 memory-first 过滤如果没改完整，会造成真实越权
5. UI 容易膨胀成复杂权限编辑器

## Recommendation

建议按这个顺序推进：

1. 先做 `channel directory source + sync + policy` 三件套
2. 先把运行时 effective access 算出来
3. 再把它接进 memory-first 与 live retrieval
4. 最后补 UI

不要反过来先做一个复杂授权界面，再去补后端真实过滤。
