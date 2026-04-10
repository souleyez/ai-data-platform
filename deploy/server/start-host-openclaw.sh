#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_DIR="${AI_DATA_PLATFORM_RUN_DIR:-${ROOT}/tmp/host-openclaw}"
PID_FILE="${RUN_DIR}/openclaw-gateway.pid"
OUT_FILE="${RUN_DIR}/openclaw-gateway.out.log"
ERR_FILE="${RUN_DIR}/openclaw-gateway.err.log"
NODE_BIN="${OPENCLAW_NODE_BIN:-$(command -v node || true)}"
CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-${HOME}/.openclaw/openclaw.json}"
LISTEN_HOST="${OPENCLAW_LOCAL_HOST:-172.17.0.1}"
LISTEN_PORT="${OPENCLAW_LOCAL_PORT:-18789}"

mkdir -p "${RUN_DIR}"

if [ -z "${NODE_BIN}" ]; then
  echo "Node.js not found. Set OPENCLAW_NODE_BIN or install Node first." >&2
  exit 1
fi

if [ ! -f "${CONFIG_PATH}" ]; then
  echo "OpenClaw config not found: ${CONFIG_PATH}" >&2
  exit 1
fi

is_healthy() {
  curl -fsS --max-time 2 "http://${LISTEN_HOST}:${LISTEN_PORT}/health" >/dev/null 2>&1
}

if [ -f "${PID_FILE}" ]; then
  EXISTING_PID="$(cat "${PID_FILE}")"
  if kill -0 "${EXISTING_PID}" 2>/dev/null && is_healthy; then
    echo "host openclaw gateway already running (PID ${EXISTING_PID})"
    exit 0
  fi
  rm -f "${PID_FILE}"
fi

rm -f "${OUT_FILE}" "${ERR_FILE}"
(
  cd "${ROOT}"
  nohup env \
    OPENCLAW_CONFIG_PATH="${CONFIG_PATH}" \
    OPENCLAW_LOCAL_ALLOW_DIRECT_FALLBACK=true \
    OPENCLAW_LOCAL_HOST="${LISTEN_HOST}" \
    OPENCLAW_LOCAL_PORT="${LISTEN_PORT}" \
    "${NODE_BIN}" tools/openclaw-local-gateway.mjs >"${OUT_FILE}" 2>"${ERR_FILE}" &
  echo $! >"${PID_FILE}"
)

for _ in $(seq 1 20); do
  if is_healthy; then
    echo "host openclaw gateway started on http://${LISTEN_HOST}:${LISTEN_PORT}"
    exit 0
  fi
  sleep 1
done

echo "host openclaw gateway failed to start" >&2
tail -n 80 "${ERR_FILE}" 2>/dev/null || true
exit 1
