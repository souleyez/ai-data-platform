#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_DIR="${AI_DATA_PLATFORM_RUN_DIR:-${ROOT}/tmp/host-ollama}"
PID_FILE="${RUN_DIR}/host-ollama.pid"

if [ ! -f "${PID_FILE}" ]; then
  echo "host ollama is not running"
  exit 0
fi

PID="$(cat "${PID_FILE}")"
if kill -0 "${PID}" 2>/dev/null; then
  kill "${PID}" 2>/dev/null || true
  for _ in $(seq 1 10); do
    if ! kill -0 "${PID}" 2>/dev/null; then
      break
    fi
    sleep 1
  done
  if kill -0 "${PID}" 2>/dev/null; then
    kill -9 "${PID}" 2>/dev/null || true
  fi
fi

rm -f "${PID_FILE}"
echo "host ollama stopped"
