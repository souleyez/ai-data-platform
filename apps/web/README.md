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

## 下一步建议

1. 拆分组件（Sidebar / ChatPanel / InsightPanel）
2. 接入 mock chat API
3. 接入 ECharts
4. 对接真实后端接口
