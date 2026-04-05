#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${AI_DATA_PLATFORM_RUN_DIR:-${ROOT}/tmp/local-dev-linux}"
TOKEN_FILE="${RUN_DIR}/home-platform-token.txt"

service_state() {
  local name="$1"
  local port="${2:-}"
  local pid_file="${RUN_DIR}/${name}.pid"
  local pid=""
  local state="stopped"

  if [ -f "${pid_file}" ]; then
    pid="$(cat "${pid_file}")"
    if kill -0 "${pid}" 2>/dev/null; then
      state="running"
    else
      state="stale"
    fi
  fi

  printf "%-8s %-8s %-6s %s\n" "${name}" "${pid:--}" "${port:--}" "${state}"
}

echo "SERVICE  PID      PORT   STATE"
service_state gateway 18789
service_state api 3100
service_state worker -
service_state web 3002

if [ -f "${TOKEN_FILE}" ] && [ -n "$(tr -d '\r\n' <"${TOKEN_FILE}")" ]; then
  echo "home platform token: configured"
else
  echo "home platform token: not configured"
fi
