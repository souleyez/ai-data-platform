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
- `report-page-planner`
- `datasource-body-extract`
- `template-learning`

Notes:

- Workspace skills are loaded from this repo's `skills/` directory.
- Installed registry skills may also land here.
- Do not store runtime secrets in this directory.
- Do not modify OpenClaw core for project behavior; extend via workspace skills instead.
