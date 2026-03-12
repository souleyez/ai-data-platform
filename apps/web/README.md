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
- `/api/chat` mock 接口
- 前端通过 fetch 调用 mock API

## 当前 mock 接口

- 路径：`/api/chat`
- 方法：`POST`
- 入参：`{ prompt: string }`
- 返回：`scenario + message + panel`

## 下一步建议

1. 拆分组件（Sidebar / ChatPanel / InsightPanel）
2. 接入 ECharts
3. 对接真实后端接口
4. 抽离统一类型定义
