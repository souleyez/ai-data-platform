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

## 当前定位

- 已进入 `mock + orchestration adapter` 阶段
- 文档检索、引用拼装、OpenClaw adapter 已拆分
- 下一步可继续把论文/技术文档结构化与真实面板结果接进来
