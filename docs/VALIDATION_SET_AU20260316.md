# Validation Set - AU20260316

## 测试材料位置

- 路径：`/mnt/c/Users/soulzyn/Desktop/au20260316`
- 用途：作为当前 `ai-data-platform` 论文 / 技术文档主线的第一批真实验证材料

## 第一轮文件盘点

### A. 当前可直接解析的 PDF（无需 OCR）

1. `(2022减脂、运动)Probiotic Strains Isolated from an Olympic Women's Weightlifting Gold Medalist Increase Weight Loss and Exercise Performance in a Mouse Model.pdf`
2. `20 IBS FOS.pdf`
3. `后生元白皮书.pdf`
4. `（2014 抗敏）MP137 Evaluation of the Effect of Lactobacillus paracasei (HF.A00232) in Children (6-13） with Perennial Allergic Rhinitis.pdf`
5. `（2021）（脑部健康）Administration of Bifidobacterium breve Improves the Brain Function of Aβ 1-42-Treated Mice via the Modulation of the Gut Microbiome.pdf`
6. `（调节肠道炎症和功能）Bifidobacterium lactis BL-99 modulates intestinal inflammation and functions in zebrafish models.pdf`

### B. 当前疑似需要 OCR 的 PDF

1. `137 抗抑郁.PDF`
2. `（2012） Evaluation of Efficacy and Safety of Lactobacillus Rhamnosus as an Add-on Therapy in Children(7-12 Years Old) with Perennial Allergic Rhinitis An 8 Weeks, Double-blind, Randomized, Placebo-controlled St.pdf`

### C. 暂未纳入当前解析链路的其他文件

- `凝结芽孢杆菌CCFM1041.docx`
- `新建 DOCX 文档.docx`
- `智能化需求.docx`
- `智能化交流.pptx`
- `微信图片_20260128134627_20_665.jpg`

## 第一轮验证目标

1. 验证当前 PDF 文本提取链路对真实材料是否足够可用
2. 验证文档分类是否能稳定区分 paper / technical / other
3. 验证问答命中、回答质量、引用来源是否足够可信
4. 找出最值得优先修复的一类问题

## 建议问题清单（第一版）

### 通用摘要类

1. `请概括 au20260316 这批资料主要覆盖哪些健康主题？`
   - 预期：命中多篇论文/白皮书，回答应提到减脂运动、肠道功能、过敏/鼻炎、脑功能、后生元等

2. `这批资料里哪些更像论文研究，哪些更像行业白皮书或业务资料？`
   - 预期：至少识别 `后生元白皮书.pdf` 为白皮书，其余若干英文 PDF 为论文型

### 单篇文档理解类

3. `请总结《后生元白皮书》的核心内容、主要价值和适用场景。`
   - 预期命中：`后生元白皮书.pdf`
   - 观察点：是否能给出结构化总结，而不是泛泛一句话

4. `关于 Olympic Women's Weightlifting Gold Medalist 那篇研究，主要结论是什么？`
   - 预期命中：`(2022减脂、运动)...pdf`
   - 观察点：是否能提到 weight loss / exercise performance / mouse model

5. `20 IBS FOS 这篇资料主要研究什么问题？结论是什么？`
   - 预期命中：`20 IBS FOS.pdf`
   - 观察点：是否能抓到 IBS / FOS / 研究结论

6. `Bifidobacterium breve 改善脑功能那篇文献，实验对象和核心发现是什么？`
   - 预期命中：`（2021）（脑部健康）Administration of Bifidobacterium breve...pdf`
   - 观察点：是否能提到 Aβ 1-42 treated mice / gut microbiome / brain function

7. `BL-99 调节肠道炎症和功能那篇资料里，用的是什么模型？主要结果是什么？`
   - 预期命中：`（调节肠道炎症和功能）Bifidobacterium lactis BL-99...pdf`
   - 观察点：是否能识别 zebrafish models

### 对比归纳类

8. `这批资料里，哪些更偏减脂/运动，哪些更偏抗敏，哪些更偏肠道炎症或脑健康？`
   - 预期：多文档归纳能力正常，且不要混淆主题

9. `请对比后生元白皮书和几篇英文论文，它们在内容类型和用途上有什么区别？`
   - 预期：能区分综述/白皮书 vs 实验研究论文

10. `如果我要快速了解益生菌/后生元在不同健康场景下的证据类型，这批资料能怎么分组？`
   - 预期：按主题或证据类型分组，回答具备一定结构化能力

### 引用与可信度类

11. `请回答时附上你主要参考了哪些资料。`
   - 预期：sources / references 清晰，不乱引

12. `如果材料不足，请明确说不确定，不要编造。`
   - 预期：模型在证据不足时保守回答

## 第一轮打分维度

每个问题记录以下结果：

- 命中文档是否正确
- 是否跨类误召回
- 回答是否够具体
- 是否有明显幻觉
- 来源引用是否清楚
- 是否像“文档分析”而不是“通用聊天”

建议评级：

- `PASS`：命中正确，回答具体，引用可信
- `PARTIAL`：基本命中，但回答较泛或引用不清
- `FAIL`：命中错误、明显幻觉、或无法支撑结论

## 当前链路观察

- `apps/api/src/lib/orchestrator.ts` 当前会把匹配到的文档摘要/摘录拼进上下文，再送给 OpenClaw Gateway
- 因此这轮测试的关键，不只是大模型回答本身，还包括：
  1. 文档匹配是否准
  2. 摘要/摘录是否足够支撑回答
  3. 前端 sources / references 是否能把依据展示清楚

## 下一步

1. 把这批材料接入当前扫描目录或配置到 `DOCUMENT_SCAN_DIR`
2. 跑 `/api/documents` 和 `/api/chat` 的第一轮验证
3. 根据结果确定第一优先修复项
