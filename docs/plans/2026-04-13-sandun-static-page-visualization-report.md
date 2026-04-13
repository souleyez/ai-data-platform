# Sandun 调研与“万事皆可可视化”报告

日期：2026-04-13

范围：
- 调研 [sandun.cc](https://sandun.cc/) 的公开产品表现和可借鉴模式
- 对照当前 `ai-data-platform` 的静态页/报表草稿链
- 输出一套“文字与数字都能被可视化表达”的落地框架

## 1. 执行摘要

结论先说：

1. `Sandun` 当前最值得借鉴的不是“某个单独模板”，而是它把 `PPT 规划` 作为产品主价值，而不是把生成当作纯 prompt 输出。
2. 它的首页表达非常克制：一个输入框、几个高质量案例、很强的封面质量感。这种产品心智比“万能生成器”更有说服力。
3. 对我们来说，正确方向不是“所有内容都变成图表”，而是“所有内容都先被映射成最合适的视觉模块”。换句话说：**万事皆可可视化，但不是万事皆可图表化。**
4. 现有项目已经有了一个对的底座：`draft -> review -> finalize`。下一步的关键不是再堆 prompt，而是建立一套 `visual grammar + scenario composer + style presets`。

## 2. Sandun 公开产品观察

公开能直接确认的是 [sandun.cc](https://sandun.cc/) 的产品页。

从页面内容看，Sandun 当前的公开产品特征很明确：
- 首页就是单输入框心智：“有什么 PPT 需要我做？”
- 强调“AI 生成定制级、可编辑的 PPT”
- 首页案例是按场景展示，而不是按技术能力展示
- 首页可见案例覆盖：
  - 生活类：北京 5 日游攻略
  - 企业介绍：正泰电器企业介绍
  - 产品介绍：Dify 产品介绍
  - 文件驱动：根据 PDF 生成季度财报分析

公开页面参考：
- [Sandun 首页](https://sandun.cc/)

从案例图看，Sandun 的强项很像是：
- 封面和第一页质量非常高
- 标题、副标题、三到四个锚点卖点处理得很稳
- 风格切换明显，但结构骨架稳定
- “根据 PDF 生成 PPT” 说明它重视从原始资料提炼结构，而不是只做主题扩写

从目前公开信息里，**我没有找到 Sandun 官方公开的 GitHub 开源仓库**。  
也就是说，公开可确认的是它的产品表现，不是它的内部实现。

## 3. 可借鉴的不是“模板”，而是这 5 个产品动作

### 3.1 单入口，不暴露内部复杂度

Sandun 首页没有先让用户选模板、选模式、选很多参数。它先让用户说“我需要什么 PPT”，再由系统自己决定结构和设计。

这对我们当前静态页也成立：
- 用户不该先理解 `pageSpec / datavizSlots / layoutVariant`
- 用户应该先说“我要一个什么页面”
- 系统先产出一个高质量草稿，再让用户修模块

### 3.2 高质量第一页决定信任

Sandun 的首页案例几乎都把封面页做得很重。这不是审美问题，是信任问题。

对我们当前系统，这意味着：
- 草稿第一屏必须比后续模块更强
- 第一屏至少要稳定包含：
  - 主题标题
  - 一句话结论/定位
  - 3 个核心锚点
  - 明确的数据来源或时间语境

如果第一页弱，用户会认为整套生成不可靠。

### 3.3 场景优先，而不是格式优先

Sandun 的案例命名方式不是“表格模板 1 / 静态页模板 2”，而是：
- 企业介绍
- 产品介绍
- 行业调研
- 财报分析
- 旅游攻略

这说明它更像是 `scenario composer` 驱动，而不是通用模板驱动。

对我们来说，下一步也应该收成：
- 经营/报表页
- 投标/方案页
- 研究/分析页
- 企业/产品介绍页
- 文件转讲解页

而不是继续把大量请求都塞进通用 `static-page` fallback。

### 3.4 文件驱动规划

Sandun 把“根据 PDF 生成 PPT”直接放到首页案例里，这很重要。

这意味着它至少在产品上强调：
- 先理解原始资料
- 再做结构提炼
- 最后再做设计表达

这和我们现在已经开始做的 `draft -> review -> finalize` 是同方向的。  
差别在于，我们的“资料到结构”的阶段还不够强，尤其是缺少领域级 composer。

### 3.5 风格强，但结构不散

从公开案例图看，Sandun 的风格变化很明显：
- 明亮极简
- 企业绿色
- 深色科技
- 财报型商务风

但它的结构并没有跟着失控。  
这说明它很可能已经做了 `content layer / structure layer / style layer` 的分层。

这点和 Gamma 的公开工作流是高度一致的。Gamma 官方公开强调：
- AI 先生成结构和设计
- 之后用户可以在 card 级别调整
- `theme` 可以整体切换，内容结构不受影响  
参考：[Gamma layout customization guide](https://gamma.app/explore/content/guides/gamma-ai-presentation-tool-flexible-layout-customization-guide)

## 4. 公开开源参考里，最值得借鉴的是 AiPPT 的数据结构思路

虽然没找到 Sandun 官方开源仓库，但公开可参考的相近开源项目有：
- [veasion/AiPPT](https://github.com/veasion/aippt)

这个项目公开宣称支持：
- 主题 / 文件 / 网址生成 PPT
- 原生图表、动画、3D 特效解析与渲染
- 自定义模板

这类项目最值得借鉴的不是 UI，而是它背后的中间结构思想：
- 内容不应直接绑定最终 PPT 画面
- 中间必须有可编辑、可复用的结构层
- 图表、动画、模板应该是后置渲染能力，而不是原始生成文本的一部分

这和我们当前已经建立的 `draft.modules[]` 是一致的。  
下一步应该继续把这个中间层做强，而不是回退到“一次性整页生成”。

## 5. 当前我们系统的现状

到今天为止，静态页主链已经不是旧的一次性成品模式，而是：

- 草稿状态：
  - `draft_planned`
  - `draft_generated`
  - `draft_reviewing`
  - `final_generating`
  - `ready`
  - `failed`
- 报表中心已经支持：
  - 模块级 draft
  - 模块重写
  - 结构重写
  - 最终确认
- 首页右侧“已出报表”已经支持：
  - 大预览展开
  - 上下切换
  - 草稿直接编辑
  - 收起保留紧凑列表
- 视觉风格已经支持：
  - `signal-board`
  - `midnight-glass`
  - `editorial-brief`
  - `minimal-canvas`

本地健康与性能现状：
- `operations-overview` 当前 `warning = 0 / critical = 0 / deepParseBacklog = 0`
- 首页报表轻量列表接口从完整 `/api/reports` 收成了 `/api/reports/snapshot`
- 本地量化：
  - 完整报表接口约 `808904 bytes`
  - 轻量快照约 `7366 bytes`
  - 本地测得 `snapshot` 调用时间约为完整接口的一半量级

这说明：
- 基础设施和状态机已经具备
- 现在的主要缺口不是“有没有工作流”
- 而是“draft planner 和 composer 还不够像 Sandun 那样以场景为中心”

## 6. 真正该建立的是“万事皆可可视化”的视觉语法

### 6.1 不是万事皆图表

“万事皆可可视化”的正确理解不是：
- 所有东西都画成图

而是：
- 所有内容都要先被识别成某种 **视觉表达意图**

也就是从：
- 原始文字
- 数字
- 表格
- 证据
- 结论
- 风险
- 时间关系
- 层级关系

映射成最合适的模块。

### 6.2 建议的视觉语法映射

建议把内容先归入以下视觉语法：

| 内容类型 | 建议模块 |
| --- | --- |
| 单一主结论 | `hero` |
| 3-6 个关键数字 | `metric-grid` |
| 多条洞察或摘要 | `insight-list` |
| 对比关系 | `comparison` / `table` / `bar chart` |
| 趋势变化 | `chart`（line/bar） |
| 结构层级 | `comparison` / `appendix` / 结构图 |
| 时间顺序 | `timeline` |
| 风险与问题 | 风险卡片 + 严重程度矩阵 |
| 原始证据 | `appendix` / `evidence rail` |
| 复杂长文 | 切成多个 `summary + chart + evidence` 组合模块 |

换句话说：
- 数字不一定画图，但一定要有视觉层级
- 文字不一定保留为段落，但一定要先决定它是“结论”“证据”“步骤”还是“对比”

### 6.3 对我们系统的落地方向

下一步建议新增一个 `visual intent engine`，职责是：
- 输入：结构化供料、数字、文本证据、图表意图
- 输出：模块建议

输出至少包含：
- `moduleType`
- `layoutType`
- `chartIntent`
- `evidenceRefs`
- `contentPriority`
- `editabilityLevel`

这样 draft planner 就不是只会“按 section 切块”，而是能先判断：
- 这里应该是一个数字卡
- 这里应该是一个时间线
- 这里应该是一个对比表
- 这里不该硬画图，而该做摘要 + 证据卡

## 7. 我们应该直接借鉴的设计模式

### 模式 A：内容 / 结构 / 风格三层分离

这个模式来自 Gamma 的公开工作流，也符合 Sandun 的产品表现。

在我们系统里应明确成：
- 内容层：证据、文字、数字、结论
- 结构层：模块顺序、模块类型、图表槽位
- 风格层：`signal-board / midnight-glass / editorial-brief / minimal-canvas`

用户应先改：
- 模块和文字

最后才选：
- 风格

### 模式 B：局部改，不重做整页

v0 的 Design Mode 明确强调：
- 用户可以快速改 copy、layout、colors、styling
- 不必重新跑整页生成  
参考：[Introducing Design Mode on v0](https://community.vercel.com/t/introducing-design-mode-on-v0/13225)

这正是我们现在模块级 draft editor 的方向。  
下一步要继续强化：
- 只改一个模块，不波及整页
- 只换视觉风格，不重写正文
- 只重做图表，不推翻模块顺序

### 模式 C：第一页更强，后续模块更稳

Sandun 的案例说明，第一页必须像“封面 + 执行摘要”，而不是普通 section。

所以我们的 planner 应加一个硬约束：
- `hero` 模块必须来自专用 composer，不走通用 fallback
- 第一屏必须至少包含：
  - 主标题
  - 副标题 / 一句话定位
  - 3 个关键锚点
  - 时间范围 / 来源语境

## 8. 推荐的风格体系

建议不要无限开放风格，而是先锁成 4-6 套真正可控的风格：

### 8.1 `signal-board`
- 用途：项目总览、运营总览、工作台首页
- 关键词：信息密度高、卡片化、控制台、运营看板

### 8.2 `midnight-glass`
- 用途：科技、平台、架构、产品讲解
- 关键词：深色、玻璃感、科技品牌感

### 8.3 `editorial-brief`
- 用途：研究结论、行业分析、咨询类汇报
- 关键词：留白、版式感、标题强、阅读性好

### 8.4 `minimal-canvas`
- 用途：客户交付页、轻量汇报页
- 关键词：极简、克制、适合二次修改

### 8.5 后续建议新增
- `enterprise-green`
  - 对应企业介绍类页面
- `earnings-deck`
  - 对应财报、经营分析、季度总结类页面

这几套就够了。  
重点不是多，而是：
- 每一套都有稳定的首页/封面质量
- 每一套都有稳定的数字模块表现
- 每一套都能和 draft modules 解耦

## 9. 下一阶段具体建议

### 9.1 先把“经营/报表页”做成 benchmark composer

这是最近最重要的展示面，也是最适合验证“万事皆可可视化”的场景。

目标：
- 数字自动转 metric-grid / comparison / chart
- 文字自动转 summary / insight-list / appendix
- 第一屏固定有财报/经营风格的 hero

### 9.2 再补 3 个场景 composer

按优先级建议：
1. `operations/report page`
2. `bids/solution page`
3. `research/analysis page`
4. `enterprise/product intro page`

### 9.3 把首页总览页从“模块生成”升级成“视觉语法驱动”

现在首页已经能基于真实项目数据出 draft。  
下一步不该只是再调文案，而是：
- 指标 -> metric-grid
- 健康状态 -> status signal strip
- 数据集分布 -> bar chart
- 报表状态 -> output chart
- 风险 -> alert cards

让首页真正成为“平台现状可视化首页”。

### 9.4 在终稿前保留风格选择

这个方向是对的，不要撤回。

因为客户经常对：
- 内容结构
- 视觉风格

是分开决策的。  
正确顺序是：
1. 先确认草稿结构和文字
2. 再在终稿前选风格

## 10. 对当前主线的判断

今天最重要的结论是：

- 我们当前方向已经对了
- 但是现在还只是“有 draft workflow”
- 还没有真正达到 Sandun 那种“规划本身就是产品价值”

真正要追的不是“多一个模板”或“再调一个 prompt”，而是：

1. `scenario composer`
2. `visual intent engine`
3. `hero-first planning`
4. `content / structure / style` 解耦
5. `module-level editing` 作为默认审改方式

## 11. 建议的下一步执行顺序

建议按这个顺序继续：

1. 经营/报表页 draft composer benchmark
2. 首页总览页视觉语法升级
3. 风格预览与终稿风格选择完善
4. 研究/投标/企业介绍 composer 继续补齐
5. 模块级 screenshot regression

---

参考来源：
- [Sandun 首页](https://sandun.cc/)
- [Gamma layout customization guide](https://gamma.app/explore/content/guides/gamma-ai-presentation-tool-flexible-layout-customization-guide)
- [Introducing Design Mode on v0](https://community.vercel.com/t/introducing-design-mode-on-v0/13225)
- [veasion/AiPPT](https://github.com/veasion/aippt)
