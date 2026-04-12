# Canonical Markdown + VLM Fallback Design

## Goal

在不打断现有上传、入库和快速问答体验的前提下，把文档解析链收敛成一条更稳定的中期架构：

`quick parse -> canonical markdown -> VLM fallback -> LLM structuring -> chunk + embeddings -> knowledge supply`

这次设计的目标不是引入一个新的文档系统，而是把当前分散的多格式抽文逻辑，升级成一条统一的“可供模型消费的 canonical text”流水线。

## Status

Design only.

截至 `2026-04-12`：

1. 仓库内还没有接入 `markitdown`
2. 本地运行环境也未安装 `markitdown` CLI / Python package
3. 当前主链仍以 [document-parser.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/document-parser.ts) 的各格式抽文逻辑为主
4. 图片、扫描件、PPT 视觉增强仍依赖现有 VLM 链
5. 当前系统不支持音频文件解析入库

## Scope

第一版只覆盖：

1. 保留现有 `quick parse`
2. 为文档型文件和音频文件增加一层 canonical markdown provider
3. 把 VLM 收窄成 markdown 失败或明显不足时的兜底增强
4. 让结构化抽取和向量化优先消费统一的 canonical text
5. 兼容当前知识库、报表中心、OpenClaw 供料链

第一版不做：

1. 直接替换现有 PDF/OCR/VLM 主链
2. 视频理解
3. 独立的 MarkItDown 服务化平台
4. 一次性重写所有检索、结构化和向量逻辑
5. 引入第三套独立音频转录引擎

## Guardrails

1. `quick parse` 行为不变
2. 已有高质量 Markdown 的内容直接作为 canonical markdown，不重复转换
3. 表格类文件保留现有 `tableSummary` 和 record insights，不让 Markdown 覆盖结构摘要价值
4. 音频解析遵循“MarkItDown 优先，VLM 兜底，失败则显式失败”的单向规则
5. VLM 只处理真正需要视觉增强或多模态兜底的文档，不回到“中间层默认全量跑视觉”
6. 不引入第二套知识库、第二套状态文件、第二套向量索引
7. OCR 保留，但仅作为 quick parse 和低成本保底能力，不再承担 detailed parse 主路质量目标

## Current State

### 1. 当前不是统一的“文档转 Markdown”系统

当前上传文档的主解析入口是：

- [document-parser.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/document-parser.ts)

这条链的目标是“尽快抽到可用文本”，不是“统一生成标准 Markdown”。

现状大致是：

1. `docx` -> `mammoth.extractRawText()`
2. `pptx/pptm` -> OOXML 文本抽取，失败再 `soffice -> pdf`
3. `xlsx/xls` -> `xlsx` 读取 sheet，再拼成文本块和 `tableSummary`
4. `html/xml` -> 去标签后的纯文本
5. `json` -> pretty-printed JSON 文本
6. `pdf` -> 文本提取 + OCR fallback
7. 图片 -> OCR / VLM 详细增强

也就是说，当前系统真正持久化的是：

- `fullText`
- `parseMethod`
- `tableSummary`
- `structuredProfile`
- `evidenceChunks`

而不是一份格式统一的 canonical Markdown。

### 2. 当前只有部分链路会显式产出 `.md`

真正会落地 Markdown 文件的主要是：

1. 网页采集，见 [web-capture.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/web-capture.ts)
2. 报表中心回写知识库，见 [report-center.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/report-center.ts)

普通上传文档不会统一生成 `.md` 文件。

这里有一个重要事实：

网页采集已经直接产出标准化 Markdown，所以它不需要再额外跑 MarkItDown。

对这类内容，更合理的规则是：

1. 已有 Markdown，直接作为 canonical markdown
2. 不再重复转换

### 3. 当前深解析和向量化也没有统一 canonical text

当前详细解析入口：

- [document-cloud-enrichment.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/document-cloud-enrichment.ts)
- [document-image-vlm-provider.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/document-image-vlm-provider.ts)

当前向量记录入口：

- [document-vector-records.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/document-vector-records.ts)

当前普通聊天对“最新详细解析文档”的供料入口：

- [knowledge-chat-dispatch.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/knowledge-chat-dispatch.ts)

这些模块大多还是直接消费 `fullText`。

### 4. 当前音频文件没有入库解析主链

当前仓库的解析支持列表和支持矩阵里没有音频扩展名：

- [document-parser.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/document-parser.ts)
- [format-support-matrix.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/format-support-matrix.ts)

这意味着：

1. 音频文件即使上传成功，也不会进入可用正文解析主链
2. 也不会得到 `fullText`
3. 更不会进入后续结构化、向量化和供料

### 5. 当前 OCR 仍然在主链里承担过多职责

当前 OCR 相关能力主要还在：

- [document-parser.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/document-parser.ts)
- [runtime-executables.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/runtime-executables.ts)

它们现在承担的是两层角色：

1. quick parse 的本地正文兜底
2. 某些图片/PDF 的实际正文来源

问题不在于 OCR 没价值，而在于它现在在部分链路里仍然接近“主详细文本来源”，这会抬高结构化抽取和供料漂移。

## Problem Statement

当前方案的主要问题不是“解析不到文本”，而是“不同格式出来的是不同形态的文本”，导致后面的模型结构化、向量化和供料质量不稳定。

具体表现：

1. `docx`、`pptx`、`xlsx`、`html` 的输出风格差异很大
2. 表格、标题、层级、列表在很多格式里被压平成普通文本
3. 结构化抽取和 evidence 切块实际是在吃“杂文本”
4. VLM 现在承担了过多“把文本重新整理成人能用材料”的职责
5. 音频资料目前完全不在解析体系内
6. OCR 在部分文档里仍然承担了超出“低成本保底”定位的职责

这会带来两个直接问题：

1. 结构化抽取提示词需要适配过多输入形态
2. 同一类文件在问答、静态页、报表里会表现出明显漂移
3. 音频类数据集没有进入知识系统的统一正文链
4. OCR 结果会把一些强视觉文档拉回到低质量文本主路

## Options

### Option A: 直接用 MarkItDown 替换当前主解析

做法：

1. 在 [document-parser.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/document-parser.ts) 里直接把现有 `docx/pptx/xlsx/html` 分支替换成 MarkItDown
2. `quick parse` 和 `detailed parse` 都统一走它

优点：

1. 实现路径短
2. 理论上更快统一格式

缺点：

1. 风险太高，直接影响入库首帧
2. 一旦本地 Python 或 MarkItDown 不可用，主链就被打断
3. PDF、扫描件和视觉型文档并不会因此变稳

结论：

不推荐。

### Option B: 把 MarkItDown 放在 quick parse 前面

做法：

1. 上传后先跑 MarkItDown
2. 失败时再回退到当前 quick parse

优点：

1. 有机会让更多文档首帧就拿到 Markdown

缺点：

1. 首帧延迟会上升
2. CLI/Python runtime 不稳定会直接影响上传体验
3. 违反“quick parse 保持不变”的约束

结论：

不推荐。

### Option C: 保持 quick parse，增加 canonical markdown 层，再由 VLM 兜底

做法：

1. `quick parse` 继续走当前实现
2. `detailed parse` 对支持格式优先跑 MarkItDown，拿 canonical markdown
3. 如果没有现成 Markdown，则对支持格式优先跑 MarkItDown
4. MarkItDown 失败、结果太差或类型不支持时，再走 VLM
5. 音频文件优先尝试转 Markdown，失败再走 VLM
6. 结构化抽取、evidence、embedding 优先吃 canonical text

优点：

1. 不影响上传首帧
2. 供料形态更统一
3. 网页采集正文不需要重复处理
4. VLM 角色收窄为真正兜底增强
5. 音频文件也能进入同一条 canonical text 主链
6. 路由规则简单，系统复杂度最低

缺点：

1. 需要补一层 provider 和状态字段
2. 需要调整消费入口，让它优先读 canonical text
3. 需要补音频支持矩阵和失败显示

结论：

这是推荐方案。

## Recommended Architecture

推荐架构：

```text
upload / datasource ingest
  -> quick parse (existing)
  -> detailed parse pipeline
    -> use existing markdown when present
    -> otherwise canonical markdown pass (MarkItDown when supported)
    -> otherwise VLM fallback / enrichment
    -> LLM structuring
  -> evidence / vector sync
  -> knowledge supply
```

高层原则：

1. `quick parse` 只负责快和稳
2. 已有 Markdown 的内容直接进入 canonical text 主路
3. 没有 Markdown 时，MarkItDown 是 detailed parse 的默认优先方案
4. `VLM` 只负责 MarkItDown 失败或类型不支持时的兜底，也承担音频在无文本转录结果时的最后一层多模态兜底
5. `LLM structuring` 负责把 canonical text 转成结构化对象
6. `chunk + embeddings` 也基于 canonical text 进行

这里还需要明确 OCR 的新定位：

1. OCR 保留在 quick parse
2. OCR 保留为本地低成本 fallback
3. OCR 不再被视为 detailed parse 主路质量来源

## Key Decisions

### Decision 1: 不持久化第二份“canonicalText”，而是持久化 Markdown 并在运行时解析 canonical text

推荐新增字段到 [ParsedDocument](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/document-parser.ts)：

```ts
markdownText?: string;
markdownMethod?: string;
markdownGeneratedAt?: string;
markdownError?: string;
```

不建议再持久化一份 `canonicalText`，避免文本重复和状态分叉。

统一由一个 resolver 负责：

```ts
resolveCanonicalDocumentText(item) =
  item.markdownText
  || item.fullText
  || ''
```

理由：

1. `markdownText` 是统一的高质量正文层，也包括网页采集原生生成的 Markdown
2. `fullText` 继续作为兼容字段保留
3. VLM 失败时仍然能回退到旧链

### Decision 2: detailed parse 采用“existing markdown > MarkItDown > VLM > failed”

这条优先级是整套方案的核心：

1. 若文件或来源已经有高质量 Markdown，直接用它
2. 否则若 MarkItDown 支持该类型，优先用 MarkItDown
3. 否则或执行失败时，走 VLM
4. VLM 仍失败，则显式记为解析失败

这意味着：

1. [document-parser.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/document-parser.ts) 的 `quick` 阶段不变
2. 详细解析队列消费时，先判断是否已有 Markdown
3. 没有时，再触发 MarkItDown provider
4. `detailParseStatus` 仍作为主状态机，不再新增第二套状态机

Phase 1 兼容护栏：

1. 对当前系统已经能稳定抽出正文的文本型格式，若 MarkItDown 在运行时缺失或执行失败，先继续沿用旧提取结果，避免现网详细解析整片退化
2. 音频不走这条兼容护栏；音频若没有转写 Markdown，就按失败处理
3. 等 10/120 节点把 MarkItDown 运行时装齐后，再把这层兼容护栏收紧

### Decision 3: VLM 不再是“第二层默认解析器”，而是 markdown 失败后的兜底

VLM 触发条件建议收窄为：

1. 文件没有现成 Markdown
2. MarkItDown 不支持该格式
3. MarkItDown 执行失败
4. markdown 输出过短或明显失真
5. 文档本身为强视觉资料
6. 音频文件需要转录，但 MarkItDown 音频转 Markdown 未成功

这会让当前图片/PPT/PDF 视觉链的位置更合理：

- 不是默认中间层
- 而是专门处理文字链无法稳定覆盖的内容

音频在这套设计里也遵循同样规则：

- 能用 MarkItDown 拿到转录 Markdown，就不走 VLM
- 拿不到时，允许走 OpenClaw/多模态模型兜底
- 再失败则显式记为解析失败

### Decision 4: 表格类资料保留当前结构摘要，不让 Markdown 吃掉 `tableSummary`

对于：

1. `xlsx`
2. `xls`
3. `csv`

即使引入 MarkItDown，也必须保留现有：

- `tableSummary`
- `recordInsights`
- schema hints

原因是这些廉价、稳定，而且对数据型资料价值很高。

第一版目标不是“Markdown 替代一切”，而是：

- Markdown 成为文档型材料的 canonical text
- `tableSummary` 继续成为数据型材料的重要结构信号

### Decision 5: OCR 降级为 quick parse 和 degraded mode，不再承担 detailed parse 主路

OCR 不删除，但定位要下调：

1. 继续保留在上传首帧和本地快速抽文
2. 在 VLM / MarkItDown 不可用时，作为廉价保底
3. 不再把 OCR 结果视为 detailed parse 的优先正文来源

这意味着：

1. 视觉型 PDF/PPT/图片在 detailed parse 中，优先级应是 `MarkItDown / VLM > OCR`
2. OCR 的价值主要变成“可用性”和“低成本”，不是“高质量”

## File Routing

### 第一版推荐路由

| 文件类型 | quick parse | detailed parse canonical markdown | VLM | 说明 |
|---|---|---|---|---|
| `.md` / 网页采集正文 | 现有文本读取或原生生成 | 直接使用 | 否 | 已有 Markdown 直接作为 canonical markdown |
| `docx` | 现有 `mammoth raw text` | 是 | 否 | Markdown 应成为主详细文本 |
| `pptx/pptm` | 现有 OOXML / fallback | 是 | 条件触发 | 图片重、版式重时 VLM 兜底 |
| `xlsx/xls` | 现有 sheet reader + tableSummary | 是 | 否 | 保留 tableSummary，Markdown 作为补充正文 |
| `html/htm/xml` | 现有 strip tags | 是 | 否 | Markdown 应替代去标签文本 |
| `epub` | 现无稳定主链 | 是 | 否 | 第一版新增收益较大 |
| `pdf` | 现有文本抽取 + OCR | 是 | 条件触发 | MarkItDown 优先，OCR 仅保底 |
| 图片 | OCR / 元数据 | 否 | 是 | OCR 保留首帧，视觉理解仍以 VLM 为主 |
| `wav/mp3` | 现无主链 | 是 | 条件触发 | MarkItDown 优先，失败则 VLM 兜底 |
| 其他音频 | 现无主链 | 否 | 条件触发 | 仅在运行时明确支持时尝试，否则直接失败 |

## Proposed New Modules

### 1. 新增 Markdown provider

建议新增：

- [document-markdown-provider.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/document-markdown-provider.ts)

职责：

1. 判断文件是否适合 MarkItDown
2. 调本地 CLI 或 Python module
3. 返回：
   - `markdownText`
   - `markdownMethod`
   - `markdownGeneratedAt`
   - `error`

不要让它负责：

1. 分组
2. schema 判断
3. 结构化抽取
4. 向量写入

### 2. 新增 canonical text resolver

建议新增：

- [document-canonical-text.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/document-canonical-text.ts)

职责：

1. 统一解析“当前该给模型哪份文本”
2. 屏蔽 `markdownText/fullText` 的分支差异
3. 提供：
   - `resolveCanonicalDocumentText(item)`
   - `resolveCanonicalDocumentExcerpt(item, maxChars)`
   - `isCanonicalMarkdownPreferred(item)`

这样消费层只改一次入口，不需要四处散写 `markdownText || fullText`。

### 3. 新增音频扩展名和兜底策略判断

建议在：

- [document-parser.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/document-parser.ts)
- [format-support-matrix.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/format-support-matrix.ts)

补：

1. `DOCUMENT_AUDIO_EXTENSIONS`
2. 音频支持矩阵说明
3. “MarkItDown 是否支持当前音频类型”
4. “是否允许转到 VLM 兜底”

## Queue and State Integration

这套方案不能绕开现有详细解析状态机，必须直接接到当前队列和持久化模型。

### 1. 详细解析队列继续复用

当前详细解析队列在：

- [document-deep-parse-queue.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/document-deep-parse-queue.ts)

它已经负责：

1. 排队
2. processing / succeeded / failed
3. attempt 计数
4. 成功后触发向量更新和 memory sync

推荐做法：

1. 不新增第二条 markdown 队列
2. `MarkItDown -> VLM -> structuring` 全部作为同一次 detailed parse 批处理的一部分
3. `detailParseStatus` 仍然是唯一主状态

### 2. 新字段必须进入 store normalization

当前文档归一化入口在：

- [document-store-normalization.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/document-store-normalization.ts)

新增的：

1. `markdownText`
2. `markdownMethod`
3. `markdownGeneratedAt`
4. `markdownError`

都必须在这里做兼容归一化。

否则：

1. cache 回读会丢字段
2. retained documents 合并时会不一致
3. 旧文档和新文档的读模型会出现分叉

### 3. 读模型要让新状态可见

当前文档读模型在：

- [document-route-read-models.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/document-route-read-models.ts)

建议把这些字段纳入只读输出：

1. `markdownMethod`
2. `markdownGeneratedAt`
3. `markdownError`
4. `canonicalSource`

其中 `canonicalSource` 不一定落盘，可以由读模型即时推断：

- `markdown`
- `web-markdown`
- `fullText`
- `vlm`
- `none`

这样数据集详情、审计、运维盘点时能明确看到当前正文到底来自哪一层。

## Migration and Backfill

### 1. 现有文档需要回填，不然新链只对新上传文件生效

当前系统里大量旧文档已经有：

- `fullText`
- `detailParseStatus`
- `structuredProfile`

但没有 `markdownText`。

所以需要一个补跑策略：

1. 找出 `detailParseStatus = succeeded` 但 `markdownText` 缺失的支持格式文档
2. 重新 enqueue detailed parse
3. 保留旧的 `fullText`
4. 仅补充 markdown 和后续结构化更新

### 2. 回填不应一次性全量打满

推荐按优先级补跑：

1. `uploads/` 下的最近文档
2. 文档型知识库
3. 热门问答命中的文档
4. 最后再扫存量

这样不会把 10/120 当前机器的 detailed parse 队列直接打爆。

## Consumer Order With Existing System

### 1. 普通聊天

当前普通聊天的最新全文供料在：

- [knowledge-chat-dispatch.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/knowledge-chat-dispatch.ts)

建议改成：

1. 优先 `markdownText`
2. 其次 `fullText`
3. 若是图片/音频的 VLM 结果覆盖正文，则取多模态转录正文

网页采集正文也走同一条规则，但它通常会直接命中 `markdownText`，不需要再次转换。

### 2. Cloud enrichment

当前结构化抽取 prompt 主要吃 `fullText`，在：

- [document-cloud-enrichment.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/document-cloud-enrichment.ts)

这里必须切成 canonical text 优先，否则前面统一正文、后面仍然吃杂文本，收益会被抵消。

### 3. 向量化

当前向量主入口在：

- [document-vector-records.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/document-vector-records.ts)

这里不需要重写向量模型，但需要明确一条规则：

1. evidence / summary / profile 的正文来源优先使用 canonical text 派生结果
2. `tableSummary` 继续作为独立高价值结构信号保留

## Observability and Operations

### 1. Operations overview 需要能看到新链的健康度

当前运维总览在：

- [operations-overview.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/operations-overview.ts)

建议至少增加这几项统计：

1. `markdownCoverageCount`
2. `markdownFailedCount`
3. `vlmFallbackCount`
4. `audioParseFailedCount`

否则后面上线后很难判断：

1. 到底是 MarkItDown 没跑起来
2. 还是 VLM 兜底太频繁
3. 还是音频大量失败

### 2. 审计和详情页要能看到正文来源

建议把以下信息在详情页和审计里可见：

1. parse method
2. markdown method
3. canonical source
4. detail parse error

这能显著降低线上定位成本，尤其是 10/120 这种节点机。

## Deployment Impact

### 1. 这不是纯代码变更，还涉及节点机运行时

当前 10/120 的应用节点部署已经拆成 profile：

- [deploy/profiles/10/README.md](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/deploy/profiles/10/README.md)
- [deploy/profiles/120/README.md](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/deploy/profiles/120/README.md)

如果接入 MarkItDown，这两类 profile 后续都要补：

1. Python 版本要求
2. `markitdown` 安装方式
3. `audio-transcription` 额外依赖
4. 健康检查命令

### 2. 推荐部署校验

建议把下面这些变成节点机的标准自检：

1. `python -m markitdown --help` 或 `markitdown --help`
2. 对一份小样本 `docx`
3. 对一份小样本 `wav/mp3`
4. OpenClaw 音频/多模态兜底能力探测

否则设计写得再清楚，10/120 上也容易出现“代码有了，但运行时没有依赖”的假打通。

## Consumer Changes

第一批应改的消费入口：

1. [document-cloud-enrichment.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/document-cloud-enrichment.ts)
   - `Source text excerpt` 应优先取 canonical text
2. [knowledge-chat-dispatch.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/knowledge-chat-dispatch.ts)
   - “最新详细解析文档全文块”应改为 canonical text block
3. [document-vector-records.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/document-vector-records.ts)
   - summary/profile/evidence 的上下文前缀仍保留，但 evidence 和结构化抽取应来自 canonical text 派生结果
4. [knowledge-supply.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/knowledge-supply.ts)
   - 文档供料和 schema hints 不变，但优先正文来源应改成 canonical text

原则是：

1. 供料入口统一
2. 下游模块尽量少知道 MarkItDown 细节

## Runtime and Dependency Model

MarkItDown 不是托管 API，应按“本地依赖”接入。

推荐支持两种执行形态：

1. `python -m markitdown`
2. `markitdown` CLI

建议在 [runtime-executables.ts](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/apps/api/src/lib/runtime-executables.ts) 补：

1. `getMarkItDownCommandCandidates()`
2. `MARKITDOWN_BIN`
3. 可选 `MARKITDOWN_PYTHON_BIN`

如果要把音频也纳入同一条链，第一版还应补：

1. `ENABLE_MARKITDOWN_AUDIO`
2. `MARKITDOWN_AUDIO_MODE=prefer|fallback|off`
3. 运行环境安装 `markitdown[audio-transcription]`

建议环境变量：

```text
ENABLE_MARKITDOWN=1
MARKITDOWN_MODE=prefer|off
MARKITDOWN_TIMEOUT_MS=120000
MARKITDOWN_AUDIO_MODE=prefer|fallback|off
MARKITDOWN_BIN=
MARKITDOWN_PYTHON_BIN=
```

## Failure Rules

以下情况应直接回退旧链，不阻断详细解析：

1. 本地未安装 MarkItDown
2. Python 运行时不可用
3. CLI 超时
4. 输出为空
5. 输出长度远小于现有 `fullText`

推荐一个简单质量门槛：

1. 若 `markdownText.length < 400` 且 `fullText.length >= 1200`，则判为 markdown 质量过弱
2. 若 markdown 只剩文件名或元数据，也视为失败

失败后的策略：

1. 保留当前 `fullText`
2. 视文档类型决定是否继续跑 VLM
3. `detailParseStatus` 仍可最终成功，只是 `markdownError` 被记录

音频特殊规则：

1. 音频没有现成 `fullText` 时，MarkItDown 失败后可以直接尝试 VLM
2. VLM 若也失败，则 `detailParseStatus = failed`
3. 不再继续追加别的专用转录引擎
4. UI 和审计里应明确显示“音频解析失败”

## Rollout Plan

### Phase 1: Provider 落地，并建立优先级主路

目标：

1. 新增 provider
2. 跑通 `docx/pptx/xlsx/html/epub/pdf/wav/mp3`
3. 把 `markdownText` 写回 `ParsedDocument`
4. 对已有 Markdown 的来源直接标记 canonical source

但此阶段：

1. 聊天仍主要用 `fullText`
2. 向量仍用现有结果
3. 只观察 markdown 质量

### Phase 2: canonical text 接入供料与结构化

目标：

1. `document-cloud-enrichment.ts` 改吃 canonical text
2. `knowledge-chat-dispatch.ts` 改吃 canonical text
3. 结构化 evidence 优先基于 canonical text
4. OCR 结果不再作为 detailed parse 主文本优先来源

### Phase 3: canonical text 接入向量化

目标：

1. `document-vector-records.ts` 统一基于 canonical text 形成更稳的 summary/profile/evidence 输入
2. 对比向量召回质量是否提升

### Phase 4: 运行时验证和存量回填

目标：

1. 验证 `existing markdown > MarkItDown > VLM > failed` 的优先级在 10/120 节点上可用
2. 对存量支持格式文档进行分批回填
3. 验证 PDF、音频、网页采集正文三类边界行为

## Success Criteria

达到以下条件，才算这个架构优于当前方案：

1. `docx/pptx/html/epub` 详细解析后的正文结构明显比当前 `fullText` 更稳定
2. 招标、方案、制度类文档在问答中的层级和列表保留更完整
3. `xlsx/xls` 保留现有 `tableSummary` 价值，没有被 Markdown 稀释
4. VLM 触发频次下降，但图片/强视觉文档结果不变差
5. 音频文件中至少 `wav/mp3` 能稳定形成可供料的 Markdown 或明确失败
6. 结构化抽取和向量召回的输出漂移减少

## Risks

### 1. Python 运行时运维复杂度上升

当前项目已经依赖 Python 于 OCR/PDF/OOXML fallback，但再引入 MarkItDown 会继续抬高本地依赖门槛。

### 2. Markdown 过长导致 token 成本上升

对 `pptx/xlsx/html`，canonical markdown 很可能比当前 `fullText` 更长。

所以消费层必须配套：

1. excerpt 截断
2. chunking
3. 按任务选择正文片段

### 3. 不同格式输出质量不一致

MarkItDown 的主要价值是统一趋势，不代表所有格式都比当前链更好。

所以必须接受：

1. 有些格式只是“可选增强”
2. 不是“一接上就默认最优”

### 4. 音频 VLM 兜底成功率可能低于视觉文档

如果 OpenClaw 当前所接的多模态模型并不稳定支持音频理解，这条兜底会直接失败。

这是可接受的，但必须明确：

1. 失败就是失败
2. 不伪装成“已解析”
3. 让平台状态可见

## Open Questions

1. `markdownText` 是否要在文档详情页可视化展示
2. 是否需要单独暴露“本文件 canonical markdown 来源”和“回退原因”
3. 音频 VLM 兜底在当前 OpenClaw runtime 上的真实支持范围是什么
4. 现有网页采集 Markdown 是否需要补统一质量评分

## Final Recommendation

建议按下面这句话执行：

**保持现有 quick parse 不动；detailed parse 统一采用 `existing markdown > MarkItDown > VLM > failed`；网页采集正文直接复用现成 Markdown，其他支持格式优先走 MarkItDown，失败再走 VLM；音频也纳入同一条链；后续结构化和向量化优先基于 canonical text，而不是继续直接吃各格式 raw text。**

这比当前方案更清晰，也更适合长期演进。
