# OpenClaw Memory-First Knowledge Chat Design

Date: 2026-03-30

## Goal

Reduce explicit project-side orchestration in knowledge chat and make OpenClaw behave like it always knows the current library landscape.

The target interaction model is:

- OpenClaw long-term memory holds the live catalog of libraries, documents, and audit exclusions
- normal chat uses that memory directly for library awareness and catalog-style answers
- only detail-demanding requests and output requests trigger a project-side skill to fetch live document detail
- project-side code becomes thinner and more infrastructural

This is a design shift, not an OpenClaw core patch.

## Why Change

The current system works, but the knowledge-chat path still carries too much explicit routing and prompt assembly:

- library inference happens in project code
- intent routing happens in project code
- follow-up document context is inferred in project code
- knowledge output paths load multiple workspace skills before the model sees the request

This gives strong control, but it also creates visible UX drift:

- users sometimes need to repeat the library name
- the same request can feel like it "knows the library" in one round and "forgets it" in another
- the model learns about system state only after local orchestration finishes

The new design makes OpenClaw aware of the knowledge estate all the time, instead of only at request time.

## Recommended Architecture

Recommended approach: move to a memory-first directory model and keep only a thin project-side execution shell.

Use three layers:

1. OpenClaw long-term memory as the catalog brain
2. project-side thin infrastructure shell
3. on-demand skill execution for live detail and formal output

This is the correct middle ground between:

- current heavy orchestration
- an over-simplified "let memory do everything" model

Do not make long-term memory the final source of truth for document facts.

Use it as the durable directory and availability layer.

## What Goes Into Long-Term Memory

Store only stable, index-like facts:

- library count
- each library key, label, purpose, and approximate document count
- each library's recent update time
- each document's id, library key, title, short abstract, and update time
- document usability state such as:
  - available
  - audit-excluded
  - partially usable
- exclusion reason and last audit time
- representative document titles for each library
- suggested question types for each library

This lets OpenClaw always know:

- what libraries exist
- what changed recently
- what was excluded
- which library is likely relevant

## What Must Stay Out of Long-Term Memory

Do not store these as authoritative long-term memory:

- full document bodies
- large evidence-chunk payloads
- volatile structured extraction results
- derived business metrics that should be recomputed
- page plans, report shells, or temporary prompt artifacts
- unbounded upload-session context

These should remain project-side, fetched live when needed.

## Runtime Behavior

The target runtime rule is simple:

- catalog questions: memory only
- document-detail questions: trigger a detail-fetch skill
- output questions: trigger an output skill

Examples:

- "系统里有哪些简历库" -> memory only
- "最近上传了哪些简历" -> memory only
- "最新那份简历最近公司是什么" -> detail skill
- "把最近几份简历做成对比表" -> output skill
- "做一份订单库存驾驶舱" -> output skill

This keeps normal chat light and makes heavy retrieval happen only when evidence depth is actually required.

## Required Thin Infrastructure

Project-side code should still keep four responsibilities:

1. memory synchronization
2. audit enforcement
3. live document-detail retrieval
4. output normalization and safety fallback

These are not optional.

Without them, memory and real storage will drift, excluded documents will leak back in, and formal outputs will become harder to trust.

## Proposed Component Changes

### Keep and Reframe

- `apps/api/src/lib/document-libraries.ts`
  - stays as the source for live library metadata
- `apps/api/src/lib/document-store.ts`
  - stays as the source for live document facts and detail retrieval
- `apps/api/src/lib/knowledge-execution.ts`
  - stays, but only for detail/output execution
- `apps/api/src/lib/knowledge-output.ts`
  - stays for output normalization and fallback
- `apps/api/src/lib/workspace-skills.ts`
  - stays for explicit skill bundle loading

### Thin Down

- `apps/api/src/lib/knowledge-chat-dispatch.ts`
  - reduce from heavy routing hub to a light chat gateway
- `apps/api/src/lib/knowledge-intent.ts`
  - keep only coarse classification: catalog vs detail vs output
- `apps/api/src/lib/knowledge-plan.ts`
  - stop using it as the primary library-inference engine for chat
- `apps/api/src/lib/knowledge-context.ts`
  - reduce follow-up heuristics once memory tracks recent uploads and detail candidates
- `apps/api/src/lib/orchestrator.ts`
  - keep gateway handling and fallback, but remove knowledge-specific branching weight where possible

### Add

- `apps/api/src/lib/openclaw-memory-catalog.ts`
  - builds library and document memory snapshots
- `apps/api/src/lib/openclaw-memory-sync.ts`
  - syncs catalog snapshots into OpenClaw long-term memory
- `apps/api/src/lib/knowledge-detail-fetch.ts`
  - live detail fetch for specific document ids or memory-selected candidates
- `skills/knowledge-detail-fetch/`
  - detail-answer contract

## How Skill Triggering Changes

Current model:

- many requests are routed into knowledge mode before the model sees enough system state
- output generation loads multiple skills early

Target model:

- OpenClaw uses memory to decide whether the request is about known libraries/documents
- only when the request needs detail or formal output do we trigger a skill

This means the model trigger point moves later:

- not at "does this look like knowledge chat?"
- but at "does this need live evidence?"

That should improve perceived continuity in normal conversation.

## Migration Plan

### Phase 1: Catalog Memory

Build a stable memory snapshot format for:

- libraries
- document cards
- audit exclusions

Then add one-way sync from project storage into OpenClaw long-term memory.

Deliverables:

- memory snapshot schema
- sync job
- manual refresh command
- basic trace that shows last sync time and item counts

### Phase 2: Thin Chat Router

Change chat classification to only three buckets:

- catalog
- detail
- output

At this stage, keep existing output flow intact and only simplify the non-output path.

Deliverables:

- memory-first catalog answering
- reduced library-match branching
- reduced follow-up heuristics

### Phase 3: Live Detail Skill

Add a dedicated detail skill that takes:

- document ids
- current prompt
- optional evidence focus

and returns:

- concise detail answer
- cited fields or evidence snippets

This replaces most current detail-question orchestration.

### Phase 4: Output-Only Skill Expansion

Keep formal output on the current skill path, but make it start from memory-selected documents instead of project-side library guessing.

That means:

- memory picks likely documents
- project fetches live details for those ids
- output skill composes the answer/page/table

### Phase 5: Cleanup

After the new path is stable, delete or heavily reduce the old routing logic.

Do not cleanup early.

Only cleanup after:

- memory sync is stable
- detail skill is live
- output path is proven against the current smoke set

## Cleanup Scope

The goal is not "delete everything old."

The cleanup goal is:

- remove duplicated library-inference logic
- remove duplicated recent-upload heuristics
- remove prompt scaffolding that becomes redundant once memory carries the catalog
- keep audit enforcement
- keep output normalization
- keep deterministic fallback for weak model outputs

Expected cleanup candidates:

- large parts of `knowledge-context.ts`
- large parts of `knowledge-plan.ts`
- parts of `knowledge-chat-dispatch.ts`
- knowledge-specific branching in `orchestrator.ts`

Expected non-cleanup areas:

- `document-store.ts`
- `document-libraries.ts`
- `knowledge-output.ts`
- output composers
- audit-related logic

## Risks

### Risk 1: Memory Drift

If memory sync lags behind storage, OpenClaw will "remember" the wrong catalog.

Mitigation:

- version memory snapshots
- record last sync time
- add forced refresh on upload/audit completion

### Risk 2: Memory Becomes a Fake Source of Truth

If prompts rely on memory-only facts for deep questions, the model will answer against stale summaries.

Mitigation:

- require live detail fetch for detail/output classes
- keep memory cards intentionally shallow

### Risk 3: Over-cleanup

If current orchestration is removed before replacement is stable, quality will drop sharply.

Mitigation:

- replace in phases
- keep old path behind a feature flag until remote smoke passes

## Success Criteria

The migration is successful when:

- OpenClaw consistently knows which libraries and recent documents exist without users repeating them
- normal catalog questions no longer need heavy project-side routing
- detail answers and outputs still use live evidence
- audit exclusions remain visible and enforced
- code in knowledge chat becomes materially simpler

## Recommendation

Proceed with a phased migration, not a rewrite.

Recommended order:

1. catalog memory schema and sync
2. thin chat router
3. detail-fetch skill
4. output path pivot to memory-selected documents
5. cleanup of obsolete orchestration

Do not remove current output orchestration first.

The safest high-value move is to make memory the always-on directory layer, then shrink orchestration around it.
