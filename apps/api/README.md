# apps/api

`apps/api` is the application backend for the AI assistant product.

It is not the shared platform backend. Shared admin, shared control-plane, shared model pool, and cross-project governance belong to:

- `home`

## Active scope

- AI assistant application APIs
- application-local chat, documents, reports, datasources, and worker-facing endpoints
- local runtime support for the Windows client and application flows

## Fixed home integration contract

This backend accepts the standard `home` platform integration contract:

- `GET /internal/platform/health`
- `POST /internal/platform/broadcasts`

Shared secret:

- request header `x-home-platform-token`
- env `HOME_PLATFORM_TOKEN`

If `HOME_PLATFORM_TOKEN` is empty, the endpoints stay open for local development.
If it is set, both endpoints require the matching header.

For local protected development, `ai-data-platform` can persist the token for `tools/start-local.ps1`:

```powershell
corepack pnpm local:home-token:set -Token '<shared-token>'
```

## Main endpoints

- `GET /`
- `GET /api/health`
- `POST /api/chat`
- `GET /api/datasources`
- `GET /api/documents`
- `GET /api/reports`

## Local start

```bash
corepack pnpm install
cp .env.example .env
corepack pnpm dev
```

Default port:

- `3100`

## OpenClaw gateway

Local development can point to the Windows bridge or a same-host gateway through:

- `OPENCLAW_GATEWAY_URL`
- `OPENCLAW_GATEWAY_TOKEN`
- `OPENCLAW_AGENT_ID`
- `OPENCLAW_MODEL`

If the gateway is not configured, the app keeps local fallback behavior for development.

## Boundary

Keep new work here only when it is application-specific to AI Data Platform.

Do not add here:

- shared admin login
- shared model pool management
- cross-project governance
- shared release control for multiple applications
