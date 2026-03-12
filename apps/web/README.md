# apps/web

前端工作台原型。

当前已提供：

- `index.html`：静态页面原型
- `styles.css`：中台式布局与样式
- `package.json`：本地预览脚本

## 预览

在当前目录执行：

```bash
pnpm dev
```

或：

```bash
python3 -m http.server 3000
```

然后访问：

```text
http://localhost:3000
```

## 当前页面包含

- 左侧导航
- 聊天问答区
- 数据源状态
- 指标卡片
- 趋势图占位
- 高风险合同表格

## 下一步建议

1. 用 Next.js 重构静态原型
2. 接入真实聊天接口
3. 接入 ECharts
4. 接入 mock 数据源与会话状态
