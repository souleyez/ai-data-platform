# Report Page Planner Design

Date: 2026-03-29

## Goal

Build a stable planner layer for client-facing visual static-page reports.

The planner must make knowledge-grounded page generation more repeatable:

- user request -> report objective
- knowledge evidence -> page structure
- workspace skill contract -> planning constraints
- model -> bounded completion instead of freeform page invention
- report center dynamic pages -> auto-refresh with library material changes

## Requirements

Functional requirements:

- Default output is a visual static page, not a raw table.
- Knowledge-library evidence is the primary source of truth.
- The page should stay readable for customers and business readers.
- Dynamic pages should refresh as library materials change.
- The same planning logic should work in chat generation and report-center regeneration.

Non-functional requirements:

- Do not patch OpenClaw core.
- Keep planner behavior versioned inside this repo.
- Reuse workspace skill conventions already established in this project.
- Make weak-evidence behavior conservative and explicit.

## Recommended Architecture

Use a project-side planner module plus a repo workspace skill.

Components:

- `apps/api/src/lib/report-planner.ts`
  - builds `ReportPlan`
  - infers domain task hints when only group/request/template signals are available
  - produces a reusable page envelope and planning context
- `skills/report-page-planner/`
  - defines the planning contract in workspace-skill form
  - keeps planner guidance project-local and deployable with the repo
- `apps/api/src/lib/knowledge-execution.ts`
  - loads `knowledge-report-supply` and `report-page-planner`
  - builds supply first, then plan, then final page output
- `apps/api/src/lib/report-center.ts`
  - reuses planner output for dynamic page refresh
  - persists planner snapshot fields alongside source fingerprint

This matches current workspace-skill practice already used for:

- `skills/knowledge-report-supply`
- `skills/document-deep-parse`

## Why This Approach

This keeps the model in the right role.

The mature OpenClaw path here is not “let the model improvise a whole page,” but:

1. use project-side retrieval and evidence narrowing
2. use workspace skill contracts to constrain behavior
3. use the model for bounded synthesis and language polish
4. normalize the final page into a stable structure

That gives us a cleaner boundary:

- supply decides what evidence matters
- planner decides how the page should be organized
- generator fills the page within evidence and plan constraints

## Dynamic Refresh Strategy

Dynamic report-center pages should not only track document fingerprints.

They should also track planner snapshot metadata:

- audience
- objective
- template mode
- section titles
- card labels
- chart titles

This matters because a deploy can improve planning logic even when the underlying documents are unchanged. A dynamic page should be regenerated if either:

- source materials changed
- planner shape changed

## Current Phase

Phase 1:

- introduce `report-planner.ts`
- add workspace skill `report-page-planner`
- inject planner context into chat/page generation

Phase 2:

- reuse planner in report-center dynamic page refresh
- persist planner snapshot metadata with dynamic outputs

## Next Phases

Phase 3:

- expose planner metadata in report-center inspection/debug views
- show evidence count, library scope, and planner mode in UI or artifacts

Phase 4:

- add customer-facing mode vs learning-facing mode
- keep one evidence base but vary page tone and section emphasis

## Guardrails

- Never fabricate hard metrics, dates, milestones, or business claims.
- If evidence is weak, reduce page ambition instead of padding content.
- Do not let uploaded custom templates bypass evidence boundaries.
- Continue evolving this via workspace skills and project-side providers, not OpenClaw core patches.
