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
corepack pnpm dev
```

默认端口：

- `3100`

## 当前定位

- 仍是 mock / skeleton 阶段
- 但接口结构已经贴近真实后端
- 下一步可把文档分析、数据库只读查询逐步接进来
