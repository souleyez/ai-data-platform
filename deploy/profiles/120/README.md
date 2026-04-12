# Server 120 Deployment Profile

This profile documents the current production deployment shape for `120.24.251.24`.

Use it together with the common app-node deployment guide:

- [docs/DEPLOYMENT_SERVER.md](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/docs/DEPLOYMENT_SERVER.md)

## Role

Server 120 is an `ai-data-platform` application node.

It should remain:

- independently runnable
- local-provider-first
- integrated to `home` for fallback model access
- visible to the shared platform through stable node identity

## Runtime intent

- local provider first
- local OpenClaw enabled
- `home` used only as fallback
- reverse proxy terminates public traffic
- app services stay on loopback

## Required common files

Prepare the standard app env file first:

- `/etc/ai-data-platform/ai-data-platform.env`

Start from:

- [deploy/server/ai-data-platform.env.example](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/deploy/server/ai-data-platform.env.example)

Then apply the 120-specific overrides from:

- [node-overrides.env.example](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/deploy/profiles/120/node-overrides.env.example)

## Detailed parse runtime

120 should install the canonical markdown runtime locally:

```bash
python3 -m pip install --upgrade markitdown
python3 -m pip install --upgrade "markitdown[audio-transcription]"
```

If `markitdown` is not available on the service `PATH`, add `MARKITDOWN_BIN` to `/etc/ai-data-platform/ai-data-platform.env`.

## Current model bridge drop-in

The 120 server uses a systemd drop-in for the model bridge.

Canonical path on the server:

- `/etc/systemd/system/ai-data-platform-model-bridge.service.d/home-platform.conf`

Example content:

- [model-bridge.home-platform.conf.example](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/deploy/profiles/120/model-bridge.home-platform.conf.example)

After restoring or changing that file:

1. `systemctl daemon-reload`
2. `systemctl restart ai-data-platform-model-bridge.service`

## Network boundary

Keep application services bound to loopback:

- `API_HOST=127.0.0.1`
- `WEB_HOST=127.0.0.1`
- `MODEL_BRIDGE_HOST=127.0.0.1`

Preserve host-level rejection of direct public access to:

- `3001`
- `3002`
- `3100`
- `3210`

Helpers:

- [deploy/server/harden-public-entry.sh](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/deploy/server/harden-public-entry.sh)
- [deploy/server/nginx/ai-data-platform.conf.example](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/deploy/server/nginx/ai-data-platform.conf.example)

## Reverse proxy timeouts

120 requires longer `nginx` timeouts for `/api/`.

Recommended snippet:

- [nginx.api-timeouts.conf.example](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/deploy/profiles/120/nginx.api-timeouts.conf.example)

If local loopback requests succeed but the public domain returns `504`, restore this timeout profile before changing app code.

## Expected bridge health

In the normal production configuration:

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

That means:

- 120 uses its local MiniMax path first
- it falls back to `home` if the local path fails
- it remains an independent node rather than a `home`-only runtime

## Update flow

Current update flow after GitHub changes:

1. SSH to 120
2. run [deploy/server/update-server.sh](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/deploy/server/update-server.sh)
3. verify `http://127.0.0.1:3100/api/health`
4. verify the public domain

This server profile does not yet make server 1 trigger the update automatically. That remains a future fleet-operation step.
