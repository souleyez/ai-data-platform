# Server 10 Deployment Profile

This profile defines the intended deployment shape for server 10 as an `ai-data-platform` application node.

Use it together with the common app-node deployment guide:

- [docs/DEPLOYMENT_SERVER.md](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/docs/DEPLOYMENT_SERVER.md)

## Role

Server 10 should follow the same node model as 120:

- independently runnable
- local-first when local capability exists
- integrated to `home` for fallback model access
- visible to server 1 through stable node identity

## Recommended profile

Prefer this operating mode:

- `HOME_PLATFORM_BRIDGE_MODE=local-first`
- keep local OpenClaw if the server is meant to stay locally capable
- if local provider keys are absent, the node can still work by falling back to `home`

## Required common files

Prepare the standard app env file first:

- `/etc/ai-data-platform/ai-data-platform.env`

Start from:

- [deploy/server/ai-data-platform.env.example](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/deploy/server/ai-data-platform.env.example)

Then apply the 10-specific identity overrides from:

- [node-overrides.env.example](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/deploy/profiles/10/node-overrides.env.example)

## Model bridge drop-in

Recommended server path:

- `/etc/systemd/system/ai-data-platform-model-bridge.service.d/home-platform.conf`

Template:

- [model-bridge.home-platform.conf.example](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/deploy/profiles/10/model-bridge.home-platform.conf.example)

## Notes

- Fill the real server 10 hostname or IP before applying this profile.
- If 10 is intended to be a lean node, leave local provider keys empty and keep the `home` fallback configured.
- If 10 is intended to be a full local node, add local provider keys and local OpenClaw while keeping the same fallback identity fields.

## Update flow

Current update flow after GitHub changes:

1. SSH to 10
2. run [deploy/server/update-server.sh](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/deploy/server/update-server.sh)
3. verify `http://127.0.0.1:3100/api/health`
4. verify the node-specific entrypoint
