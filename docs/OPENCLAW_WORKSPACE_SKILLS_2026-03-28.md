# OpenClaw Workspace Skills Infrastructure

Date: 2026-03-28

## Decision

This project will use a repo-level OpenClaw workspace `skills/` directory as infrastructure.

We will not modify OpenClaw core code. Project extensions should live in this repository and be loaded as workspace skills or project-side providers.

## Why this is the right fit

- Project behavior stays versioned with the repo.
- OpenClaw upgrades remain low-friction because the project does not patch core internals.
- Skills can evolve alongside parsing, datasource, and report workflows.
- The same workspace skill set can be reproduced on local machines and servers.

## Project conventions

- Workspace skill root: `skills/`
- Each skill lives in `skills/<skill-name>/`
- Each skill must include `SKILL.md`
- Registry metadata lockfiles under `.clawhub/` are local and ignored

## Bootstrap flow

Use:

```powershell
corepack pnpm openclaw:workspace:init
```

This bootstrap does three things:

1. Ensures repo `skills/` exists.
2. Ensures the repo-local `clawhub` CLI package is available.
3. Ensures `openclaw` exists in the configured WSL distro, using the project's existing installer if needed.

## Planned first project skills

- `document-deep-parse` - created
- `knowledge-report-supply` - created
- `report-page-planner` - created
- `datasource-body-extract` - created
- `order-inventory-page-composer` - created
- `template-learning`

## Current workspace skills

- `document-deep-parse`
  - Purpose: detailed structured enrichment for ingested enterprise documents
  - Output: strict JSON for summary, tags, evidence blocks, entities, claims, and intent slots
  - Scope: resumes, bids, contracts, formulas, technical documents, and research papers
- `knowledge-report-supply`
  - Purpose: compact library-grounded evidence supply for answers and report generation
  - Output: bounded documents, evidence, template guidance, and gap signals
  - Scope: resume, bid, order, formula, contract, technical, and research knowledge workflows
- `datasource-body-extract`
  - Purpose: clean正文 extraction and denoising for datasource capture before ingestion
  - Output: strict JSON with page type, summary, clean body, key sections, candidate links, quality signals, and warnings
  - Scope: `web_public`, `web_login`, and `web_discovery` captures, especially noisy portal and landing pages
- `report-page-planner`
  - Purpose: evidence-aware planning for client-facing visual static pages before final generation
  - Output: report objective, stable page sections, card/chart priorities, and model-completion boundaries
  - Scope: knowledge-backed page generation in chat and dynamic page refresh in report center
- `order-inventory-page-composer`
  - Purpose: premium final-page composition for multi-channel order and inventory static reports
  - Output: strict JSON page content with summary, cards, sections, charts, and bounded warnings
  - Scope: order library static pages such as operating cockpit, channel cockpit, SKU/category page, and inventory/replenishment cockpit

## Guardrails

- Do not put secrets in `skills/`
- Do not patch OpenClaw core
- Keep runtime service state out of git
- Prefer workspace skills for project-specific behavior, not global user-level skill folders
