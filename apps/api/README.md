# apps/api

后端 API 骨架（Fastify + TypeScript）。

## 当前已提供接口

- `GET /`：服务基础信息
- `GET /api/health`
- `POST /api/chat`
- `GET /api/datasources`
- `GET /api/documents`
- `GET /api/reports`

## 启动

```bash
corepack pnpm install
cp .env.example .env
corepack pnpm dev
```

默认端口：

- `3100`

## OpenClaw 编排接入

当前 `POST /api/chat` 已支持一层可切换的编排：

- 默认：本地文档检索 + fallback mock 回答
- 配置后：本地文档检索 + OpenClaw Gateway `/v1/chat/completions`

可选环境变量：

- `OPENCLAW_GATEWAY_URL`：例如 `http://127.0.0.1:18789`
- `OPENCLAW_GATEWAY_TOKEN`：Gateway Bearer Token
- `OPENCLAW_AGENT_ID`：默认 `main`
- `OPENCLAW_MODEL`：可覆盖默认 `openclaw:<agentId>`

若未配置 Gateway，接口会继续返回 fallback 结果，不阻塞前端联调。

注意：OpenClaw Gateway 的 `/v1/chat/completions` 端点默认可能未启用；若请求返回 `404 Not Found`，需要在 Gateway 配置中开启 `gateway.http.endpoints.chatCompletions.enabled=true`。

## 真实材料回归验证

当前已补一个可重复执行的验证脚本，用于跑 `au20260316` 这批论文/白皮书材料：

```bash
DOCUMENT_SCAN_DIR=/mnt/c/Users/soulzyn/Desktop/au20260316 corepack pnpm --filter api validate:au20260316
```

输出位置：

- `docs/validation-reports/AU20260316-2026-03-17.json`
- `docs/validation-reports/AU20260316-2026-03-17.md`

这一步的目标不是替代人工判断，而是把“当前命中文档 / 是否含关键术语 / references/sources 是否返回”固化成一轮可复跑的基线。

## 当前定位

- 已进入 `mock + orchestration adapter` 阶段
- 文档检索、引用拼装、OpenClaw adapter 已拆分
- 当前主线已切到：真实材料回归验证 + 论文/技术文档问答可信度收紧
