# OpenClaw Workspace Skills

This directory is the project-level OpenClaw workspace skills root.

Why it exists:

- Keep project skills versioned with the repo.
- Avoid patching OpenClaw core or relying on host-global skill folders.
- Make upgrades safer: OpenClaw can be upgraded independently while this repo keeps its own skills.

Recommended usage:

1. Put each custom skill under `skills/<skill-name>/`.
2. Each skill must contain a `SKILL.md`.
3. Keep project-specific scripts or assets inside the same skill folder.
4. Use clear, stable names for skills that represent product capabilities.

Planned skill families for this project:

- `document-deep-parse`
- `knowledge-report-supply`
- `datasource-body-extract`
- `template-learning`

Notes:

- Workspace skills are loaded from this repo's `skills/` directory.
- Installed registry skills may also land here.
- Do not store runtime secrets in this directory.
- Do not modify OpenClaw core for project behavior; extend via workspace skills instead.

Installed visualization skills:

- `data-visualization-studio`
  - Use for general charting, dashboards, and static visualization pages.
- `python-dataviz`
  - Use when chart artifacts should be generated directly from data as PNG, SVG, PDF, or interactive HTML.

Preferred routing for library-template outputs:

1. `knowledge-report-supply` for evidence and template guidance.
2. `data-visualization-studio` for chart planning, chart type selection, interaction level, and page-level visualization structure.
3. `python-dataviz` for direct chart generation from raw datasets when the output must be a real chart artifact such as PNG, SVG, PDF, or standalone HTML.

Operational note:

- `data-visualization-studio` is the preferred guidance layer for visualization choices.
- `python-dataviz` is the execution layer and is best used once chart inputs are stable enough to render.
- Keep the routing simple. Do not insert `report-page-planner` into the default visualization chain unless a task specifically benefits from it.
