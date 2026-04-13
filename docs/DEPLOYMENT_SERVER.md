# Server Deployment

`ai-data-platform` is now an application repository.

For any shared admin, shared control plane, shared model pool, or cross-project governance deployment, use:

- `home`

This document only covers the application-side server deployment for:

- `apps/api`
- `apps/web`
- `apps/worker`
- `tools/windows-client` related application runtime integration

## Scope

New environments should deploy only:

1. `ai-data-platform-model-bridge.service`
2. `ai-data-platform-api.service`
3. `ai-data-platform-worker.service`
4. `ai-data-platform-web.service`

## Required environment

Main environment file:

- `/etc/ai-data-platform/ai-data-platform.env`

Primary runtime variables:

- `API_PORT`
- `API_HOST`
- `WEB_HOST`
- `OPENCLAW_GATEWAY_URL`
- `OPENCLAW_GATEWAY_TOKEN`
- `OPENCLAW_AGENT_ID`
- `OPENCLAW_MODEL`
- `HOME_PLATFORM_BASE_URL`
- `HOME_PLATFORM_BRIDGE_MODE`
- `HOME_PLATFORM_LEASE_PROFILE`
- `HOME_PLATFORM_LEASE_RENEW_INTERVAL_MS`
- `HOME_PLATFORM_PROJECT_KEY`
- `HOME_PLATFORM_PRINCIPAL_KEY`
- `HOME_PLATFORM_PRINCIPAL_LABEL`
- `HOME_PLATFORM_DEVICE_FINGERPRINT`
- `HOME_PLATFORM_PROVIDER`
- `HOME_PLATFORM_MODEL`
- `MODEL_BRIDGE_HOST`
- `MODEL_BRIDGE_PORT`
- `DEEPSEEK_API_KEY`
- `MINIMAX_API_KEY`
- `WEB_PORT`
- `NEXT_PUBLIC_API_BASE_URL`
- `BACKEND_API_BASE_URL`
- `WORKER_NAME`
- `WORKER_POLL_INTERVAL_MS`
- `WORKER_SCAN_PATH`
- `WORKER_DEEP_PARSE_PATH`
- `API_BASE_URL`

If `HOME_PLATFORM_BASE_URL` is set, `ai-data-platform-model-bridge` can use the shared `home` platform model proxy as a fallback path.

- `HOME_PLATFORM_BRIDGE_MODE=local-first`
  The default and recommended production mode. Local provider keys are used first. `home` is only used as a fallback.
- `HOME_PLATFORM_BRIDGE_MODE=home-first`
  `home` is used first, and local provider keys are only used as a fallback.

For server-style nodes that should keep a reserved upstream provider on the shared `home` model pool, set:

- `HOME_PLATFORM_LEASE_PROFILE=server_120m`

That enables a sticky lease on the `home` side:

- higher priority than short client leases
- renewed automatically by `ai-data-platform-model-bridge`
- only reclaimed when the lease has been idle long enough and another request needs the same upstream provider

If `HOME_PLATFORM_LEASE_PROFILE` is left empty:

- `home-first` nodes still default to `server_120m`
- `local-first` nodes do not pre-warm a sticky lease

`HOME_PLATFORM_LEASE_RENEW_INTERVAL_MS` is optional and normally should not be set outside tests or troubleshooting.

## Deployment flow

1. Clone or update the repository to the target server, for example `/srv/ai-data-platform`.
2. Prepare `/etc/ai-data-platform/ai-data-platform.env` from `deploy/server/ai-data-platform.env.example`.
3. Install the document detailed-parse runtime:
   - Python 3
   - `markitdown`
   - if audio parsing is required, install `markitdown[audio-transcription]`
4. If `markitdown` is not on the default `PATH`, set `MARKITDOWN_BIN` in `/etc/ai-data-platform/ai-data-platform.env`.
5. Run `corepack pnpm install --frozen-lockfile`.
6. Run `corepack pnpm build`.
7. Install only the application unit files listed above.
8. Run `systemctl daemon-reload`.
9. Restart the application services.
10. Verify the health endpoints and one detailed parse path.

Recommended runtime install example:

```bash
python3 -m pip install --upgrade markitdown
python3 -m pip install --upgrade "markitdown[audio-transcription]"
```

## Network boundary

Production servers should bind the application services to loopback and expose only the reverse proxy entrypoints.

- `API_HOST=127.0.0.1`
- `WEB_HOST=127.0.0.1`
- public traffic should enter through `nginx` on `80/443`, not through direct access to `3002/3100`

If you want explicit host-level rejection in addition to loopback binding, use:

- [harden-public-entry.sh](C:/Users/soulzyn/Desktop/codex/ai-data-platform/deploy/server/harden-public-entry.sh)
- [ai-data-platform.conf.example](C:/Users/soulzyn/Desktop/codex/ai-data-platform/deploy/server/nginx/ai-data-platform.conf.example)

That helper installs a dedicated `nftables` include snippet which rejects direct access to:

- `3002`
- `3100`

## Reverse proxy timeouts

Long-running chat requests can finish successfully at `127.0.0.1:3002` while still being cut off by `nginx` if the proxy timeout is left at the short default.

For production reverse proxies:

- keep `/api/` routed through the web service at `127.0.0.1:3002`
- keep `/api/health` and any direct API-only probe routed to `127.0.0.1:3100`
- set `proxy_connect_timeout 30s`
- set `proxy_send_timeout 300s`
- set `proxy_read_timeout 300s`
- set `send_timeout 300s`

If the app works through `curl http://127.0.0.1:3002/api/chat` on the server but the public domain returns `504 Gateway Time-out`, treat the reverse proxy timeout as the first suspect.

Reference config:

- [ai-data-platform.conf.example](C:/Users/soulzyn/Desktop/codex/ai-data-platform/deploy/server/nginx/ai-data-platform.conf.example)

## Health checks

- `curl http://127.0.0.1:3100/api/health`
- open the app frontend and verify the main user flows
- verify `markitdown --help` or `python3 -m markitdown --help`
- upload one `docx/pptx/xlsx/pdf` file and confirm the detailed parse shows canonical markdown

## Deployment profiles

This document only covers the common application-node deployment flow.

Server-specific runtime differences should live under:

- [deploy/profiles/120](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/deploy/profiles/120)
- [deploy/profiles/10](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/deploy/profiles/10)

The intended node model is:

- every node stays independently runnable
- local capability remains preferred when present
- `home` acts as shared fallback for model access
- stable node identity is reported through `HOME_PLATFORM_*`

If you need the current production details for `120.24.251.24`, use the 120 profile files instead of embedding that state into the common deployment guide.

## Remote deploy helper

The repo keeps two deploy helpers:

- [update-server.sh](C:/Users/soulzyn/Desktop/codex/ai-data-platform/deploy/server/update-server.sh)
- [deploy-remote.ps1](C:/Users/soulzyn/Desktop/codex/ai-data-platform/tools/deploy-remote.ps1)

Their defaults now target only the application packages and services:

- `api`
- `web`
- `worker`
- `ai-data-platform-model-bridge`
- `ai-data-platform-api`
- `ai-data-platform-worker`
- `ai-data-platform-web`

## Runtime file boundary

Do not keep mutable runtime files under the repository worktree on servers.

- environment file belongs in `/etc/ai-data-platform/ai-data-platform.env`
- runtime state belongs under `storage/`
- ad-hoc binaries or archives such as `scanner_linux` and `xmrig.tar.gz` must live outside `/srv/ai-data-platform`

## Removed legacy surface

The old legacy control-plane code and unit templates were removed from this repository on 2026-04-13.

Use `home` for:

- shared admin token rollout
- shared public admin
- shared control-plane deployment
- cross-project release control and governance
