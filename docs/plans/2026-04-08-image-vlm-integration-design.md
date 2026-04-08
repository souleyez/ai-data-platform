# Image VLM Integration Design

## Goal

在不分叉现有知识系统的前提下，为图片型资料增加一条基于 VLM 的增强解析链，用来处理：

1. 手机拍照件
2. 截图
3. 海报、制度截图、流程图
4. 表单、票据、扫描图片
5. 当前 OCR 能抽文本但抽不到版面语义的图片资料

目标不是“再造一个图片知识系统”，而是把图片资料也纳入现有这条主链：

`文件入库 -> 解析 -> structuredProfile / evidenceChunks -> memory-first / retrieval -> 报表与问答`

## Scope

第一版只覆盖：

1. 纯图片文件：`.png`、`.jpg`、`.jpeg`、`.webp`、`.gif`、`.bmp`
2. 文档上传、本地目录、网页下载进入知识库后的图片资料
3. 图片的视觉理解、结构化字段提取、证据块生成
4. 复用现有详细解析队列与 cloud enrichment 入口

第一版不做：

1. 扫描 PDF 全量切到 VLM
2. 视频帧理解
3. 文档级 OCR 替换
4. 单独的图片问答系统
5. 图片裁剪、标注、区域交互编辑器

## Guardrails

1. 不替代现有 `document-parser` 主链
2. 不把 VLM 输出直接当最终事实，仍然落回 `structuredProfile`、`fieldDetails`、`evidenceChunks`
3. 不新增第二套图片索引或第二套图片知识页
4. OCR 保留为基础兜底，VLM 是增强层
5. 第一版只做图片文件，不把扫描 PDF 一起搅进去

## Current State

当前图片链路已经有 3 个可复用基础：

1. 图片文件可入库并预览
2. 图片详细解析当前走 `Tesseract OCR`
3. 详细解析结果最终还是归一到 `ParsedDocument`

当前关键文件：

- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-parser.ts`
- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-cloud-enrichment.ts`
- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-advanced-parse-provider.ts`
- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\openclaw-adapter.ts`
- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\web\app\documents\DocumentAnalysisPanel.js`
- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\format-support-matrix.ts`

当前缺口：

1. 图片只有 OCR 文本，没有版面理解
2. 结构化字段提取主要依赖 OCR 文本，无法稳定识别截图、表单、图文海报
3. `openclaw-adapter` 只支持文本 message，不支持图片输入
4. UI 看不到图片解析是 OCR 还是 VLM

## Options

### Option A: 用 VLM 直接替换图片 OCR

做法：

1. 图片文件在 `extractText()` 阶段直接调用 VLM
2. OCR 不再是默认路径

优点：

1. 逻辑最直接
2. 对图片质量差、版面复杂的资料理论上更强

缺点：

1. 同步解析时延和成本都会上升
2. 一旦 VLM 不可用，上传与入库体验直接受影响
3. 会把当前图片 quick parse 的稳定性一起拉低

结论：

不推荐第一版采用。

### Option B: 保留 OCR quick parse，增加图片 VLM detailed parse

做法：

1. quick parse 仍保留当前 OCR / metadata 兜底
2. 图片文件进入详细解析队列后，再调用 VLM 做视觉增强
3. VLM 输出回写到 `structuredProfile`、`evidenceChunks`、`summary`

优点：

1. 不影响现有上传和入库主链
2. 复用当前 `detailParseStatus`、memory sync、vector sync
3. 失败时可自然回退到 OCR 结果

缺点：

1. 图片文件的高质量理解不是实时得到，而是异步补全
2. 需要对现有 cloud enrichment 做一点分支增强

结论：

这是推荐方案。

### Option C: 单独做图片理解子系统

做法：

1. 图片进入独立服务
2. 结果以图片知识页或图片缓存形式单独保存

优点：

1. 可高度自由设计

缺点：

1. 明显违反当前项目“不再造第二套知识系统”的红线
2. 与现有问答、文档、报表链路整合成本更高

结论：

不推荐。

## Recommended Architecture

推荐方案是：

`OCR quick parse + OpenClaw image-tool detailed enrichment`

高层流程：

```text
image upload / datasource ingest
  -> document ingest
  -> quick parse
    -> OCR text or image metadata
  -> enqueue detailed parse
  -> OpenClaw skill call
    -> MiniMax understand_image / image tool
  -> normalize to ParsedDocument
  -> memory sync / retrieval / report generation
```

### Decision 1: VLM 只作为图片详细解析增强层

图片文件仍然先进入现有 `parseDocument()`：

1. `parseStatus` 仍按当前逻辑产出
2. `parseMethod` 初始仍可能是 `image-ocr` 或 `image-ocr-empty`
3. 详细解析阶段若 VLM 成功，则更新为 `image-ocr+vlm` 或 `image-vlm`

这意味着：

1. quick parse 保持可用
2. 详细解析成功后，结果质量再提升
3. UI 仍可通过 `detailParseStatus` 观察是否已增强完成

### Decision 2: VLM 输出必须回写到统一结构

第一版不新增一套“图片理解对象仓库”，而是要求 VLM 输出统一映射到：

1. `summary`
2. `excerpt`
3. `evidenceChunks`
4. `structuredProfile`
5. `topicTags`
6. `entities`
7. `claims`

必要时可在 `structuredProfile` 里增加一个轻量的 `imageUnderstanding` 子对象，例如：

```ts
imageUnderstanding: {
  documentKind?: string;
  layoutType?: string;
  visualSummary?: string;
  detectedSections?: Array<{ title: string; text: string }>;
  extractedFields?: Record<string, unknown>;
  chartOrTableDetected?: boolean;
}
```

这样问答、召回、库级编译摘要都还是走原来的对象模型。

### Decision 3: 第一版优先走 OpenClaw 的 image tool，不直接扩展 API 层多模态协议

截至 2026-04-08，MiniMax 官方文档已经明确两点：

1. MiniMax 的 MCP / OpenClaw 路径提供 `understand_image`
2. 当 OpenClaw 通过 `minimax-portal` 登录后，`image` tool 会自动接到 MiniMax 的图片理解能力

对应官方资料：

1. Token Plan MCP Guide
2. OpenClaw
3. API Overview

因此第一版不建议优先改 `openclaw-adapter.ts` 去直连多模态 `Responses API`，而是：

1. 保持 `openclaw-adapter.ts` 文本调用方式不变
2. 在图片详细解析 provider 里走 `openclaw-skill`
3. 通过 skill / prompt contract 强制调用 OpenClaw 的 image tool
4. image tool 再由 MiniMax 在 OpenClaw 后面提供 VLM 能力

这样做的好处是：

1. 对现有聊天主链零侵入
2. 不需要后端自己处理图片转 data URL
3. 与 MiniMax 官方对 OpenClaw 的推荐接法一致

### Decision 4: provider 选择独立于通用 chat 模型，但依附 OpenClaw runtime

不建议把图片 VLM 硬绑定当前聊天模型。

建议新增图片视觉解析专用配置，例如：

```text
DOCUMENT_IMAGE_PARSE_MODE=ocr-plus-vlm
DOCUMENT_IMAGE_VLM_PROVIDER=openclaw-skill
DOCUMENT_IMAGE_VLM_TOOL=image
DOCUMENT_IMAGE_VLM_TIMEOUT_MS=45000
DOCUMENT_IMAGE_VLM_MAX_IMAGE_BYTES=20000000
```

其中：

1. 图片深解析仍走 OpenClaw gateway
2. 但核心视觉理解由 OpenClaw 的 `image` / `understand_image` 工具完成
3. 该工具后端由 MiniMax 提供
4. 没有 image tool 时自动回退到 OCR only

## VLM Output Contract

建议图片 VLM 返回严格 JSON，不要自由文本。第一版输出协议建议为：

```json
{
  "summary": "",
  "documentKind": "",
  "layoutType": "",
  "topicTags": [],
  "riskLevel": "low",
  "visualSummary": "",
  "evidenceBlocks": [
    { "title": "", "text": "" }
  ],
  "fieldCandidates": [
    {
      "key": "",
      "value": "",
      "confidence": 0.8,
      "source": "vlm",
      "evidenceText": ""
    }
  ],
  "entities": [],
  "claims": [],
  "chartOrTableDetected": false,
  "tableLikeSignals": [],
  "transcribedText": ""
}
```

约束：

1. 不得编造图片中不存在的事实
2. 证据块必须优先来自图中可见区域
3. `transcribedText` 只作为补充，不单独成为第二文本源

## Merge Strategy

### OCR 与 VLM 如何合并

推荐规则：

1. 如果 OCR 成功且 VLM 成功：优先用 VLM 生成 `summary / structuredProfile / evidenceChunks`，OCR 文本作为补充证据
2. 如果 OCR 失败但 VLM 成功：文档仍视为 `parsed`
3. 如果 VLM 失败但 OCR 成功：保留现有 OCR 结果，不降级为失败
4. 如果两者都失败：维持当前 `image-ocr-empty` 错误语义

### 和知识库治理如何对接

VLM 并不直接绕过提取治理。

相反：

1. `document-extraction-governance.ts` 的 `fieldPrompts` 可作为图片 VLM 提取提示
2. `fieldAliases` 仍参与字段归一
3. `fieldNormalizationRules` 和 `fieldConflictStrategies` 仍然在结果落地后执行

这意味着“图片理解”也进入现有治理体系，而不是单独飞出去。

## File-Level Design

建议新增或改造这些文件：

### New

- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-image-vlm-provider.ts`
- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\document-image-vlm.test.ts`
- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\document-image-vlm-provider.test.ts`

### Modify

- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-advanced-parse-provider.ts`
- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-cloud-enrichment.ts`
- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-parser.ts`
- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\format-support-matrix.ts`
- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\web\app\documents\DocumentAnalysisPanel.js`

## Runtime and UI Changes

### Runtime

增加图片视觉解析能力状态：

1. `parseMethod` 可包含 `+vlm`
2. `cloudStructuredModel` 可记录 VLM 模型
3. `summary` 和 `structuredProfile` 反映 VLM 增强结果

第一版不建议新增单独的 `visualParseStatus`，直接复用现有：

1. `detailParseStatus`
2. `detailParsedAt`
3. `cloudStructuredAt`

### UI

文档详情页补 3 个轻量展示：

1. 解析来源：`image-ocr` / `image-ocr+vlm` / `image-vlm`
2. 视觉模型：显示 `cloudStructuredModel`
3. 图片理解摘要：展示 `structuredProfile.imageUnderstanding.visualSummary`

同时把格式支持矩阵里的图片支持从“partial / OCR only”提升为：

`partial / OCR + VLM enhancement`

## Failure Modes and Mitigation

### Risk 1: 成本和时延上升

缓解：

1. 仅图片文件进入 VLM
2. 默认只在详细解析阶段触发
3. 加并发和批次上限

### Risk 2: VLM 幻觉

缓解：

1. 严格 JSON schema
2. 强制 evidence block
3. 结果仍需过字段治理归一
4. 问答主链仍以证据块和原始文件为准

### Risk 3: 大图或异常图片导致请求失败

缓解：

1. 预先压缩到最大边长
2. 设置 `maxImageBytes`
3. 大于阈值直接退回 OCR only

### Risk 4: OpenClaw runtime 没有正确接上 MiniMax image tool

缓解：

1. 在 provider 侧先做 capability probe
2. 如果 image tool 不可用，直接 fallback 到 OCR only
3. 在文档详情页明确标出当前只使用 OCR

## Rollout Plan

### Phase 1

1. 增加图片 VLM provider
2. 将图片文件接入详细解析增强
3. 增加 OpenClaw image tool 可用性探测

### Phase 2

1. 把治理层 `fieldPrompts` 注入图片 VLM prompt
2. 补文档详情页的视觉解析展示
3. 补图片 VLM 单测和集成回归

### Phase 3

1. 在试点知识库验证制度截图、海报、扫描件
2. 评估是否把扫描 PDF 的图片页复用同一能力

## Success Criteria

满足以下条件后，可认为第一版成功：

1. 图片型资料不再只返回“OCR text”
2. `structuredProfile` 能稳定抽出高价值字段
3. 问答对截图、海报、拍照件的命中率明显高于 OCR only
4. 文档详情页能看见图片解析来源和视觉摘要
5. 图片 VLM 故障时不会拖垮现有上传与入库主链

## Recommendation

下一步建议直接按这个顺序实施：

1. 先做 `document-image-vlm-provider`
2. 再把图片文件挂到现有 detailed parse / cloud enrichment
3. 然后补 image tool 可用性探测
4. 最后补 UI 和回归测试

这条路线风险最低，也最符合当前项目“不分叉知识系统”的主线，同时也更贴近 MiniMax 官方对 OpenClaw 图片理解能力的推荐接法。
