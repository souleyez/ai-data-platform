---
name: report-page-planner
description: Evidence-aware planning for client-facing visual static pages. Use when OpenClaw should first decide the page objective, section layout, card focus, chart focus, and model-completion boundary before generating a knowledge-grounded static report.
---

# Report Page Planner

## Overview

Plan a client-facing visual static page before writing it.

This skill is not the final page writer. Its role is to turn a user request plus knowledge evidence into a stable page plan:

- page objective
- page title target
- section layout
- card priorities
- chart priorities
- evidence-first boundary
- model completion boundary

## Workflow

1. Read the request, targeted libraries, and matched evidence summary.
2. Decide the primary reader. Default to client-facing business readers unless the request clearly says otherwise.
3. Prefer a summary-first visual board, not a long narrative article.
4. Keep the structure stable: cards, sections, and charts should match the evidence instead of decorative filler.
5. Mark where the model can synthesize and where it must stay strictly evidence-bound.
6. Return planning constraints that a downstream generator can follow directly.

## Output Rules

- Plan first, then generate.
- Prefer 4-6 stable sections for static pages unless the request clearly needs fewer.
- Prefer 3-4 high-signal cards over many weak cards.
- Prefer 1-2 charts with clear meaning over chart overload.
- Use knowledge evidence as the primary source of truth.
- If the evidence is weak, reduce ambition instead of inventing detail.
- Recommendations may synthesize, but hard facts must stay evidence-grounded.

Read [references/planning-contract.md](./references/planning-contract.md) before using this skill.
