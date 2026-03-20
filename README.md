# AI 数据分析中台

基于云端模型能力层封装的企业知识库、问答编排与模板输出项目。

## 架构定位

- `OpenClaw gateway`：模型能力层
- `ai-data-platform`：知识库命中、对话编排、模板输出层

本项目不改写 OpenClaw 本体，而是在其之上增加：

- 本地知识库命中
- 模板化输出
- 云端模型补判与增强回答
- 本地 AI 兜底

最终链路是：

1. 本地先尝试命中知识库模板。
2. 本地命中不明确时，交给云端模型补判或正常回答。
3. 如果能命中模板，最终仍按项目内模板输出。
4. 如果本机没有 OpenClaw，系统依然可以独立运行。

## 本地开发

建议使用 Node.js 22+。

```bash
corepack pnpm install
corepack pnpm setup:env
corepack pnpm local:start
corepack pnpm local:status
```

默认端口：

- Web：`http://127.0.0.1:3002`
- API：`http://127.0.0.1:3100`
- OpenClaw 本地桥接：`http://127.0.0.1:18789`

说明：

- Windows 开发机下，页面通过本地桥接访问 WSL 中的 OpenClaw gateway。
- 这层桥接只用于本地开发调试，不属于线上正式架构。
- 桥接脚本位于 `tools/openclaw-local-gateway.mjs`。

## OpenClaw 安装与模型配置

如果本地没有 OpenClaw，可以直接安装最新版：

```bash
corepack pnpm openclaw:install
```

安装脚本会：

- 在 WSL 中安装最新版 `openclaw`
- 写入并启动默认 `openclaw-gateway.service`
- 更新 Windows 开机唤醒脚本

左侧“模型配置”面板现在会真实读取：

- OpenClaw 是否已安装
- 网关是否连通
- OpenClaw 当前版本
- 可用模型列表
- 当前项目选择的默认云端模型

## 常用命令

```bash
corepack pnpm dev
corepack pnpm dev:api
corepack pnpm dev:web
corepack pnpm dev:worker
corepack pnpm build
corepack pnpm test
corepack pnpm local:stop
```

## 环境文件

首次运行 `corepack pnpm setup:env` 会自动补齐缺失的本地配置：

- `apps/api/.env`
- `apps/web/.env`
- `apps/worker/.env`

样例文件：

- `apps/api/.env.example`
- `apps/web/.env.example`
- `apps/worker/.env.example`

## 服务器部署

线上建议把 `OpenClaw gateway` 与项目 API 放在同机或同内网下：

- `openclaw-gateway`
- `ai-data-platform-api`
- `ai-data-platform-worker`
- `ai-data-platform-web`

线上调用关系：

- 项目 API 直接访问 OpenClaw gateway
- 不再经过 Windows 本地桥接
- 用户界面仍只显示“云端模型 / 本地AI”

部署模板见：

- `docs/DEPLOYMENT_SERVER.md`
- `deploy/server/ai-data-platform.env.example`
- `deploy/server/systemd/`
