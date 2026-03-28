# Platform Stabilization and Growth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stabilize the current document, datasource, retrieval-supply, and shared-template architecture so the platform can continue evolving without frequent rewrites.

**Architecture:** Keep OpenClaw untouched and continue treating the project as the orchestration, retrieval, parsing, datasource, and template layer. Prioritize backend and workflow clarity over new surface-area UI work, and keep the document center fast while expanding datasource and output capabilities.

**Tech Stack:** Fastify API, Next.js App Router, Node.js worker, local JSON-backed config/state, OpenClaw gateway, project-side parsing/retrieval/template modules.

---

## Scope and priorities

This roadmap is for the current post-`57aff8f` codebase. It assumes these product boundaries stay fixed:

- 首页继续是单入口对话
- 文档中心不再承接新的数据源入口
- 数据源页继续作为采集工作台
- 报表中心只保留模板和已出报表
- OpenClaw 本体不改，只做项目侧适配

## Guardrails

- 不做全仓大重构
- 不回退文档中心性能优化
- 不重新引入重编排对话状态机
- 不把知识库输出重新做成重按钮驱动产品
- 不把运行态文件提交进仓库

### Task 1: Stabilize Datasource Execution as the Primary Growth Line

**Files:**
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\datasource-execution.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\datasource-service.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\routes\datasources.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\datasource-provider.ts`
- Test: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\orchestrator.test.ts`
- Create: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\datasource-execution.test.ts`

**Step 1: Add datasource execution regression tests**

Cover:

- `web_public` run creation
- `upload_public` run creation
- paused datasource not executing
- run summaries carrying `documentLabels` and `libraryLabels`

**Step 2: Make datasource runs a complete read model**

Ensure each run has consistent:

- `datasourceName`
- `libraryLabels`
- `documentLabels`
- `summary`
- `status`

**Step 3: Protect document-center performance**

Verify datasource execution does not:

- trigger document rescans on page load
- trigger deep parse synchronously
- block document listing routes

**Step 4: Verify**

Run:

- `corepack pnpm --filter api build`
- `corepack pnpm --filter api test`

Expected:

- build passes
- datasource execution tests pass

**Step 5: Commit**

Commit message:

- `stabilize datasource execution read model`

### Task 2: Turn Database and ERP Connectors into Real Read-Only Skeletons

**Files:**
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\datasource-database-connector.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\datasource-database-provider.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\datasource-erp-connector.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\datasource-erp-provider.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\datasource-credentials.ts`
- Create: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\datasource-database.test.ts`
- Create: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\datasource-erp.test.ts`

**Step 1: Add connector planning tests**

Cover:

- PostgreSQL planning
- MySQL planning
- ERP API planning
- ERP session planning
- warning generation for missing auth or objects

**Step 2: Implement read-only execution plans**

Do not execute arbitrary SQL. Support only:

- whitelisted read-only object selection
- template-based read-only query plans
- module-scoped ERP extraction plans

**Step 3: Surface safe execution summaries**

Return execution summaries that clearly say:

- what would be read
- from where
- under what auth mode

**Step 4: Verify**

Run:

- `corepack pnpm --filter api build`
- `corepack pnpm --filter api test`

Expected:

- database and ERP tests pass
- no write capability is introduced

**Step 5: Commit**

Commit message:

- `add readonly database and erp connector skeletons`

### Task 3: Finish the Retrieval-Supply Refactor

**Files:**
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\orchestrator.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\knowledge-evidence.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\knowledge-execution.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\openclaw-adapter.ts`
- Test: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\orchestrator.test.ts`

**Step 1: Add tests for time/content filtering**

Cover:

- today / this week / this month
- recent upload filtering
- content-focus narrowing
- explicit negation of knowledge intent

**Step 2: Keep orchestration thin**

Ensure `orchestrator.ts` only does:

- general answer routing
- knowledge-driven answer routing
- knowledge-driven output routing

Move any remaining evidence assembly or repair logic out if found.

**Step 3: Unify knowledge answer and knowledge output supply**

Both should share:

- knowledge library selection
- time/content file filtering
- trimmed relevant chat history
- evidence bundle generation

**Step 4: Verify**

Run:

- `corepack pnpm --filter api build`
- `corepack pnpm --filter api test -- orchestrator`

Expected:

- answer and output both obey file filtering
- negation phrases force general answer path

**Step 5: Commit**

Commit message:

- `thin orchestration and unify retrieval supply`

### Task 4: Providerize Deep Parse Without Touching OpenClaw

**Files:**
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-advanced-parse-provider.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-deep-parse-queue.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-store.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-cloud-enrichment.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\worker\src\index.ts`
- Test: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\document-store.test.ts`
- Create: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\document-deep-parse.test.ts`

**Step 1: Add deep-parse queue tests**

Cover:

- quick document queued for deep parse
- queue recovery after restart
- latest uploads prioritized ahead of backlog

**Step 2: Make provider boundaries explicit**

Split responsibilities into:

- local fallback parse
- cloud enrichment hook
- deep parse result merge

**Step 3: Preserve quick-path guarantees**

Verify uploads still:

- return quickly
- show up immediately in documents list
- never wait for deep parse completion

**Step 4: Verify**

Run:

- `corepack pnpm --filter api build`
- `corepack pnpm --filter api test`

Expected:

- deep parse is async and recoverable
- quick parse path remains fast

**Step 5: Commit**

Commit message:

- `providerize deep parse pipeline`

### Task 5: Deepen Shared Template Library and Output Normalization

**Files:**
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\report-center.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\knowledge-template.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\knowledge-output.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\routes\reports.ts`
- Test: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\orchestrator.test.ts`
- Create: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\report-center.test.ts`

**Step 1: Add template-envelope tests**

Cover:

- shared static-page default
- shared PPT default
- shared table default
- resume/bids/order/formula specialization

**Step 2: Normalize output around template intent**

Ensure output repair always uses:

- fixed columns for tables
- fixed sections for pages
- template descriptions and reference file names as context

**Step 3: Support many templates per mode cleanly**

Keep template library global, with:

- multiple static-page templates
- multiple PPT templates
- multiple table templates
- multiple document templates

**Step 4: Verify**

Run:

- `corepack pnpm --filter api build`
- `corepack pnpm --filter api test`

Expected:

- template selection remains global
- output normalization stays stable

**Step 5: Commit**

Commit message:

- `strengthen shared template envelopes`

### Task 6: Make Report Revision a First-Class Home Workflow

**Files:**
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\web\app\components\InsightPanel.js`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\web\app\use-home-page-controller.js`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\web\app\home-api.js`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\report-center.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\routes\reports.ts`

**Step 1: Tighten feedback state**

Ensure homepage revision flow has only:

- adjusting
- success
- latest failure

**Step 2: Keep report center clean**

Do not reintroduce revision UI in report center.

**Step 3: Align revision with supply-layer philosophy**

Revision should:

- reuse existing report structure
- reuse template envelope
- send only needed report material to the model

**Step 4: Verify**

Run:

- `corepack pnpm --filter api build`
- `corepack pnpm exec next build --debug`

Expected:

- homepage report revision remains available
- report center remains template + outputs only

**Step 5: Commit**

Commit message:

- `stabilize homepage report revision flow`

### Task 7: Add Regression Coverage for the Mainline

**Files:**
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\tools\smoke-local.mjs`
- Create: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\datasource-planning.test.ts`
- Create: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\report-template.test.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\package.json`

**Step 1: Expand smoke coverage**

Cover:

- upload and auto-ingest
- datasource creation and run
- knowledge-driven answer filtering
- shared template report creation

**Step 2: Add targeted unit tests**

Add tests for:

- datasource planning in Chinese prompts
- shared template hint generation
- knowledge intent negation

**Step 3: Document validation commands**

Use a stable validation sequence:

- `corepack pnpm --filter api build`
- `corepack pnpm exec next build --debug`
- `corepack pnpm smoke:local`

**Step 4: Verify**

Expected:

- local smoke completes without breaking documents or datasources pages

**Step 5: Commit**

Commit message:

- `expand regression coverage for mainline flows`

## Recommended sequence

Execute tasks in this order:

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6
7. Task 7

## Expected end state

After this roadmap, the platform should have:

- a stable datasource workbench with real provider skeletons
- a thin retrieval-supply layer instead of heavy local orchestration
- quick/deep parse split preserved and clearer
- a global shared template library that governs output more tightly
- homepage-centered report revision
- regression coverage for the most important workflows

## Non-goals for this roadmap

- full OpenClaw skill marketplace integration
- aggressive UI redesign across the whole product
- rebuilding the document center
- turning database or ERP providers into full production-grade connectors in one pass

Plan complete and saved to `docs/plans/2026-03-28-platform-stabilization-and-growth.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
