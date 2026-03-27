# 文档库向量化分阶段方案

## 目标

在不影响当前上传、扫描、问答主链稳定性的前提下，为文档库引入向量化能力。

原则：

- 不改 OpenClaw 本体
- 不让上传链路因为向量化变慢
- 不直接对原始全文整篇建向量
- 只对高质量、结构化后的 `detailed` 结果建向量

## 当前基础

当前项目已经具备：

- `quick / detailed` 双阶段解析
- `schemaType / structuredProfile`
- `evidenceChunks`
- `claims`
- 云端增强后的摘要和结构化结果

这意味着向量化不需要从原始文档全文开始，而是可以直接建立在高质量片段之上。

## 分阶段实施

### M1：向量化记录抽取

目标：

- 从 `detailed` 文档中稳定提取可向量化记录

记录类型：

- `summary`
- `profile`
- `evidence`
- `claim`

设计原则：

- 一条记录只表达一个高质量语义单元
- 记录必须绑定来源文档、schemaType、知识库分组、topicTags
- 保留 chunk/claim 级别的来源元信息，方便检索后溯源

### M2：嵌入生成与索引存储

目标：

- 为向量记录生成 embedding 并持久化到项目侧索引

原则：

- 仅处理 `detailed` 文档
- 首次只做增量写入
- 向量索引与文档缓存分开存储

建议存储结构：

- `storage/cache/document-vector-index.jsonl`
- `storage/cache/document-vector-meta.json`

后续如果规模扩大，再切到专门向量库。

### M3：混合召回

目标：

- 把向量召回并入当前检索主链

顺序：

1. 关键词/规则初筛
2. 向量召回补充候选
3. rerank
4. 证据回传给云端

要求：

- 向量召回只做补充，不直接替代现有规则召回
- 召回失败不能影响当前知识库问答

### M4：质量优化

重点优化：

- 不同 `schemaType` 的向量权重
- `formula / contract / technical / paper` 的 profile 特征增强
- 召回后的去重和证据压缩

## 为什么不直接接全文向量

因为当前项目更适合：

- 用 `evidenceChunks` 表达高价值片段
- 用 `structuredProfile` 表达结构化主题
- 用 `claims` 表达可复用结论

这些比全文 embedding 更稳，也更利于最终知识库输出。

## 当前推荐顺序

1. 继续完善解析结果质量
2. 固定向量化记录抽取边界
3. 再接 embedding 和索引
4. 最后接入混合检索

## 红线

- 不改 OpenClaw 本体
- 不让上传同步等待向量化
- 不把页面交互和向量化耦合

