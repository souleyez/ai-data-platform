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
docker compose -f deploy/docker-compose.host-openclaw-prebuilt.yml up -d --build
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
- The prebuilt runtime API service now derives a thin local Debian-based compatibility image from `postgres:17` and installs distro `nodejs`, so native DuckDB bindings run against a real glibc userspace even when the server cannot pull `node:*-bookworm-slim`.

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

## Containerized GPU Ollama

If the host binary does not detect CUDA correctly, prefer a standalone Ollama container with
 GPU passthrough and keep the same loopback port for OpenClaw:

- `deploy/server/start-container-ollama.sh`
- `deploy/server/stop-container-ollama.sh`

Recommended host pattern:

```bash
mkdir -p "$HOME/.ollama-host/models"
OLLAMA_IMAGE_REF=ollama/ollama:0.20.4 \
OLLAMA_HOST_PORT=11435 \
OLLAMA_CONTEXT_LENGTH=32768 \
OLLAMA_NUM_PARALLEL=1 \
OLLAMA_FLASH_ATTENTION=true \
OLLAMA_KV_CACHE_TYPE=q8_0 \
bash deploy/server/start-container-ollama.sh
```

This shape expects Docker with NVIDIA runtime support and mounts `~/.ollama-host` into the
container as `/root/.ollama`, so pulled models can be reused across restarts or between host
and container deployments.

## Ollama Runtime Profile

To create a reusable tuned model alias with runtime parameters baked into the Modelfile:

- `deploy/server/create-ollama-profile.sh`

Example:

```bash
OLLAMA_BIN="docker exec ollama-gpu ollama" \
OLLAMA_HOST_URL=http://127.0.0.1:11435 \
OLLAMA_PROFILE_BASE_MODEL=gemma4:31b \
OLLAMA_PROFILE_TARGET_MODEL=gemma4:31b-tuned \
OLLAMA_PROFILE_NUM_CTX=32768 \
OLLAMA_PROFILE_NUM_GPU=30 \
OLLAMA_PROFILE_NUM_THREAD=6 \
OLLAMA_PROFILE_USE_MMAP=false \
bash deploy/server/create-ollama-profile.sh
```

This is useful when you want the application to always select a specific profile such as
`gemma4:31b-tuned` instead of the base model.
