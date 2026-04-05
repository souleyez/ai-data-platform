#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${AI_DATA_PLATFORM_RUN_DIR:-${ROOT}/tmp/local-dev-linux}"

kill_pid() {
  local pid="$1"
  if [ -z "${pid}" ]; then
    return 0
  fi
  if kill -0 "${pid}" 2>/dev/null; then
    kill "${pid}" 2>/dev/null || true
    sleep 1
    if kill -0 "${pid}" 2>/dev/null; then
      kill -9 "${pid}" 2>/dev/null || true
    fi
  fi
}

for name in gateway api worker web; do
  pid_file="${RUN_DIR}/${name}.pid"
  if [ -f "${pid_file}" ]; then
    kill_pid "$(cat "${pid_file}")"
    rm -f "${pid_file}"
  fi
  rm -f "${RUN_DIR}/${name}.out.log" "${RUN_DIR}/${name}.err.log"
done

echo "local services stopped"
