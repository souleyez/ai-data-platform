---
name: document-deep-parse
description: Deep document structuring for the AI data platform knowledge base. Use when OpenClaw needs to read an already-ingested enterprise document and return structured JSON for detailed parsing, including summary, topic tags, evidence blocks, entities, claims, and intent slots. Trigger for resumes, bids, contracts, formulas, technical documents, research papers, and other knowledge-base files that need high-quality structured enrichment.
---

# Document Deep Parse

## Overview

Read a single already-ingested document and return strict JSON only for the platform's detailed parse layer.

This skill is for structured enrichment, not user-facing answering. Focus on extracting reliable evidence and normalized fields that improve retrieval, knowledge-grounded answering, and template-driven report output.

## Workflow

1. Read the provided document context.
2. Identify the dominant document type and business signals.
3. Produce a concise, evidence-grounded summary.
4. Extract only high-value evidence blocks.
5. Extract entities and claims only when the text supports them.
6. Fill intent slots with reusable business terms.
7. Return strict JSON that matches the platform schema.

## Output Rules

- Return JSON only. No markdown. No explanation.
- Do not invent facts, names, metrics, or dates.
- Keep `evidenceBlocks` to 3-8 high-value items.
- Prefer evidence that helps retrieval and downstream report generation.
- Use short, normalized strings for tags and intent slots.
- Leave arrays empty instead of guessing.
- Use confidence values between `0` and `1`.

Read [references/output-schema.md](./references/output-schema.md) before producing output.

## Domain Priorities

When document signals are mixed, prefer the document's dominant business purpose:

- Resume: companies, roles, education, projects, skills, timeline.
- Bid or tender: sections, response requirements, qualifications, risks, submission materials.
- Contract: parties, obligations, deliverables, dates, payment, risk clauses.
- Formula or product material: ingredients, strains, benefits, audiences, doses, metrics.
- Technical document: APIs, modules, deployment, integrations, metrics, architecture signals.
- Research paper: methodology, subjects, results, metrics, organizations, evidence strength.

## Failure Boundaries

- If the source text is weak, return a smaller but valid JSON object.
- If a field is unsupported, omit the value or leave the array empty.
- Never switch into conversational mode.
- Never output a report, recommendation, or final business answer.
