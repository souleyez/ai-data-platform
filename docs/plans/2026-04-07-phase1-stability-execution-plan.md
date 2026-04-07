# Phase 1 Stability Execution Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the current knowledge, datasource, report, and capture chain materially more stable without changing the three-phase roadmap or splitting the platform into a second system.

**Architecture:** Keep the existing monorepo and product boundaries intact, but tighten the first phase around four concrete outcomes: async long-task isolation, shared runtime state hardening, hot-path read performance, and production-grade observability. Reuse the existing `apps/worker` polling model, queue files, and operations overview instead of introducing premature distributed infrastructure in this phase.

**Tech Stack:** Fastify API, Next.js App Router, Node.js worker, local JSON-backed repositories, OpenClaw memory sync hooks, document parse/vector/report modules, audit center.

---

## Scope

This plan is the executable expansion of:

- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\docs\plans\2026-04-07-ai-data-platform-scaling-phased-plan.md`

It only covers:

- 第一阶段：优化提效与稳定

It does not include:

- Redis introduction
- object storage migration
- multi-instance deployment
- full queue middleware replacement

## Guardrails

- 不重做现有知识资产主链
- 不把 Markdown 或导出视图提升成主数据源
- 不让首页、文档中心、报表中心重新背上同步重任务
- 不为了“稳定性”提前拆成重微服务
- 不把阶段二、阶段三的问题提前塞进阶段一

## Phase 1 outcome targets

When this plan is complete:

- 首页、文档中心、报表中心的读链不再隐式触发重任务
- 深解析、库级编译摘要、采集执行、dataviz 渲染都有明确状态和失败面
- 运行态 JSON 的职责边界更清楚，后续迁共享存储时不需要再二次拆分
- 运营总览页可以直接看见任务积压、耗时、失败率和最近异常
- 发布时有固定回归集和最低验证门槛，不再凭感觉判断“已经稳了”

### Task 1: Freeze Hot Read Paths and Stop Background Work from Leaking into UI Reads

**Files:**
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-route-loaders.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-route-read-operations.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-store-loaders.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\report-center.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\operations-overview.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\web\app\documents\page.js`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\web\app\reports\page.js`
- Test: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\document-route-read-operations.test.ts`
- Test: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\operations-overview.test.ts`

**Step 1: Write failing read-path regression tests**

Cover:

- documents index load does not enqueue deep parse when explicitly reading
- report center read does not trigger dataviz rendering or template recompute
- operations overview uses existing state and read models instead of forcing rebuilds

**Step 2: Split read-only loaders from background-triggering loaders**

Make the distinction explicit:

- read paths only read cache/state
- mutation paths and worker ticks are the only places that enqueue or recompute

**Step 3: Add lightweight timing and source markers to hot read responses**

Return metadata such as:

- `cacheHit`
- `loadedFrom`
- `generatedAt`
- `durationMs`

These fields should be safe for UI and audit display.

**Step 4: Verify**

Run:

- `corepack pnpm --filter api exec tsx --test test/document-route-read-operations.test.ts test/operations-overview.test.ts`
- `corepack pnpm --filter api build`
- `corepack pnpm --filter web build`

Expected:

- read-path tests pass
- no hot read endpoint depends on background enqueue side effects

**Step 5: Commit**

Commit message:

- `stabilize hot read paths and read telemetry`

### Task 2: Harden Long-Task Queues Around Deep Parse, Library Compilation, Dataviz, and Datasource Runs

**Files:**
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-deep-parse-queue.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\openclaw-memory-sync.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\library-knowledge-pages.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\report-dataviz.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\datasource-execution.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\worker\src\index.ts`
- Create: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\task-runtime-metrics.ts`
- Create: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\document-deep-parse-queue.test.ts`
- Create: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\openclaw-memory-sync.test.ts`
- Test: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\report-dataviz.test.ts`
- Test: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\datasource-execution.test.ts`

**Step 1: Write failing queue-behavior tests**

Cover:

- deep-parse queue recovery after interrupted processing
- memory sync dedupe and rerun behavior
- dataviz timeout and renderer failure bookkeeping
- datasource run state transitions for success, partial, and failed runs

**Step 2: Introduce a shared task runtime metric shape**

Track for each long task family:

- queued count
- processing count
- last success time
- last failure time
- last error message
- average recent duration
- retry count

Use a thin local state file in phase 1, not a new database layer.

**Step 3: Normalize worker tick semantics**

Ensure worker ticks:

- do not silently swallow repeated failure without status updates
- cap work per tick
- expose when a task family is skipped because another run is already active
- write structured summary entries consumable by operations overview

**Step 4: Add explicit timeout and backoff policy**

At minimum define constants and state transitions for:

- deep parse retry ceiling
- dataviz timeout and retry ceiling
- datasource run retry ceiling for scheduled tasks
- memory sync rerun debounce window

**Step 5: Verify**

Run:

- `corepack pnpm --filter api exec tsx --test test/document-deep-parse-queue.test.ts test/openclaw-memory-sync.test.ts test/report-dataviz.test.ts test/datasource-execution.test.ts`
- `corepack pnpm --filter api build`

Expected:

- long-task state is observable and deterministic
- worker loop reports task-family results consistently

**Step 6: Commit**

Commit message:

- `harden long task runtime and worker telemetry`

### Task 3: Split Runtime State by Responsibility and Reduce Single-File Coupling

**Files:**
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\datasource-state-repository.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\audit-center.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\web-capture.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\report-center.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\openclaw-memory-sync.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\document-store-loaders.ts`
- Create: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\runtime-state-manifest.ts`
- Create: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\runtime-state-repositories.test.ts`

**Step 1: Write failing repository-boundary tests**

Cover:

- datasource definitions and datasource runs evolve independently
- audit snapshot can be rebuilt without mutating capture task runtime
- memory sync status is independent from library compilation content
- report-center state can be read without mutating output artifacts

**Step 2: Introduce a runtime state manifest**

List each runtime file with:

- owner module
- mutable by read path or mutation path
- migration target in phase 2
- backup/repair strategy

This manifest becomes the source of truth for later shared-storage migration.

**Step 3: Split mixed state files where needed**

Prefer this direction:

- definitions separate from execution history
- execution history separate from lightweight telemetry
- content artifacts separate from status files

Do not migrate storage technology yet; just reduce coupling.

**Step 4: Add repository-level corruption guards**

For each JSON repository:

- validate top-level payload shape
- fall back safely on partial corruption
- preserve previous snapshot before overwrite where practical

**Step 5: Verify**

Run:

- `corepack pnpm --filter api exec tsx --test test/runtime-state-repositories.test.ts test/datasource-execution.test.ts test/report-governance.test.ts`
- `corepack pnpm --filter api build`

Expected:

- runtime state responsibilities are explicit
- one corrupted runtime file does not cascade into unrelated features

**Step 6: Commit**

Commit message:

- `split runtime state responsibilities for phase1`

### Task 4: Turn Operations Overview into the Phase 1 Stability Console

**Files:**
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\operations-overview.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\routes\datasources.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\routes\audit.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\web\app\audit\page.js`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\web\app\datasources\datasource-run-card.js`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\web\app\datasources\datasource-managed-card.js`
- Create: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\operations-overview-telemetry.test.ts`

**Step 1: Write failing overview telemetry tests**

Cover:

- deep parse queue summary presence
- memory sync summary presence
- capture task error totals
- datasource run duration and failure summaries
- report render summary including dataviz failures

**Step 2: Extend operations overview payload**

Add a dedicated phase-1 stability block for:

- task backlog
- last failures
- recent durations
- failure-rate counters
- stale state warnings

**Step 3: Surface the same metrics in existing UI cards**

Do not create a new product area. Reuse:

- audit page
- datasource cards
- operations overview payload consumers

**Step 4: Add operator-facing thresholds**

At minimum flag:

- deep parse backlog too large
- repeated datasource failures
- memory sync stale for too long
- dataviz renderer unavailable

**Step 5: Verify**

Run:

- `corepack pnpm --filter api exec tsx --test test/operations-overview-telemetry.test.ts`
- `corepack pnpm --filter web build`

Expected:

- operators can see queue and failure state without reading raw JSON files

**Step 6: Commit**

Commit message:

- `surface phase1 stability telemetry in operations overview`

### Task 5: Add Release Gates, Soak Checks, and a Fixed Phase 1 Regression Suite

**Files:**
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\package.json`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\README.md`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\docs\plans\2026-04-07-ai-data-platform-scaling-phased-plan.md`
- Create: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\tools\verify-phase1-stability.ps1`
- Create: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\docs\plans\2026-04-07-phase1-stability-release-checklist.md`

**Step 1: Define the fixed regression command set**

Include at least:

- governance and library summary tests
- datasource execution tests
- deep parse queue tests
- footfall and table parsing tests
- dataviz tests
- api build
- web build

**Step 2: Add a soak-style verification script**

The script should:

- run the fixed regression set
- print the current git sha
- print key runtime file locations
- fail if critical task telemetry shows stale or failed state

**Step 3: Document release gate and rollback rules**

Specify:

- when a release is blocked
- what can be tolerated as warning
- what runtime artifacts to inspect before rollback
- how to validate worker recovery after restart

**Step 4: Update the phase summary doc with execution linkage**

In the three-phase document, add a short pointer from phase 1 to this execution plan and release checklist.

**Step 5: Verify**

Run:

- `powershell -ExecutionPolicy Bypass -File "C:\Users\soulzyn\Desktop\codex\ai-data-platform\tools\verify-phase1-stability.ps1"`

Expected:

- a single command can be used before publish or deploy

**Step 6: Commit**

Commit message:

- `add phase1 release gates and stability verification`

## Recommended execution order

Execute tasks in this order:

1. Task 1: Freeze hot read paths
2. Task 2: Harden long-task queues
3. Task 3: Split runtime state responsibilities
4. Task 4: Turn operations overview into the stability console
5. Task 5: Add release gates and soak checks

## Suggested delivery cadence

Week 1:

- finish Task 1
- finish Task 2

Week 2:

- finish Task 3
- finish Task 4

Week 3:

- finish Task 5
- run soak verification
- deploy with rollback checklist ready

## Phase 1 completion checklist

- read-only pages no longer enqueue heavy background work implicitly
- deep parse, datasource, capture, memory sync, and dataviz all expose stable status and failure state
- runtime JSON responsibilities are documented and separated enough for phase 2 migration
- audit or operations pages expose actionable operator signals
- release checklist and one-command verification exist and are used before publish

Plan complete and saved to `docs/plans/2026-04-07-phase1-stability-execution-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
