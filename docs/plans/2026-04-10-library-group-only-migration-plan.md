# 数据中心去层级化迁移方案

Date: 2026-04-10

## 目标

把当前文档体系从多层分类模型迁移为单一运营分组模型：

- 最终只保留一层可见的运营归类：`知识库分组`
- 去掉一级业务分类：`bizCategory`
- 去掉二级专题分类：`customCategories`
- 保留内容解析结果，但不再把它们当成运营分类层

这次迁移的核心不是“换一套分类”，而是把：

- `文档属于哪个库`
- `这个库默认怎么供料`
- `文档本身解析出来是什么结构`

三件事彻底拆开。

## 最终状态

### 1. 只保留一个运营分组层

最终对用户可见、可编辑、可治理的，只有：

- `知识库分组`

所有文档只回答一个运营问题：

- 这份内容属于哪个知识库分组

不再回答：

- 这份文档属于哪类一级业务分类
- 这份文档属于哪个二级专题分类

### 2. 保留但降级为解析结果的字段

以下字段仍然可以保留，但它们不再承担“分类体系”的职责：

- `schemaType`
- `topicTags`
- `structuredProfile`
- `contentHints`

它们的角色是：

- 帮助供料
- 帮助检索
- 帮助报表生成
- 帮助模型理解内容结构

而不是用于页面上的分类治理。

### 3. `库类型`是库配置，不是文档分类

如果继续保留之前讨论的：

- `document`
- `data`

那么它只能作为知识库配置项存在，用来决定默认供料优先级。

它不是第二层分类，也不是文档标签。

换句话说：

- 文档只进某个库
- 库可以有自己的供料策略
- 但系统不再维护另一棵“文档分类树”

## 为什么要迁移

当前系统实际上有三套容易混淆的结构：

1. 一级业务分类：`bizCategory`
2. 二级专题分类：`customCategories`
3. 知识库分组：`document libraries`

这带来几个问题：

### 问题 1：同一份文档被重复归类

一份内容可能同时有：

- `bizCategory = order`
- `schemaType = order`
- `library = order`

三者语义重叠，但又不完全一致，导致理解和维护成本高。

### 问题 2：默认库是从分类反推出来的

当前默认库不是纯粹的知识库概念，而是从 `bizCategory` 派生出来的：

- `paper`
- `contract`
- `daily`
- `invoice`
- `order`
- `service`
- `inventory`

这让“库”和“分类”纠缠在一起，导致后续很难把库做成真正独立的运营面。

### 问题 3：很多运行时逻辑被业务分类绑死

当前多个模块都依赖：

- `bizCategory`
- `confirmedBizCategory`
- `sourceCategoryKey`

导致后续任何数据中心升级，都得先穿过这层旧逻辑。

### 问题 4：二级专题分类几乎没有真正运营价值

`customCategories` 当前更像临时专题标签，而不是一个稳定的治理层。

这类信息更适合降成：

- `topicTags`
- 单独知识库
- 解析标签

而不是继续保留一整套二级分类配置和接口。

## 当前依赖面

### 分类配置与检测

这些位置仍然定义或读写分类配置：

- `apps/api/src/lib/document-config.ts`
- `storage/config/document-categories.json`
- `apps/api/src/lib/document-parser.ts`
- `apps/api/src/lib/document-route-config-services.ts`
- `apps/api/src/routes/documents.ts`

当前包含：

- `BizCategory`
- `customCategories`
- `detectBizCategoryFromConfig(...)`
- `/documents/classify`
- `/documents/category-suggestions`

### 默认库与分类绑定

这些位置仍然把知识库和分类绑定在一起：

- `apps/api/src/lib/document-libraries.ts`
- `apps/web/app/lib/knowledge-libraries.js`
- `apps/api/src/lib/document-route-read-models.ts`

当前绑定方式是：

- 默认库由 `buildDefaultLibraries(...)` 从分类配置生成
- `documentMatchesLibrary(...)` 用 `(confirmedBizCategory || bizCategory)` 命中默认库
- 默认库带 `sourceCategoryKey`

### 文档治理与反馈

这些位置仍然把分类当成治理动作的一部分：

- `apps/api/src/lib/document-route-document-mutation-services.ts`
- `apps/api/src/lib/document-route-library-group-services.ts`
- `apps/api/src/lib/ingest-feedback.ts`
- `apps/web/app/api/documents/classify/route.js`
- `apps/web/app/api/documents/category-suggestions/route.js`

### 供料、检索和输出

这些位置仍然不同程度依赖 `bizCategory` 做 heuristics：

- `apps/api/src/lib/knowledge-supply.ts`
- `apps/api/src/lib/knowledge-chat-dispatch.ts`
- `apps/api/src/lib/document-retrieval.ts`
- `apps/api/src/lib/document-vector-records.ts`
- `apps/api/src/lib/document-vector-index.ts`
- `apps/api/src/lib/document-matchers.ts`
- `apps/api/src/lib/openclaw-memory-catalog.ts`
- `apps/api/src/lib/knowledge-output.ts`
- `apps/api/src/lib/knowledge-execution.ts`
- `apps/api/src/lib/order-inventory-page-composer.ts`
- `apps/api/src/lib/audit-center.ts`
- `apps/api/src/lib/platform-control.ts`

## 迁移原则

### 原则 1：先拆绑定，再删字段

不要直接删 `bizCategory`。

正确顺序应该是：

1. 先停止新增依赖
2. 再把运行时用途替换掉
3. 最后再删字段和接口

### 原则 2：库是运营面，解析结果是技术面

今后系统里：

- `知识库分组` 是运营面
- `schemaType / topicTags / structuredProfile` 是技术面

两者不混用。

### 原则 3：供料策略可以保留，但不形成新分类树

如果保留 `库类型`，它只能是知识库配置，不能重新长成第二棵分类树。

### 原则 4：迁移必须兼容现有数据

现有文档很多还没有：

- `confirmedGroups`

所以迁移必须提供一轮自动补组，而不是要求人工重新分组。

## 目标结构

### 文档对象

最终文档对象保留的核心运营字段建议是：

```ts
type DocumentRecord = {
  id: string;
  groups: string[];
  confirmedGroups?: string[];
  schemaType?: string;
  topicTags?: string[];
  structuredProfile?: Record<string, unknown>;
};
```

逐步废弃：

```ts
type LegacyFields = {
  bizCategory?: string;
  confirmedBizCategory?: string;
};
```

### 知识库对象

知识库保留：

```ts
type DocumentLibrary = {
  key: string;
  label: string;
  description?: string;
  permissionLevel: number;
  knowledgePagesEnabled?: boolean;
  knowledgePagesMode?: 'none' | 'overview' | 'topics';
  libraryType?: 'document' | 'data';
  createdAt: string;
};
```

逐步废弃：

```ts
type LegacyLibraryFields = {
  isDefault?: boolean;
  sourceCategoryKey?: string;
};
```

## 替代映射

迁移后，不同用途建议这样替换：

### 1. 默认归库

旧：

- `bizCategory -> default library`

新：

- `confirmedGroups`
- 否则 `groups`
- 再否则一次性迁移脚本补到对应库
- 再否则进 `ungrouped`

### 2. 供料优先级

旧：

- `bizCategory` 决定文档倾向

新：

- `libraryType`
- `schemaType`
- `structuredProfile`
- `group scope`

### 3. 专题识别

旧：

- `customCategories`

新：

- `topicTags`
- 或直接新建独立知识库

### 4. 输出 heuristics

旧：

- `bizCategory === order`
- `bizCategory === inventory`

新：

- `library.key`
- `libraryType`
- `schemaType`
- `structuredProfile.kind`

## 分阶段迁移

### Phase 0：冻结旧分类体系

目标：

- 不再扩展 `BizCategory`
- 不再新增 `customCategories`
- 不再新增依赖 `sourceCategoryKey`

动作：

- 文档里声明分类体系进入废弃态
- 新功能禁止继续接入 `bizCategory`

结果：

- 旧逻辑先保持兼容
- 新逻辑不再继续加债

### Phase 1：移除二级专题分类

目标：

- 先拿掉最轻、最少用的一层

动作：

- 下线 `/documents/category-suggestions`
- 删除 `document-route-config-services.ts` 里 `customCategories` 的增补入口
- 从 `document-config.ts` 中移除 `customCategories`
- 把已有专题类逻辑降为：
  - `topicTags`
  - 或单独知识库

影响：

- 用户不再创建“专题二级分类”
- 文档仍可拥有主题标签

### Phase 2：把默认库从分类派生改成真实库定义

目标：

- 让知识库不再从 `BizCategory` 自动长出来

动作：

- 删除 `buildDefaultLibraries(...)`
- 停止在 `document-libraries.ts` 里从分类配置自动生成默认库
- 保留现有库 key 不变，直接把它们写成普通库配置
- 去掉 `DocumentLibrary.sourceCategoryKey`
- 去掉 `DocumentLibrary.isDefault`

影响：

- 库的存在不再依赖分类配置
- 知识库成为唯一分组源

### Phase 3：把文档命中库的规则改成只看 groups

目标：

- 停止 `documentMatchesLibrary(...)` 依赖 `bizCategory`

动作：

- `documentMatchesLibrary(...)` 只看：
  - `confirmedGroups`
  - `groups`
  - `ungrouped`
- 删除 `(confirmedBizCategory || bizCategory)` 参与命中逻辑

配套迁移：

- 写一轮文档补组脚本
- 规则如下：
  - 如果已有 `confirmedGroups`，保持不动
  - 否则如果已有 `groups`，保持不动
  - 否则按历史 `(confirmedBizCategory || bizCategory)` 映射到同 key 库
  - 映射失败则进 `ungrouped`

结果：

- 分组归属脱离业务分类

### Phase 4：把运行时 heuristics 从 bizCategory 迁走

目标：

- 让检索、供料、输出、审计不再依赖 `bizCategory`

替换方向：

- `order / inventory` 这类逻辑优先改看：
  - `library.key`
  - `libraryType`
  - `schemaType`
  - `structuredProfile`

重点文件：

- `knowledge-supply.ts`
- `document-retrieval.ts`
- `document-vector-records.ts`
- `document-vector-index.ts`
- `document-matchers.ts`
- `openclaw-memory-catalog.ts`
- `knowledge-output.ts`
- `knowledge-execution.ts`
- `order-inventory-page-composer.ts`
- `audit-center.ts`

说明：

- 这一阶段工作量最大
- 但它是真正去掉一级分类的关键

### Phase 5：下线人工分类接口和 UI

目标：

- 让用户侧彻底不再看到“文档分类”概念

动作：

- 删除 `/documents/classify`
- 删除前端 `documents/classify` 代理
- 删除文档详情页里的“业务分类”展示
- 文档中心页面只保留：
  - 知识库分组
  - 库类型
  - 解析状态
  - 全文 / 结构信息

结果：

- 前台只剩“库”
- 不再有一级/二级分类界面

### Phase 6：删除 BizCategory 兼容层

目标：

- 完成去层级化收口

动作：

- 删除 `document-config.ts` 里的 `BizCategory`
- 删除 `detectBizCategoryFromConfig(...)`
- 删除 `confirmedBizCategory`
- 从缓存、覆盖配置、类型定义中移除这批字段
- 清理相关测试

前提：

- 只有在 Phase 4 和 Phase 5 结束后才能做

## 数据迁移策略

### 文档补组脚本

需要一轮一次性迁移脚本，把历史文档归组补齐。

建议规则：

1. 如果文档已有 `confirmedGroups`，保持不动
2. 否则如果已有 `groups`，保持不动
3. 否则读取 `(confirmedBizCategory || bizCategory)`
4. 如果存在同 key 库，则把该 key 写入 `groups`
5. 否则写入 `ungrouped`

### 库配置迁移

需要把当前“默认库”固化成显式库配置，避免再从分类配置重建。

### 历史分类信息

历史 `bizCategory` 可以保留一段时间用于回滚，但不再参与运行时决策。

建议：

- 先只读不写
- 再彻底删除

## 风险与缓解

### 风险 1：默认库映射丢失

如果直接删 `sourceCategoryKey`，但没有先给文档补组，就会出现大量文档“失去所属库”。

缓解：

- 先补组
- 再删分类映射

### 风险 2：订单/库存链路行为回退

很多旧 heuristics 还依赖 `bizCategory`。

缓解：

- 在 Phase 4 里逐一替换
- 不要在替换前删字段

### 风险 3：前后端同时改导致接口抖动

缓解：

- 先后端兼容读老字段
- 前端 UI 后移除
- 最后删后端字段

### 风险 4：用户理解“库类型”又变成第二层分类

缓解：

- UI 文案明确：
  - 这是知识库配置
  - 不是文档分类

## 成功标准

这次迁移完成后，应满足：

1. 页面上不再出现一级业务分类和二级专题分类
2. 新建文档只需要确定知识库分组
3. 知识库不再从分类配置自动派生
4. `documentMatchesLibrary(...)` 只看分组
5. 聊天、输出、检索、审计不再依赖 `bizCategory`
6. `schemaType / topicTags / structuredProfile` 继续存在，但只作为解析结果

## 推荐执行顺序

推荐按下面顺序推进，不要跳步：

1. 先冻结旧分类体系
2. 再移除二级专题分类
3. 然后把默认库改成真实库定义
4. 接着完成历史文档补组
5. 再逐步把运行时 heuristics 从 `bizCategory` 迁走
6. 最后下线分类接口、UI 和旧字段

## 推荐下一步

下一步最值当的不是直接删代码，而是先做一版最小落地：

1. 把当前默认库显式固化到 `document-libraries.json`
2. 新增一次性补组脚本
3. 改写 `documentMatchesLibrary(...)`，优先只看组
4. 保持 `bizCategory` 只读兼容

这样能先把“知识库分组”坐实成唯一分组层，再继续清理旧分类体系。
