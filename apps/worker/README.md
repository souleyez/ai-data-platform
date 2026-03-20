# apps/worker

后台任务进程。

当前能力：

- 启动独立 worker 进程
- 定期调用 API 的 `/api/documents/scan`
- 与现有文档上传/手动扫描复用同一条解析与缓存刷新链路
- 输出基础运行日志，作为后续 ingestion / 索引 / 调度的承载入口

本地启动：

```bash
corepack pnpm --filter worker dev
```

可配置项参考：

- `apps/worker/.env.example`

后续计划包含：

- 文件夹扫描
- PDF/OCR 解析
- 索引构建
- 周期性数据同步
- 报表预计算
