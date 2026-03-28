---
name: knowledge-report-supply
description: Template-aware evidence supply for library-grounded answering and report generation. Use when OpenClaw needs curated knowledge-base material instead of raw conversation history, especially for library-scoped answers, report drafting, or template-aligned output based on resumes, bids, orders, formulas, contracts, technical documents, and research materials.
---

# Knowledge Report Supply

## Overview

Prepare the right library-grounded evidence bundle for a downstream answer or report.

This skill does not decide the final user-facing wording by itself. Its job is to narrow the knowledge scope, organize high-value evidence, align the evidence set with the requested template shape, and return compact structured supply that a downstream model can use directly.

## Workflow

1. Identify the effective knowledge scope from the request.
2. Prefer the explicitly targeted library or libraries.
3. Filter candidate documents by time and content focus when those signals exist.
4. Prefer newer, detailed-parse documents over weaker materials.
5. Select evidence that best fits the requested task or template.
6. Return a compact, structured supply package.

## What to Prioritize

- High-value evidence, not exhaustive dumping.
- Detailed-parse documents over quick-only documents.
- Newer documents over older documents when the request implies recency.
- Template-fit evidence over generic evidence when the request implies a table, static page, PPT, or document.
- Library-bounded supply. Do not drift outside the intended library scope unless explicitly allowed.

## Output Rules

- Return structured supply, not a final report narrative.
- Keep the evidence set compact and relevant.
- Preserve source names or identifiers whenever possible.
- Surface template-fit signals clearly:
  - preferred columns
  - preferred sections
  - grouped dimensions
  - report task hints
- For static-page outputs without an explicitly named custom template, provide concept-page guidance:
  - recommended sections
  - recommended cards
  - recommended charts
  - primary grouping dimension
- If coverage is weak, say so explicitly instead of padding with invented material.

Read [references/supply-contract.md](./references/supply-contract.md) before producing output.

## Domain Priorities

- Resume libraries: prioritize candidates, companies, projects, skills, education, timelines.
- Bid libraries: prioritize sections, response requirements, qualifications, risks, and submission materials.
- Order libraries: prioritize platforms, categories, sales metrics, inventory, forecast, replenishment, anomalies.
- Formula libraries: prioritize ingredients, strains, benefits, audiences, doses, and evidence strength.
- Contract libraries: prioritize obligations, terms, dates, deliverables, payments, and risk clauses.
- Technical or research libraries: prioritize methods, systems, modules, APIs, deployment, metrics, and evidence quality.

## Failure Boundaries

- If the request is library-grounded but the scope is weak, return the best bounded evidence set and mark the gap.
- If the request is clearly outside the selected libraries, do not compensate with unrelated external content.
- Never fabricate missing evidence to satisfy a template.
- Never switch into generic freeform assistant mode.
