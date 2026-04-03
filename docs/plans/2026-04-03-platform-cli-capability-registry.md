# Platform CLI Capability Registry

## Goal

把整个平台的能力统一收口成一套底层规则：

1. 聊天层只做最小供料和必要确认，不再自己重编排系统动作。
2. 平台动作必须有稳定 CLI，可由 OpenClaw 或人工直接调用。
3. 系统能力说明、CLI 命令面、外部集成清单共享同一份注册表。
4. 模板输出仍保留双确认，但执行层依旧以 CLI 或明确系统动作结果为准。

## Base Rules

1. CLI 命令域是平台动作的唯一规范执行面。
2. 聊天层默认只负责命中文档供料、系统能力说明、模板输出确认。
3. 任何动作都不能在没有执行结果时声称“已完成”。
4. 实时问题默认有搜索能力，优先走 OpenClaw 原生搜索，项目侧搜索保留为后备。
5. OpenClaw 需要被明确告知当前系统有哪些能力、输出类型和可调用命令。

## Canonical Command Entry

根入口：

```powershell
pnpm system:control -- <domain> <subcommand> [flags]
```

API 脚本入口：

```powershell
corepack pnpm --filter api platform:control -- <domain> <subcommand> [flags]
```

## Capability Domains

### 1. Capability Registry

用途：
- 列出系统能力区域
- 列出外部集成
- 列出支持的输出类型
- 给 OpenClaw 提供统一能力认知

命令：

```powershell
pnpm system:control -- capabilities list
pnpm system:control -- capabilities show --area reports
pnpm system:control -- capabilities show --integration openclaw
```

### 2. Document Center

用途：
- 浏览知识库和文档
- 查看单文档解析详情
- 对失败文件手动重解析
- 自动整理、重聚类、重建向量

命令：

```powershell
pnpm system:control -- documents libraries
pnpm system:control -- documents list --library "合同协议" --limit 20
pnpm system:control -- documents detail --id "doc_xxx"
pnpm system:control -- documents reparse --id "doc_xxx"
pnpm system:control -- documents deep-parse --limit 8
pnpm system:control -- documents organize
pnpm system:control -- documents recluster-ungrouped
pnpm system:control -- documents vector-rebuild
```

### 3. Knowledge Supply

用途：
- 把“命中哪些库、哪些文档、哪些证据块”做成显式底层能力
- 让聊天层只供料，不做重路由式回答编排

命令：

```powershell
pnpm system:control -- supply preview --prompt "把合同库里最近 30 天的付款条款整理一下"
pnpm system:control -- supply preview --prompt "生成投标风险摘要" --library "投标资料" --time-range "30d"
```

### 4. Datasource Center

用途：
- 查看已管理数据源
- 查看最近运行
- 立即运行、暂停、激活

命令：

```powershell
pnpm system:control -- datasources list
pnpm system:control -- datasources runs --limit 5
pnpm system:control -- datasources runs --datasource "合同目录扫描" --limit 5
pnpm system:control -- datasources run --datasource "合同目录扫描"
pnpm system:control -- datasources pause --datasource "合同目录扫描"
pnpm system:control -- datasources activate --datasource "合同目录扫描"
```

### 5. Report Center

用途：
- 按库和时间范围生成输出
- 修订已有输出
- 保持输出执行面可被 CLI 直接控制

支持的输出类型：
- `table`
- `page`
- `doc`
- `md`
- `pdf`
- `ppt`

命令：

```powershell
pnpm system:control -- reports outputs --limit 10
pnpm system:control -- reports outputs --library "合同协议"
pnpm system:control -- reports generate --library "合同协议" --format table --request "整理合同编号、甲乙方、金额、签约日期"
pnpm system:control -- reports generate --library "合同协议" --format page --time-range "30d" --request "输出一份最近合同风险静态页"
pnpm system:control -- reports generate --library "合同协议" --format doc --request "生成合同情况说明文档"
pnpm system:control -- reports generate --library "合同协议" --format md --request "生成合同库 Markdown 摘要"
pnpm system:control -- reports generate --library "合同协议" --format pdf --request "生成合同库 PDF 汇总"
pnpm system:control -- reports generate --library "合同协议" --format ppt --request "生成合同库汇报 PPT"
pnpm system:control -- reports revise --output "output_xxx" --instruction "把风险部分改成按付款条款分类"
```

### 6. Model And Gateway

用途：
- 查看 OpenClaw 运行状态
- 查看当前模型和可用 provider
- 切换模型、保存 provider 配置、拉起登录、安装 OpenClaw

命令：

```powershell
pnpm system:control -- models status
pnpm system:control -- models select --model "openclaw:main"
pnpm system:control -- models save-provider --provider "moonshot" --method "api" --api-key "<key>"
pnpm system:control -- models launch-login --provider "github-copilot" --method "device"
pnpm system:control -- models install-openclaw
```

## Integrations And External Tools

### Core Runtime

- `OpenClaw`
  - 主模型网关
  - 普通模式和全智能模式都向它供料
  - 默认优先原生搜索

- `OpenClaw native search`
  - 默认优先 `DuckDuckGo`
  - 项目侧 `web-search` 作为后备

### Parsing And Document Processing

- `Tesseract OCR`
  - 图片和扫描件 OCR
  - 中文优先 `chi_sim+eng`
  - OCR 失败支持手动重解析

### Model Providers

- `OpenAI Codex`
- `GitHub Copilot`
- `MiniMax`
- `Moonshot / Kimi`
- `Z.AI / GLM`

### Plugins

- `Canva`
  - 设计生成、模板产出、尺寸适配、内容编辑

- `Figma`
  - 设计实现、设计系统、截图/上下文读取、图示和素材生成

- `GitHub`
  - 仓库、PR、Issue、CI、发布流

### Windows Bootstrap And Control Plane

- `Windows bootstrap installer`
  - 固定安装器
  - 安装 bootstrap，不直接升级自身
  - 运行时版本后台升级

- `Control plane`
  - 手机号验证
  - 发布版本
  - 模型池 key 和租约
  - 客户端升级策略

## Chat Layer Rules

1. 普通和全智能模式都要完整理解系统能力。
2. 聊天不负责伪执行系统动作。
3. 聊天负责：
   - 根据请求供料
   - 告知系统能力和可用命令
   - 命中模板输出时给两个确认选项
4. 模板输出双确认固定为：
   - 选项 A：按 OpenClaw 自己理解执行
   - 选项 B：按某库 + 某时间范围 + 某模板输出指定内容
5. 即使两种动作实际上相同，也仍然做双确认。

## Source Of Truth

这套规则在代码里对应两层：

- 能力注册表：
  - `apps/api/src/lib/platform-capabilities.ts`

- CLI 执行层：
  - `apps/api/src/lib/platform-control.ts`
  - `apps/api/src/scripts/platform-control.ts`

聊天系统能力上下文必须从能力注册表派生，不应手写另一套平行说明。
