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

Do not install the legacy control-plane services for new environments:

- `ai-data-platform-control-plane-api.service`
- `ai-data-platform-control-plane-web.service`

Those unit files remain in the repo only as migration references while the shared platform is consolidated into `home`.

## Required environment

Main environment file:

- `/etc/ai-data-platform/ai-data-platform.env`

Primary runtime variables:

- `API_PORT`
- `API_HOST`
- `OPENCLAW_GATEWAY_URL`
- `OPENCLAW_GATEWAY_TOKEN`
- `OPENCLAW_AGENT_ID`
- `OPENCLAW_MODEL`
- `HOME_PLATFORM_BASE_URL`
- `HOME_PLATFORM_BRIDGE_MODE`
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
  Temporary test mode. `home` is used first, and local provider keys are only used as a fallback.

## Deployment flow

1. Clone or update the repository to the target server, for example `/srv/ai-data-platform`.
2. Prepare `/etc/ai-data-platform/ai-data-platform.env` from `deploy/server/ai-data-platform.env.example`.
3. Run `corepack pnpm install --frozen-lockfile`.
4. Run `corepack pnpm build`.
5. Install only the application unit files listed above.
6. Run `systemctl daemon-reload`.
7. Restart the application services.
8. Verify the health endpoints.

## Health checks

- `curl http://127.0.0.1:3100/api/health`
- open the app frontend and verify the main user flows

## Current production integration on `120.24.251.24`

The current `120.24.251.24` deployment keeps the application in local-provider-first mode and uses `home` only as a fallback path for model access.

### Runtime intent

- local provider first
- `home` shared platform as model fallback only
- temporary tests may switch to `HOME_PLATFORM_BRIDGE_MODE=home-first`, but production should stay `local-first`

### Server-specific manual override

The current production server uses a `systemd` drop-in file that is not stored in this repository:

- `/etc/systemd/system/ai-data-platform-model-bridge.service.d/home-platform.conf`

It currently defines:

```ini
[Service]
Environment="HOME_PLATFORM_BASE_URL=http://ad.goods-editor.com/platform-api/api"
Environment="HOME_PLATFORM_BRIDGE_MODE=local-first"
Environment="HOME_PLATFORM_PROJECT_KEY=ai-data-platform"
Environment="HOME_PLATFORM_PRINCIPAL_KEY=server:120.24.251.24"
Environment="HOME_PLATFORM_PRINCIPAL_LABEL=AI-120"
Environment="HOME_PLATFORM_DEVICE_FINGERPRINT=bridge:120.24.251.24:18790"
Environment="HOME_PLATFORM_PROVIDER=minimax"
Environment="HOME_PLATFORM_MODEL=MiniMax-M2.7"
```

This drop-in is required because the 120 server uses the local model bridge service as the stable switching point. After recreating or replacing the server, restore this file, then run:

1. `systemctl daemon-reload`
2. `systemctl restart ai-data-platform-model-bridge.service`

### Expected bridge health on 120

In the normal production configuration, this command should show local-first mode:

```bash
curl http://127.0.0.1:18790/health
```

Expected shape:

```json
{
  "status": "ok",
  "service": "http-model-bridge",
  "mode": "local-provider-preferred",
  "provider": "minimax",
  "model": "minimax/MiniMax-M2.7",
  "fallback": "home-platform"
}
```

That output means:

- 120 uses its local MiniMax key first
- if the local path fails, it can fall back to `home`
- `home` is not the primary production dependency for model serving

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

If you intentionally need the frozen legacy control-plane during migration, pass explicit custom `BUILD_PACKAGES` and `SERVICES` values instead of relying on defaults.

## Runtime file boundary

Do not keep mutable runtime files under the repository worktree on servers.

- environment file belongs in `/etc/ai-data-platform/ai-data-platform.env`
- runtime state belongs under `storage/`
- ad-hoc binaries or archives such as `scanner_linux` and `xmrig.tar.gz` must live outside `/srv/ai-data-platform`

## Legacy references

The following content is no longer part of the standard deployment path:

- local or server deployment of `apps/control-plane-api`
- local or server deployment of `apps/control-plane-web`
- shared admin token rollout from this repository
- control-plane file-to-Postgres migration from this repository

Use `home` for all of the above.
