# apps/web

前端工作台已升级为 Next.js 骨架。

## 当前结构

- `app/layout.js`
- `app/page.js`
- `app/globals.css`
- `next.config.mjs`
- `package.json`

## 启动

在 `ai-data-platform/apps/web` 目录执行：

```bash
corepack pnpm install
corepack pnpm dev
```

然后访问：

```text
http://localhost:3000
```

## 当前能力

- 中台式布局
- 左侧导航
- 聊天问答区
- 指标卡片
- 趋势图占位
- 风险合同表格
- 前端默认通过同源 `/api/*` 路由代理到独立 `apps/api`
- 首页调用 `POST /api/chat`
- 文档中心调用 `GET /api/documents`

## 本地环境变量

默认推荐：

- `NEXT_PUBLIC_API_BASE_URL=` 保持为空，浏览器请求走同源代理
- `BACKEND_API_BASE_URL=http://127.0.0.1:3100` 由 Next 服务端代理转发到后端 API

这样本地开发更稳定，不依赖浏览器直接跨域访问 `3100`。

## 当前接口

- 路径：`/api/chat`
- 方法：`POST`
- 入参：`{ prompt: string }`
- 返回：`scenario + message + panel`
- 首页当前已直接消费 `apps/api` 返回的真实 `panel` 数据，而不是仅靠前端本地 mock 场景切换。

## 下一步建议

1. 抽离统一类型定义 / schema 校验
2. 继续收紧文档匹配与面板映射
3. 引入真实数据源 mock server / 示例数据集
4. 完善文档中心与详情页联动
