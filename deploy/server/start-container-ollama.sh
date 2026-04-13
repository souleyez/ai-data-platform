#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${OLLAMA_CONTAINER_NAME:-ollama-gpu}"
IMAGE_REF="${OLLAMA_IMAGE_REF:-ollama/ollama:0.20.4}"
HOST_PORT="${OLLAMA_HOST_PORT:-11435}"
MODELS_ROOT="${OLLAMA_MODELS_ROOT:-${HOME}/.ollama-host}"
CONTEXT_LENGTH="${OLLAMA_CONTEXT_LENGTH:-32768}"
NUM_PARALLEL="${OLLAMA_NUM_PARALLEL:-1}"
FLASH_ATTENTION="${OLLAMA_FLASH_ATTENTION:-true}"
KV_CACHE_TYPE="${OLLAMA_KV_CACHE_TYPE:-q8_0}"

mkdir -p "${MODELS_ROOT}/models"

if docker ps --format '{{.Names}}' | grep -qx "${CONTAINER_NAME}"; then
  echo "container ollama already running (${CONTAINER_NAME})"
  exit 0
fi

docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true

docker run -d \
  --name "${CONTAINER_NAME}" \
  --gpus all \
  --restart unless-stopped \
  -p "127.0.0.1:${HOST_PORT}:11434" \
  -e OLLAMA_CONTEXT_LENGTH="${CONTEXT_LENGTH}" \
  -e OLLAMA_NUM_PARALLEL="${NUM_PARALLEL}" \
  -e OLLAMA_FLASH_ATTENTION="${FLASH_ATTENTION}" \
  -e OLLAMA_KV_CACHE_TYPE="${KV_CACHE_TYPE}" \
  -v "${MODELS_ROOT}:/root/.ollama" \
  "${IMAGE_REF}"

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${HOST_PORT}/api/tags" >/dev/null 2>&1; then
    echo "container ollama started on http://127.0.0.1:${HOST_PORT}"
    exit 0
  fi
  sleep 1
done

echo "container ollama failed to start" >&2
docker logs --tail 80 "${CONTAINER_NAME}" >&2 || true
exit 1
