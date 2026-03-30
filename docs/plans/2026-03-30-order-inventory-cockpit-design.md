# Order Inventory Cockpit Design

Date: 2026-03-30

## Goal

Push order and inventory static-page reports from "correct but ordinary" into "client-ready operating cockpit" quality.

This plan combines:

- Codex `frontend-design` for high-quality shell and visual language exploration
- a new OpenClaw workspace skill `order-inventory-page-composer` for runtime static-page composition

The target output is a multi-channel, multi-SKU visual static page that stays grounded in library evidence and can refresh with changing source material.

## Why This Fits the Current System

This can be fused into the existing system cleanly because the current report stack is already layered:

- `knowledge-report-supply` narrows evidence
- `report-page-planner` defines sections, cards, charts, and evidence boundaries
- `knowledge-execution.ts` already injects planner context into page generation
- `knowledge-output.ts` already normalizes page output and handles conservative fallback
- the resume pipeline already proves the pattern with a dedicated second-pass composer

Relevant integration points already exist in:

- `apps/api/src/lib/knowledge-execution.ts`
- `apps/api/src/lib/report-planner.ts`
- `apps/api/src/lib/knowledge-output.ts`
- `skills/report-page-planner/`
- `skills/resume-page-composer/`

So the missing piece is not a new architecture. The missing piece is a better order/inventory final page composer and better shell references.

## Recommended Approach

Recommended approach: use `frontend-design` as an offline design accelerator, then add an order/inventory runtime composer.

This is better than a pure template-only approach because:

- template-only upgrades improve wording and section names, but they still plateau at "ordinary report page"
- a dedicated composer can consume structured evidence, planner constraints, and shell references together
- `frontend-design` can quickly produce 2-3 premium reference shells that the runtime composer can imitate conservatively

Do not make `frontend-design` a runtime dependency.

Keep the split clear:

- Codex `frontend-design` is for design-time shell exploration and sample assets
- OpenClaw `order-inventory-page-composer` is for runtime page composition inside the existing report chain

## Phase 1: Sample Shell Lab

Use `frontend-design` to create three order/inventory sample shells:

1. multi-channel operating cockpit
2. inventory and replenishment cockpit
3. SKU and category structure page

Deliverables:

- one premium shell description for each page
- preferred section sequence
- card language
- chart language
- tone guidance
- "bad pattern" exclusions

Store these as project-local references, not global skill state.

Recommended locations:

- `docs/plans/` for design rationale
- `skills/order-inventory-page-composer/references/` for runtime-facing shell guidance
- `apps/api/src/lib/default-project-samples.ts` for seeded showcase outputs

Success criterion for phase 1:

- the team can point to 2-3 shells and say "this is the quality bar"

## Phase 2: New Workspace Skill

Add:

- `skills/order-inventory-page-composer/SKILL.md`
- `skills/order-inventory-page-composer/references/output-schema.md`
- `skills/order-inventory-page-composer/references/layout-guidance.md`

Skill responsibility:

- compose the final order/inventory static page
- respect the supplied report plan
- prefer hard metrics and grouped evidence from project-side inputs
- improve narrative structure, card wording, and chart framing
- avoid inventing unsupported business numbers

The skill should return strict JSON only with:

- `summary`
- `cards`
- `sections`
- `charts`
- optional `warnings`

The skill should not perform retrieval by itself and should not decide business scope by itself.

## Phase 3: Project-Side Provider

Add a project-side provider similar to the resume path:

- `apps/api/src/lib/order-inventory-page-composer.ts`

Provider responsibilities:

- load the workspace skill bundle
- build compact order/inventory composition context
- pass the report plan, active envelope, and normalized evidence into the model
- return strict JSON page content
- surface debug metadata for artifacts and smoke runs

Recommended input model:

- request text
- report plan
- active envelope
- normalized order/inventory evidence summary
- channel aggregates
- SKU risk list
- replenishment priorities
- selected view: `generic | platform | category | stock`

Recommended output model:

- composed page content
- attempt mode
- warnings
- error message
- debug summary

## Phase 4: Execution Integration

Integrate in `apps/api/src/lib/knowledge-execution.ts` like this:

1. retrieve and narrow evidence with `knowledge-report-supply`
2. build the page plan with `report-page-planner`
3. if task is `order-static-page`, try `order-inventory-page-composer`
4. normalize with `knowledge-output.ts`
5. fallback only when the composed result is weak or invalid

This keeps the existing architecture intact and only adds one new specialized branch for order/inventory pages.

## Guardrails

- hard metrics must come from project-side evidence or aggregates
- the model may improve structure and language, not invent KPIs
- default to 4-5 cards and 2-4 charts, not chart overload
- treat channel and SKU labels as evidence-bound entities
- weak evidence should reduce ambition, not trigger decorative filler

## Testing and Rollout

Add tests for:

- provider context building
- strict JSON parsing
- generic/platform/category/stock page routing
- fallback gating when composer output is weak
- seeded sample outputs remaining presentable

Recommended files:

- `apps/api/test/order-inventory-page-composer.test.ts`
- `apps/api/test/knowledge-output-order-composer.test.ts`
- `apps/api/test/knowledge-execution-order-page.test.ts`

Rollout order:

1. ship design references
2. add workspace skill contract
3. add provider
4. integrate in execution path
5. refresh seeded examples
6. run local and remote sample artifacts

## Value Expectation

This should create value quickly because it improves the exact last mile that is currently weakest:

- current retrieval and planning already work
- current order pages now have better structure
- what is still missing is a premium final shell and stronger final composition

Expected immediate gains:

- fewer "table-looking static pages"
- stronger multi-channel and multi-SKU storytelling
- more reusable customer-facing order/inventory samples
- a cleaner path to future ERP-driven cockpit pages

## Recommendation

Proceed in this exact order:

1. Codex `frontend-design` sample shell lab
2. OpenClaw `order-inventory-page-composer`

Do not start with composer-first. Without a clear shell bar, the composer will likely produce pages that are structurally valid but still not premium enough.
