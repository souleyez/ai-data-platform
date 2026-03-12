# Architecture - AI 数据分析中台

## 1. 总体架构

系统分为五层：

1. **Web 工作台层**
2. **业务 API 层**
3. **OpenClaw Agent 编排层**
4. **数据接入层**
5. **存储与索引层**

## 2. 组件说明

### 2.1 apps/web

职责：

- 对话 UI
- 图表展示
- 数据源管理页面
- 文档管理页面
- 报表中心
- 审计查看

建议技术：

- Next.js
- React
- Tailwind CSS
- ECharts
- shadcn/ui 或 Ant Design

### 2.2 apps/api

职责：

- 用户请求入口
- 鉴权与权限校验
- 会话管理
- 统一调用 Agent / 数据源 / 报表模块
- 安全策略控制

建议技术：

- Node.js + TypeScript
- Fastify 或 NestJS

### 2.3 apps/worker

职责：

- 文档扫描
- OCR / 文本抽取
- 索引构建
- 定时同步
- 报表预计算

### 2.4 packages/agent-core

职责：

- OpenClaw 定制封装
- 问题分类
- 数据源路由
- 工具调用策略
- 回答引用整合

### 2.5 packages/datasource-docs

职责：

- 扫描指定文件夹
- PDF/Word/Excel 文本抽取
- 文档分类
- 合同字段抽取
- 技术文档摘要与标签化

### 2.6 packages/datasource-db

职责：

- 数据库连接配置
- 只读 SQL 执行
- 白名单表/视图控制
- 敏感字段脱敏

### 2.7 packages/datasource-web

职责：

- Playwright 登录网站后台
- 读取订单/流程/报表页面
- 页面数据抽取
- 只读动作白名单

### 2.8 packages/report-engine

职责：

- 将分析结果转换为图表配置
- 输出表格、统计卡片、报表数据
- 支持 ECharts option 生成

### 2.9 packages/shared

职责：

- 类型定义
- 权限模型
- 配置结构
- 通用工具函数

## 3. 安全设计

### 3.1 只读约束

- 数据库账户必须为只读
- 网站自动化只允许查询、读取、导出类动作
- 不暴露任何写操作工具给 Agent
- 文档扫描只读访问文件系统

### 3.2 审计

记录：

- 用户问题
- 访问数据源
- 执行 SQL
- 访问文档
- 生成报表

### 3.3 权限

- 用户级数据源权限
- 表/视图白名单
- 字段级脱敏
- 文档目录访问控制

## 4. 数据流

1. 用户在 Web 提问
2. API 进行鉴权与问题分发
3. Agent 判断使用哪类数据源
4. 调用 docs/db/web 只读工具
5. 返回结构化数据
6. report-engine 生成可视化数据
7. Web 展示答案、图表、来源引用

## 5. 推荐实现路径

### Phase 1

- Web 聊天页
- 文档扫描与问答
- 合同/技术文档结构化
- 数据库只读查询

### Phase 2

- 网页后台登录读取
- 报表中心
- 自动化任务

### Phase 3

- 完整权限系统
- 审计 UI
- 模板化分析流程
