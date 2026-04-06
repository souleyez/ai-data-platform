# AI Data Platform Agent Notes

This repository uses repo-local OpenClaw workspace skills under `skills/`.

## Default skill routing

When the task is a library-template output, knowledge-backed static page, dashboard, or client-facing visual report:

1. Use `knowledge-report-supply` to gather bounded evidence and template guidance.
2. Prefer `data-visualization-studio` for general charting, dashboard sections, and static visualization page output.
3. Prefer `python-dataviz` when the task needs direct chart generation artifacts such as PNG, SVG, PDF, or Plotly HTML from raw data.
4. Do not add an extra planner skill layer unless a specific task proves the simpler route is insufficient.

## Dataviz workflow

For library-template static pages, use this sequence by default:

1. `knowledge-report-supply`
   Gather bounded facts, aggregates, document evidence, and template hints.
2. `data-visualization-studio`
   Decide chart family, interaction level, and output format for each visualization block.
3. `python-dataviz`
   Generate concrete chart artifacts only when the page needs image, SVG, PDF, or standalone HTML outputs from structured data.

Prefer `data-visualization-studio` over `report-page-planner` for page-level dataviz decisions.
Prefer `python-dataviz` for chart production from CSV, JSON, or computed aggregates.
If the environment lacks pandas, seaborn, plotly, or kaleido, fall back to static page composition without external chart artifact generation.

## Existing project-specific composers

- Use `order-inventory-page-composer` for order or inventory cockpit pages.
- Use `resume-page-composer` and `resume-display-profile` for resume-facing static pages.

## Guardrails

- Keep hard facts evidence-grounded.
- Do not invent KPIs, rates, or deltas that are not present in the supplied evidence.
- Prefer fewer high-signal charts over decorative chart volume.
- If evidence is weak, reduce the page ambition instead of filling with generic BI content.
