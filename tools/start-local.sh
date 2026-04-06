#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${AI_DATA_PLATFORM_RUN_DIR:-${ROOT}/tmp/local-dev-linux}"
TOKEN_FILE="${RUN_DIR}/home-platform-token.txt"
mkdir -p "${RUN_DIR}"

wait_for_port() {
  local port="$1"
  local timeout="${2:-20}"
  local waited=0
  while [ "${waited}" -lt "${timeout}" ]; do
    if python3 - "$port" <<'PY'
import socket, sys
s = socket.socket()
s.settimeout(0.5)
try:
    s.connect(("127.0.0.1", int(sys.argv[1])))
    sys.exit(0)
except OSError:
    sys.exit(1)
finally:
    s.close()
PY
    then
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done
  return 1
}

start_service() {
  local name="$1"
  local workdir="$2"
  local command="$3"
  local pid_file="${RUN_DIR}/${name}.pid"
  local stdout_file="${RUN_DIR}/${name}.out.log"
  local stderr_file="${RUN_DIR}/${name}.err.log"
  local port="${4:-}"

  if [ -f "${pid_file}" ]; then
    local existing_pid
    existing_pid="$(cat "${pid_file}")"
    if kill -0 "${existing_pid}" 2>/dev/null; then
      if [ -z "${port}" ] || wait_for_port "${port}" 1; then
        echo "${name} already running (PID ${existing_pid})"
        return 0
      fi
    fi
    rm -f "${pid_file}"
  fi

  rm -f "${stdout_file}" "${stderr_file}"
  (
    cd "${workdir}"
    nohup bash -lc "${command}" >"${stdout_file}" 2>"${stderr_file}" &
    echo $! >"${pid_file}"
  )

  local pid
  pid="$(cat "${pid_file}")"
  if [ -n "${port}" ]; then
    if ! wait_for_port "${port}" 30; then
      echo "${name} failed to bind port ${port}" >&2
      tail -n 40 "${stderr_file}" 2>/dev/null || true
      return 1
    fi
  else
    sleep 1
    if ! kill -0 "${pid}" 2>/dev/null; then
      echo "${name} exited during startup" >&2
      tail -n 40 "${stderr_file}" 2>/dev/null || true
      return 1
    fi
  fi

  echo "${name} started (PID ${pid})"
}

bash "${ROOT}/tools/stop-local.sh" >/dev/null 2>&1 || true

HOME_PLATFORM_TOKEN=""
if [ -f "${TOKEN_FILE}" ]; then
  HOME_PLATFORM_TOKEN="$(tr -d '\r\n' <"${TOKEN_FILE}")"
fi

OPENCLAW_CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-${HOME}/.openclaw/openclaw.json}"
start_service "gateway" "${ROOT}" "OPENCLAW_CONFIG_PATH='${OPENCLAW_CONFIG_PATH}' OPENCLAW_LOCAL_ALLOW_DIRECT_FALLBACK=true node tools/openclaw-local-gateway.mjs" "18789"
sleep 2

start_service "api" "${ROOT}/apps/api" "HOME_PLATFORM_TOKEN='${HOME_PLATFORM_TOKEN}' corepack pnpm exec tsx src/server.ts" "3100"
sleep 2

start_service "worker" "${ROOT}/apps/worker" "node dist/index.js"
sleep 1

start_service "web" "${ROOT}/apps/web" "corepack pnpm exec next start -p 3002" "3002"
sleep 2

bash "${ROOT}/tools/status-local.sh"
