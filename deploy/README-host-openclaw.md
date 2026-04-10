# AI Data Platform Docker Deployment

This deployment shape is for:

- `ai-data-platform` API, Web, and Worker running in containers
- `openclaw` continuing to run on the host machine
- existing host `ollama` continuing to run as-is

## Files

- `deploy/docker-compose.host-openclaw.yml`
- `deploy/docker/api.Dockerfile`
- `deploy/docker/web.Dockerfile`
- `deploy/docker/worker.Dockerfile`

## Assumptions

- Host `openclaw` gateway is reachable at `http://127.0.0.1:18789` on the host
- Containers reach host services through `host.docker.internal`
- Existing host `ollama` remains unchanged and is consumed by `openclaw` or other host-side services

## Required app env files

- `apps/api/.env`
- `apps/web/.env`
- `apps/worker/.env`

Recommended values for this deployment:

```env
# apps/api/.env
PORT=3100
HOST=0.0.0.0
OPENCLAW_GATEWAY_URL=http://host.docker.internal:18789
```

```env
# apps/web/.env
BACKEND_API_BASE_URL=http://api:3100
```

```env
# apps/worker/.env
API_BASE_URL=http://api:3100
```

## Start

From the repository root:

```bash
docker compose -f deploy/docker-compose.host-openclaw.yml up -d --build
```

If the target server cannot pull base images, use the prebuilt runtime shape instead:

```bash
docker compose -f deploy/docker-compose.host-openclaw-prebuilt.yml up -d
```

## Stop

```bash
docker compose -f deploy/docker-compose.host-openclaw.yml down
```

## Notes

- API container storage is persisted through the `ai_data_platform_storage` volume.
- Web is exposed on host port `3002` by default.
- API is exposed on host port `3100` by default.
- If host `openclaw` runs on a different port or host IP, override `OPENCLAW_GATEWAY_URL`.
- If you want Nginx in front, point it to host `127.0.0.1:3002` for web and `127.0.0.1:3100` for API.
- The prebuilt runtime shape expects a `prebuilt-runtime/` directory at the repository root that preserves the repo layout for `apps/api`, `apps/web`, `apps/worker`, `config`, `default-samples`, `skills`, and `tools`.

## Host OpenClaw Gateway

For Linux hosts that keep `openclaw` on the host, this repo also includes:

- `deploy/server/openclaw.ollama.example.json`
- `deploy/server/start-host-openclaw.sh`
- `deploy/server/stop-host-openclaw.sh`
- `deploy/server/start-host-ollama.sh`
- `deploy/server/stop-host-ollama.sh`

Recommended host pattern:

```bash
mkdir -p ~/.openclaw
cp deploy/server/openclaw.ollama.example.json ~/.openclaw/openclaw.json
OPENCLAW_NODE_BIN="$HOME/bin/node" \
OPENCLAW_LOCAL_HOST=172.17.0.1 \
bash deploy/server/start-host-openclaw.sh
```

`172.17.0.1` is a practical default when containers reach the host through `host.docker.internal`.

## Host Ollama Override

If the server's Docker-managed Ollama is too old to serve a required model, run a newer
host-managed Ollama side-by-side on another port and point OpenClaw to it.

Recommended host pattern:

```bash
mkdir -p "$HOME/opt/ollama" "$HOME/.ollama-host/models"
curl -L https://ollama.com/download/ollama-linux-amd64.tgz | tar -xz -C "$HOME/opt/ollama"
HOST_OLLAMA_BIN="$HOME/opt/ollama/bin/ollama" \
HOST_OLLAMA_LISTEN_ADDR=127.0.0.1:11435 \
bash deploy/server/start-host-ollama.sh
HOST_OLLAMA_BIN="$HOME/opt/ollama/bin/ollama" \
OLLAMA_HOST=127.0.0.1:11435 \
OLLAMA_MODELS="$HOME/.ollama-host/models" \
"$HOME/opt/ollama/bin/ollama" pull gemma4:31b
```

Then update `~/.openclaw/openclaw.json` so the Ollama provider `baseUrl` points to
`http://127.0.0.1:11435`, restart the host OpenClaw gateway, and verify the app through
`/api/chat`.
