# Library Knowledge Pages Design

## Goal

在现有“解析结果 + memory-first + 实时供料”主链上，增加一层适合文本型知识库的持久知识页。

这层不是要替代现有解析、证据块、向量、记忆目录，而是补足两类能力：

1. 把跨文档的规范、主题、实体、结论提前编译出来。
2. 让问答先读这层知识页，再回到原文证据和结构化结果。

这次只做 3 件事：

1. 库级知识页
2. ingest 后自动更新知识页
3. 问答优先读知识页

不做：

1. 全量 Obsidian/wiki 化重构
2. 用 markdown wiki 替代结构化解析
3. 只靠 `index.md` 检索，退回轻量 markdown 搜索方案
4. 定期 lint/health-check 自动任务

## Why This Fits Our System

当前系统已经具备三层基础：

1. 原始资料层
   - 文档上传、入库、分层解析
   - 入口在 `document-knowledge-lifecycle.ts`
2. 编译知识层
   - `structuredProfile`
   - `evidenceChunks`
   - `memory catalog`
   - 知识库级解析治理
3. 调用层
   - `memory-first`
   - 实时供料
   - 机器人和报表复用同一知识资产底座

Karpathy 的 gist 对我们最有价值的点，是在“原始资料”和“问答”之间再补一层“持续维护的中间知识层”。

但我们不适合照搬整套个人 wiki 方案。原因是：

1. 我们已经有结构化解析、证据块、表格记录行、运营洞察，markdown wiki 不该替代这些。
2. 我们的重点不是个人笔记体验，而是企业资料解析、问答、报表和 bot。
3. 我们已经有向量召回和规则召回，不该退回成只靠 `index.md`。

因此，合适的落点是：

`raw documents -> structured parsing + memory -> library knowledge pages -> QA/report supply`

## Scope

第一版只覆盖文本型知识库，优先顺序：

1. `xinshijie-ioa`
2. 企业规范/流程类技术文档
3. 合同制度/制度说明
4. 技术方案/产品说明

不优先覆盖：

1. 订单/库存表格库
2. 简历库
3. 纯报表型/数值型资料

原因：

1. 这类资料已经更适合 `structuredProfile + recordRows + recordInsights`
2. 知识页对“规范、流程、主题、实体”更有帮助，对纯数值表帮助有限

## Knowledge Page Model

每个知识库新增一套机器维护的知识页，建议目录：

```text
memory/library-pages/
  <libraryKey>/
    overview.md
    topics/
      <topic-slug>.md
    entities/
      <entity-slug>.md
    contradictions.md
    updates.md
```

### 1. overview.md

用途：

1. 该库的总体说明
2. 当前覆盖的主要主题
3. 适合回答的问题类型
4. 关键术语表
5. 最近重要更新

适合：

1. `新世界IOA` 这类流程规范库
2. 技术方案库
3. 企业制度库

### 2. topics/*.md

每页一个主题，比如：

1. `ioa-login`
2. `budget-adjustment`
3. `approval-routing`
4. `contract-payment-rules`

内容应包含：

1. 主题定义
2. 适用范围
3. 操作入口或规则点
4. 关键步骤/限制
5. 来源文档与证据链接

### 3. entities/*.md

适合沉淀：

1. 系统名
2. 流程名
3. 部门/角色
4. 外部平台
5. 产品/模块

不是所有库都要强行做实体页。只有当实体反复出现时才建。

### 4. contradictions.md

第一版不做主动 lint，但可以预留这个文件。当前只在 ingest 时发现明显冲突时才附一条记录。

### 5. updates.md

记录最近一次 ingest 对知识页造成的变动：

1. 新增了哪些主题
2. 更新了哪些主题
3. 哪些实体页被改动
4. 是否发现冲突

## Source of Truth

知识页不是原始事实源，事实源仍然是：

1. 原始文档
2. `structuredProfile`
3. `evidenceChunks`

知识页只是更适合问答的编译层。

因此知识页必须带回指信息：

1. `sourceDocumentIds`
2. `sourceTitles`
3. `keyEvidenceChunkIds`
4. `updatedAt`

第一版可以先放到 frontmatter 或简单的 markdown 区块中，不需要单独数据库。

## Ingest Update Flow

当前 ingest 主链已在 `document-knowledge-lifecycle.ts` 收口。

第一版在详细解析成功后追加一个库级知识页更新步骤：

```text
document parsed (detailed)
  -> memory sync
  -> vector sync
  -> library knowledge page sync
```

### Update Strategy

不建议每次全库重写。第一版采用“增量候选 + 局部更新”：

1. 找出当前文档所属知识库
2. 只处理配置为 `knowledgePagesEnabled=true` 的库
3. 从当前文档抽：
   - 主题候选
   - 实体候选
   - 关键结论
   - 操作步骤/约束
4. 更新：
   - `overview.md`
   - 命中的若干 `topics/*.md`
   - 少量必要的 `entities/*.md`
   - `updates.md`

### Candidate Extraction Inputs

直接复用现有结果，不另起一套解析：

1. `summary`
2. `structuredProfile`
3. `focusedFields`
4. `fieldTemplate`
5. `evidenceChunks`
6. `claims`
7. `recordInsights`，只在文本型 mixed 文档里少量使用

### Sync Triggers

第一版只在这两类动作后触发：

1. 新文档详细解析成功
2. 手工保存“编辑解析结果”成功

不做：

1. 上传后 quick parse 就生成知识页
2. 周期性全库 lint

## QA Read Order

当前问答是：

1. memory-first 选文
2. 实时供料

第一版改成：

1. memory-first 选库/选文
2. 若目标库启用了知识页，先读：
   - `overview.md`
   - 命中的 `topics/*.md`
   - 命中的 `entities/*.md`
3. 再补：
   - 原文 `evidenceChunks`
   - `structuredProfile`
   - `focusedFields`
4. 最后回答

也就是：

`memory -> library pages -> raw evidence`

这仍然是 memory-first，不会把知识页变成唯一来源。

## Retrieval Strategy

第一版不做新的独立检索系统。

建议复用现有召回链，只增加一层库级知识页命中：

1. 先由当前 memory-first 逻辑判断命中哪个知识库
2. 再在对应库目录下做简单的本地文本匹配：
   - `overview.md`
   - `topics/*.md`
   - `entities/*.md`
3. 按标题、主题名、实体名、别名做轻量打分

原因：

1. 第一版规模小，没必要给知识页单独建向量索引
2. 我们已有文档级向量和规则召回，知识页只需补“综合知识”层

后面如果知识页规模增大，再考虑单独索引。

## Governance

建议在知识库治理里新增一个轻量开关，而不是默认全开：

```ts
knowledgePages: {
  enabled: boolean;
  mode: "none" | "overview" | "topics";
}
```

含义：

1. `none`
   - 不生成知识页
2. `overview`
   - 只维护 `overview.md` 和 `updates.md`
3. `topics`
   - 维护 `overview + topics + entities`

第一版推荐：

1. `xinshijie-ioa` = `topics`
2. 合同规范/流程库 = `overview`
3. 简历库/订单表格库 = `none`

## UI Impact

第一版只做轻量可见，不做复杂编辑器。

### 文档中心

在知识库设置里新增：

1. 是否启用知识页
2. 知识页模式

### 知识页查看

不需要单独新产品页，先在文档中心或知识库详情里增加：

1. 查看 `overview`
2. 查看主题页列表
3. 查看最近更新

### 问答

不新增特殊入口。
只是在系统上下文里明确：

1. 命中文本型规范库时优先读知识页
2. 知识页是编译层，不是最终事实源

## What We Intentionally Do Not Do

这几件先不做：

1. 自动生成整套 wiki graph
2. 全量实体抽取和实体链接
3. 周期性 lint
4. 复杂 frontmatter 规范
5. 单独的知识页编辑器
6. 把问答结果自动写回知识页

第 6 点不是没价值，而是现在容易过度自动化。第一版仍以 ingest 驱动为主，问答反写后面再做。

## Implementation Order

### Phase 1

1. 在知识库治理里加 `knowledgePages.enabled/mode`
2. 增加库级知识页目录和读写器
3. 实现 `overview.md` 和 `updates.md` 生成
4. 在 `xinshijie-ioa` 上试运行

### Phase 2

1. 增加 `topics/*.md`
2. 文档详细解析成功后局部更新主题页
3. 问答供料优先读 `overview + topics`

### Phase 3

1. 只在需要的库上加 `entities/*.md`
2. 再考虑问答结果反写

## Recommended First Target

第一批只拿 `新世界IOA` 做：

1. `overview.md`
2. 若干主题页
3. 问答优先读知识页

原因：

1. 这类企业规范文档跨文档综合价值高
2. 适合沉淀“入口、步骤、审批、范围、注意事项”
3. 已经有真实资料和本地测试库

## Success Criteria

成功标准不是“生成了 markdown 文件”，而是：

1. `新世界IOA` 库的问题，回答更稳定
2. 同一问题不再每次都从原文零开始拼
3. 文档新增后，相关主题页会被持续更新
4. 仍然保留原文证据回指，不把知识页当成唯一真相
