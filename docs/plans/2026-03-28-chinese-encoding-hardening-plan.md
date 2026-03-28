# 中文编码稳定性治理计划

日期：2026-03-28

## 背景

当前项目曾多次出现中文字符被污染的问题，典型表现包括：

- 中文意图词、模板说明、提示词被写成乱码
- 120 服务器上的“按库回答 / 按库输出”命中失败，本质上是中文规则损坏
- PowerShell、本地到远程的 inline script、SSH here-doc 传输中文时被替换成问号或乱码
- 测试文件和模板说明即使还能构建通过，也可能悄悄破坏中文业务语义

这类问题的风险在于：

- 不一定会直接导致构建失败
- 但会持续破坏知识库命中、模板约束、报表输出和普通问答体验
- 容易被误判成“模型不聪明”“检索没命中”“模板没生效”

## 根因判断

问题不是单一文件造成，而是以下四层一起缺防护：

1. 仓库层没有统一编码约束  
   缺少 `.editorconfig`、`.gitattributes` 这类基础约束。

2. 开发链路存在高风险中文输入点  
   尤其是 PowerShell 控制台、远程 here-doc、终端输出再回填源码。

3. 核心中文规则直接散落在业务源码里  
   比如意图识别词、模板标题、列名、分节名、提示词等。

4. 缺少自动化编码回归  
   没有专门检查乱码、替换字符和异常中文回归行为的守卫。

## 治理目标

本轮治理不是口头要求“以后别乱码”，而是建立一套可持续机制：

1. 仓库默认按 UTF-8 工作
2. 高风险链路不再直接传裸中文
3. 核心中文规则有自动化守卫
4. 一旦再出现污染，能在本地或 CI 提前发现
5. 不因 OpenClaw、本地终端或远程部署环境差异反复返工

## 当前进展

已落地：

- `.editorconfig`
- `.gitattributes`
- `tools/check-text-integrity.mjs`
- `corepack pnpm check:text-integrity`
- `tools/smoke-remote.mjs`
- `corepack pnpm smoke:remote:utf8 -- --host 120.24.251.24`
- UTF-8 BOM 检测已接入 `check:text-integrity`
- 仓库内高风险跟踪源码文件的 UTF-8 BOM 已清除

当前可以稳定做到：

- 先用仓库级守卫拦明显乱码
- 同时拦截 UTF-8 BOM 这类隐性编码风险
- 再用 UTF-8 safe smoke 回归 120 上的中文 `/api/chat`
- 远端 smoke 已覆盖：
  - 普通问答
  - 简历库公司维度静态页
  - 简历库技能维度表格
  - 最近上传文档细节
  - 否决按库意向
  - 数据源公开站点持续采集规划
- 不再只依赖 PowerShell 终端里的肉眼显示判断中文是否正常

## 总体策略

采用四层治理：

1. 仓库硬化
2. 核心文件清理
3. 开发与部署流程约束
4. 自动化守卫与中文业务回归

## Phase 1：仓库硬化

### 动作

1. 增加 `.editorconfig`
2. 增加 `.gitattributes`
3. 统一文本文件 UTF-8 和 LF
4. 明确哪些扩展名必须按文本处理

### 验收标准

- 新增或修改的源码文件默认按 UTF-8 保存
- 常用编辑器打开仓库时不再自由猜测编码

## Phase 2：核心文件清理

### 优先级最高的业务文件

1. 知识库主链
- `apps/api/src/lib/knowledge-intent.ts`
- `apps/api/src/lib/knowledge-context.ts`
- `apps/api/src/lib/knowledge-request-state.ts`
- `apps/api/src/lib/knowledge-plan.ts`
- `apps/api/src/lib/knowledge-output.ts`

2. 模板与报表主链
- `apps/api/src/lib/knowledge-template.ts`
- `apps/api/src/lib/report-center.ts`
- `apps/api/src/lib/knowledge-prompts.ts`

3. 数据源主链
- `apps/api/src/lib/datasource-planning.ts`
- `apps/api/src/lib/datasource-presets.ts`
- `apps/api/src/lib/datasource-execution.ts`

4. focused tests
- `apps/api/test/**`

### 处理原则

1. 业务中文尽量保留正常中文  
不要把所有正常中文都改成 Unicode escape。

2. 只在高风险场景用转义  
例如 PowerShell inline script、SSH here-doc、远程脚本注入、自动化 payload。

3. 可复用中文词集逐步集中  
例如意图词、模板标题、列名、分节名、关键提示词。

### 验收标准

- 关键供料层文件不再有可见乱码
- 中文问法对应的业务行为恢复并稳定

## Phase 3：开发与部署流程约束

### 规则

1. 不从 PowerShell 输出中复制中文回源码  
终端只用于观察，不作为可信文本来源。

2. 远程执行脚本不直接传裸中文  
优先使用 UTF-8 base64、Unicode escape 或 ASCII-safe payload。

3. 高风险脚本优先落成文件  
减少超长 inline here-doc。

4. 120 服务器 smoke 流程改成 UTF-8 safe  
避免中文请求在远程链路里被污染。

### 验收标准

- 本地到 120 的部署和回归脚本不再因中文误判
- 同一条中文请求在本地和 120 上行为一致

## Phase 4：自动化守卫

### 新增守卫

新增：

- `tools/check-text-integrity.mjs`

### 守卫内容

1. 检查常见 mojibake 片段
2. 检查替换字符 `U+FFFD`
3. 扫描高风险源码目录、测试目录、模板目录、技能目录
4. 白名单只允许临时存在，最终应清零

### 接入位置

1. 本地命令  
- `corepack pnpm check:text-integrity`

2. build 前预检查

3. 部署后 smoke 校验

### 验收标准

- 一旦有明显乱码进入核心目录，检查命令立刻失败
- 核心链路保持零白名单

## Phase 5：中文业务回归

### 必测场景

1. 按库输出意图  
例如：基于人才简历知识库中全部时间范围的简历输出表格。

2. 最近上传文档细节  
例如：帮我详细看看刚上传的简历里第一学历是什么。

3. 否决按库意向  
例如：不要按库，直接回答。

4. 模板维度输出  
- 简历：公司 / 项目 / 人才 / 技能
- 标书：风险 / 应答 / 章节
- 订单：平台 / 品类 / 库存
- IOT：场景 / 模块 / 价值

5. 数据源中文规划  
- 招投标站点
- 学术平台
- ERP / 数据库中文说明

### 验收标准

不只检查接口是否返回 200，还检查：

- `intent`
- `outputType`
- `sections / columns`
- `library match`

## Phase 6：长期结构优化

### 方向

1. 资源化  
把高频模板标题、分节、列名逐步沉淀成稳定资源。

2. helper 化  
把意图词、时间归一化、内容焦点归一化逐步从大文件里抽出。

3. 提示分层  
把通用系统提示、知识库供料提示、模板约束提示拆开。

### 目标

减少“大文件里同时堆中文规则、业务判断、生成逻辑、fallback 文案”的风险。

## 推荐执行顺序

### 立即执行

1. `.editorconfig`
2. `.gitattributes`
3. `check-text-integrity.mjs`
4. 清理 `knowledge-output.ts` 这类高风险文件

### 一周内完成

1. focused 中文回归
2. 120 服务器 UTF-8 safe smoke
3. 清理剩余测试和模板文件中的乱码

### 持续推进

1. 抽资源层
2. 继续瘦身 `orchestrator / knowledge / datasource` 大文件
3. 把中文业务规则从散落字符串收成稳定模块

## 结论

这项治理值得立即做，而且优先级高。

原因不是“代码洁癖”，而是：

- 它已经多次直接影响线上业务行为
- 它会让问题表面上看起来像模型、检索或模板失败
- 但根因往往只是中文规则被污染

如果不先做这层治理，后面无论继续做数据源、模板、按库输出还是 workspace skills，都会反复踩坑。
