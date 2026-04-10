#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_DIR="${AI_DATA_PLATFORM_RUN_DIR:-${ROOT}/tmp/host-ollama}"
PID_FILE="${RUN_DIR}/host-ollama.pid"
OUT_FILE="${RUN_DIR}/host-ollama.out.log"
ERR_FILE="${RUN_DIR}/host-ollama.err.log"
OLLAMA_BIN="${HOST_OLLAMA_BIN:-$(command -v ollama || true)}"
LISTEN_ADDR="${HOST_OLLAMA_LISTEN_ADDR:-127.0.0.1:11435}"
MODELS_DIR="${HOST_OLLAMA_MODELS_DIR:-${HOME}/.ollama-host/models}"

mkdir -p "${RUN_DIR}" "${MODELS_DIR}"

if [ -z "${OLLAMA_BIN}" ]; then
  echo "Ollama binary not found. Set HOST_OLLAMA_BIN or install Ollama first." >&2
  exit 1
fi

is_healthy() {
  curl -fsS --max-time 2 "http://${LISTEN_ADDR}/api/tags" >/dev/null 2>&1
}

if [ -f "${PID_FILE}" ]; then
  EXISTING_PID="$(cat "${PID_FILE}")"
  if kill -0 "${EXISTING_PID}" 2>/dev/null && is_healthy; then
    echo "host ollama already running on http://${LISTEN_ADDR} (PID ${EXISTING_PID})"
    exit 0
  fi
  rm -f "${PID_FILE}"
fi

rm -f "${OUT_FILE}" "${ERR_FILE}"
(
  cd "${ROOT}"
  nohup env \
    OLLAMA_HOST="${LISTEN_ADDR}" \
    OLLAMA_MODELS="${MODELS_DIR}" \
    "${OLLAMA_BIN}" serve >"${OUT_FILE}" 2>"${ERR_FILE}" &
  echo $! >"${PID_FILE}"
)

for _ in $(seq 1 30); do
  if is_healthy; then
    echo "host ollama started on http://${LISTEN_ADDR}"
    exit 0
  fi
  sleep 1
done

echo "host ollama failed to start" >&2
tail -n 80 "${ERR_FILE}" 2>/dev/null || true
exit 1
