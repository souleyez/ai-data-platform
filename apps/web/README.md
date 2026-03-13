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
pnpm install
pnpm dev
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
- 前端通过 fetch 调用独立 `apps/api`
- 首页调用 `POST /api/chat`
- 文档中心调用 `GET /api/documents`

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
