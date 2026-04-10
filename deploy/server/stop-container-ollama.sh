#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${OLLAMA_CONTAINER_NAME:-ollama-gpu}"

docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
echo "container ollama stopped (${CONTAINER_NAME})"
