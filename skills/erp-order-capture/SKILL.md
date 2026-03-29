---
name: erp-order-capture
description: Plan readonly ERP order capture contracts for API and portal/session systems. Use when OpenClaw should decide login entry, list/detail paths, incremental sync keys, and safe capture steps before any downstream executor runs.
---

# ERP Order Capture

## Overview

Plan a readonly ERP order capture contract before any browser automation, API sync, or ingestion run.

This skill is not the final executor. Its job is to turn datasource metadata and ERP execution hints into a stable capture contract:

- transport-aware capture mode
- readonly login or session entry
- order list and detail path hints
- incremental sync keys and watermark policy
- safe steps for API or portal extraction

## Workflow

1. Read the ERP datasource metadata, auth mode, target libraries, and module plan.
2. Decide whether the system is mainly `api`, `session`, or `generic`.
3. Prefer readonly list-then-detail capture for APIs and readonly export/list capture for portals.
4. Keep the contract focused on order data: headers, status, line items, payment, delivery, and update timestamps.
5. Make incremental sync explicit with cursor candidates, dedupe keys, and watermark policy.
6. Reject any write, submit, approve, or workflow action.

## Output Rules

- Return strict JSON only.
- Prefer stable path hints over speculative deep paths.
- Prefer readonly routes, export pages, and report pages.
- Keep steps concise and operational.
- Use empty arrays or empty strings when the input does not support a field.
- Do not invent credentials, write actions, or unsupported modules.
- When the system looks portal-driven, produce a contract that a browser/session executor could follow later.

Read [references/output-schema.md](./references/output-schema.md) before using this skill.
