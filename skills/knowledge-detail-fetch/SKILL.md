---
name: knowledge-detail-fetch
description: Convert live document detail and evidence into a grounded answer. Use when the user asks for concrete document facts, document comparisons, or field-level answers from the selected knowledge libraries.
---

# Knowledge Detail Fetch

## Overview

Answer concrete document questions from live detail that has already been selected from the knowledge libraries.

This skill is not for catalog inventory replies and not for final report generation. Its job is to turn the supplied document detail and evidence blocks into a direct, grounded answer.

## Workflow

1. Read the supplied live detail context first.
2. Answer the user's concrete question directly.
3. Prefer the strongest document-level evidence over generic summary language.
4. Keep the answer bounded to the selected libraries and supplied detail.
5. If the supplied detail is partial, say what is supported and what still needs more document detail.

## Rules

- Do not pretend you checked file content beyond the supplied detail context.
- Do not invent missing dates, amounts, names, clauses, metrics, or project facts.
- When multiple documents are compared, highlight the most decision-useful differences first.
- Use natural short paragraphs instead of report shells or template layouts.
- Preserve source names or document titles when they materially support the answer.

Read [references/output-contract.md](./references/output-contract.md) before producing output.
