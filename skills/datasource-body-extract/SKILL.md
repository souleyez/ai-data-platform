---
name: datasource-body-extract
description: Body extraction and denoising for datasource ingestion. Use when OpenClaw needs to turn fetched webpages, portal pages, discovery pages, or logged-in datasource captures into clean source-grounded body content before the platform stores them as documents. Trigger after `web_public`, `web_login`, or `web_discovery` capture when navigation chrome, login hints, boilerplate, or noisy HTML should be removed while preserving the useful title,正文, candidate links, and ingestion-safe summary.
---

# Datasource Body Extract

## Overview

Extract the highest-value正文 from a fetched datasource page and strip page noise before ingestion.

This skill is for datasource capture quality, not final user-facing answering. Its job is to preserve useful content, bound the正文, surface discovery links when the page is not a real article, and return strict JSON that downstream ingestion can trust.

## Workflow

1. Identify the page type:
   - article or正文页
   - discovery or listing page
   - login or gated page
   - noise or weak page
2. Preserve the strongest source signals:
   - canonical URL
   - title
   - section labels when they help
3. Remove obvious noise:
   - navigation
   - footer
   - cookie banners
   - share prompts
   - citation widgets
   - login chrome
   - repetitive boilerplate
4. Prefer clean正文 over exhaustive capture.
5. If the page is a discovery page, keep a compact landing summary and extract the best candidate content links.
6. Return strict JSON only.

## What to Prioritize

- Main article or body content over layout chrome.
- Source-grounded wording over rewritten prose.
- Bounded clean text over full-page dumping.
- Discovery-safe candidate links over noisy link floods.
- Ingestion-friendly summaries that help quick parse and deep parse.

## Output Rules

- Return JSON only. No markdown. No explanation.
- Never invent正文 that is not supported by the source page.
- Keep `cleanBody` focused and de-noised.
- Preserve short source snippets when they help later retrieval.
- Use `pageType` to explain whether this is a body page, discovery page, gated page, or weak page.
- If the page has little usable正文, return a small valid object with warnings instead of padding.
- If the page is mainly a discovery page, include candidate links and keep the body compact.

Read [references/extraction-contract.md](./references/extraction-contract.md) before producing output.

## Page-Type Guidance

- `article`
  - Strong正文 exists.
  - Prefer正文, section labels, and summary.
- `discovery`
  - Landing page lists multiple potential content targets.
  - Prefer compact overview plus 3-10 strong `candidateLinks`.
- `gated`
  - Login wall, session timeout, or permission barrier.
  - Keep minimal context and set warnings clearly.
- `weak`
  - Very little useful正文 after denoising.
  - Return minimal body and explicit quality warnings.

## Failure Boundaries

- Never switch into generic assistant mode.
- Never output a final report, recommendation, or business answer.
- Never keep raw navigation dumps just to increase length.
- Never output more candidate links than the source quality supports.
