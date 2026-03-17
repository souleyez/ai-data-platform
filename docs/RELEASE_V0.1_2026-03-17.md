# AIDATE V0.1 发版说明（2026-03-17）

## 版本定位

这是 AIDATE 的**第一版演示/内测版（V0.1 Demo）**。

定位不是“正式稳定交付版”，而是：

- 验证论文 / 技术文档问答主线
- 验证 OpenClaw 作为编排底座的可行性
- 验证 Web 工作台 + 本地 API + 文档扫描链路是否顺畅

当前最适合：

- 内部演示
- 小范围试用
- 向 1~3 个潜在早期用户展示方向

不建议当前就按“成熟产品”口径大范围发布。

---

## AIDATE 与 OpenClaw 的关系

AIDATE 不是完全独立于 OpenClaw 的另一套系统。

更准确地说：

- **OpenClaw**：底层能力与编排底座
  - Gateway
  - Agent / 会话能力
  - 后续多数据源与自动化能力的基础设施
- **AIDATE**：面向具体场景的上层产品原型
  - 文档接入
  - 文档问答
  - 结构化摘要
  - 分析工作台页面
  - 验证与演示链路

当前原则：

- 优先**集成/复用 OpenClaw**
- 尽量**不改 OpenClaw upstream 源码**
- AIDATE 以“业务产品层”方式建设

---

## 本版已完成内容

### 1. 文档链路

已具备：

- 扫描文档目录
- 解析 `txt / md / pdf`
- 文档摘要/摘录生成
- 基础分类（paper / technical / contract / other）
- 文档列表与详情页展示

### 2. 对话链路

已具备：

- `/api/chat` 对话入口
- 基于问题的文档召回
- 基于命中文档构造上下文
- fallback 回答
- 可选接入 OpenClaw Gateway 做真实编排

### 3. Web 工作台

已具备：

- 首页对话区
- 首页资料接入区
- 文档中心
- 文档详情页
- 数据源页 / 报表页基础骨架

### 4. 验证能力

已具备：

- `au20260316` 真实材料验证脚本
- 第一版验证报告基线
- 对论文/技术文档主线的回归验证能力

---

## 当前主要依赖

### 必需依赖

1. **Node.js 22+**
2. **corepack / pnpm**
3. **AIDATE 项目代码**

### 推荐依赖

1. **OpenClaw Gateway**
   - 用于真实编排与回答
   - 不装也能跑，但会走 fallback
2. **真实文档目录**
   - 例如 `au20260316`
   - 没有真实材料也能跑，但演示价值会明显下降

### 当前不是必需的

以下不是 V0.1 启动阻塞项：

- OCR 方案（如 MinerU）
- 数据库数据源
- ERP / 订单系统接入
- 网页后台深度抓取
- 完整权限/审计体系

---

## 安装与启动顺序（推荐）

## 步骤 0：准备环境

确认：

```bash
node -v
corepack --version
```

建议 Node 22+。

然后安装依赖：

```bash
corepack enable
corepack pnpm install
```

---

## 步骤 1：先启动 OpenClaw（推荐，但不是强制）

如果你希望 AIDATE 的聊天走真实编排，而不是 fallback，建议先启动 OpenClaw Gateway。

确认 Gateway 可访问，例如：

```bash
curl http://localhost:18789
```

或根据你的部署方式确认：

- OpenClaw Gateway 已启动
- `/v1/chat/completions` 已启用
- 你拿到了 Gateway Token

### 说明

- **有 OpenClaw Gateway** → AIDATE 对话更接近真实产品链路
- **没有 OpenClaw Gateway** → AIDATE 仍可运行，但聊天会退回 fallback 模式

也就是说：

> OpenClaw 对 V0.1 来说是“强烈推荐”，不是“绝对阻塞”。

---

## 步骤 2：配置 AIDATE API

进入：

```bash
cd apps/api
cp .env.example .env
```

关键配置：

```env
PORT=3100
HOST=0.0.0.0

OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=replace-with-your-gateway-token
OPENCLAW_AGENT_ID=main
```

### 关于 `DOCUMENT_SCAN_DIR`

如果你要扫描真实材料，可以在启动时额外传：

```bash
DOCUMENT_SCAN_DIR=/path/to/your/docs
```

比如：

```bash
DOCUMENT_SCAN_DIR=/mnt/c/Users/soulzyn/Desktop/au20260316
```

---

## 步骤 3：启动 AIDATE API

在项目根目录执行：

```bash
DOCUMENT_SCAN_DIR=/mnt/c/Users/soulzyn/Desktop/au20260316 corepack pnpm --filter api dev
```

或生产方式：

```bash
corepack pnpm --filter api build
DOCUMENT_SCAN_DIR=/mnt/c/Users/soulzyn/Desktop/au20260316 node apps/api/dist/server.js
```

启动成功后，检查：

```bash
curl http://localhost:3100/api/health
```

---

## 步骤 4：启动 AIDATE Web

进入：

```bash
cd apps/web
cp .env.example .env.local
```

当前默认示例：

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3100
```

然后启动：

```bash
corepack pnpm --filter web dev
```

或生产方式：

```bash
corepack pnpm --filter web build
PORT=3000 NEXT_PUBLIC_API_BASE_URL=http://localhost:3100 corepack pnpm --filter web start
```

---

## 步骤 5：访问地址

本地典型访问方式：

- Web: `http://localhost:3000`
- API: `http://localhost:3100`
- Health: `http://localhost:3100/api/health`
- OpenClaw Gateway（若启用）: `http://localhost:18789`

---

## 最推荐的启动顺序总结

### 本地开发 / 演示建议顺序

1. **启动 OpenClaw Gateway**（推荐）
2. **启动 AIDATE API（3100）**
3. **启动 AIDATE Web（3000）**
4. 打开页面验证 `/documents` 和 `/chat`

### 最小可运行顺序（不依赖 OpenClaw）

1. 启动 AIDATE API
2. 启动 AIDATE Web
3. 使用 fallback 聊天能力演示

---

## 如何验证安装是否正常

### 1. API 健康检查

```bash
curl http://localhost:3100/api/health
```

### 2. 文档列表

```bash
curl http://localhost:3100/api/documents
```

### 3. 前端页面

浏览器访问：

```text
http://localhost:3000
```

### 4. 聊天接口

```bash
curl -X POST http://localhost:3100/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"请总结后生元白皮书的主要价值"}'
```

---

## 已知限制

### 1. 当前重点仍是论文 / 技术文档

当前更适合：

- 论文解读
- 技术资料摘要
- 白皮书归纳
- 多材料主题分组

当前不建议重点宣传：

- 重度合同审查
- ERP 全链经营分析
- 复杂业务后台抓取

### 2. OCR/复杂 PDF 能力还没正式接入

当前 PDF 主要依赖：

- `pdf-parse`

所以：

- 文本型 PDF 效果较好
- 扫描版 PDF / OCR 场景仍有短板

### 3. fallback 虽然可用，但仍不是最终答案形态

当前 fallback 已比早期版本更像“基于问题的总结”，但仍会继续打磨。

### 4. 当前更适合 Demo / 内测，不是最终交付版

---

## 建议演示路径

推荐你对外演示时按这个顺序：

1. **首页**：展示资料接入 + 聊天工作台
2. **文档中心**：展示文档分类、摘要、详情
3. **聊天问答**：演示针对论文/白皮书提问
4. **验证可信度**：说明当前引用来源、文档命中、真实材料回归能力

推荐示例问题：

- `请总结后生元白皮书的主要价值和适用场景`
- `这批资料里哪些更偏减脂/运动，哪些更偏脑健康？`
- `Bifidobacterium breve 改善脑功能那篇文献，实验对象和核心发现是什么？`

---

## 当前版本最适合怎么介绍

建议对外口径：

> AIDATE 是一个基于 OpenClaw 定制的企业文档分析与问答原型，当前第一版重点验证论文、技术资料、白皮书等只读材料的接入、解析、问答与结构化展示能力。

---

## 下一步计划

1. 继续打磨首页交互与整体观感
2. 继续收紧论文/技术文档召回与问答质量
3. 强化真实材料验证规则
4. 逐步把 OpenClaw 集成从“可选增强”推进到“更稳定主链路”

---

## 结论

**V0.1 已经可以发第一版 Demo。**

但请按下面理解它：

- 可以演示
- 可以小范围试用
- 可以验证方向
- 还不是正式稳定版
