#!/usr/bin/env bash
set -euo pipefail

need_sudo=0
if [ "$(id -u)" -ne 0 ]; then
  need_sudo=1
fi

run_root() {
  if [ "${need_sudo}" -eq 1 ]; then
    sudo bash -lc "$1"
  else
    bash -lc "$1"
  fi
}

node_major=0
if command -v node >/dev/null 2>&1; then
  node_major="$(node -p "process.versions.node.split('.')[0]")"
fi

if [ "${node_major}" -lt 22 ]; then
  run_root '
    set -euo pipefail
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    if [ ! -f /etc/apt/keyrings/nodesource.gpg ]; then
      curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
      chmod a+r /etc/apt/keyrings/nodesource.gpg
    fi
    cat >/etc/apt/sources.list.d/nodesource.list <<'\''EOF'\''
deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main
EOF
    apt-get update -y
    apt-get install -y nodejs
  '
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not available after Node.js installation" >&2
  exit 1
fi

if [ "${need_sudo}" -eq 1 ]; then
  sudo npm install -g openclaw@latest --force --prefer-offline --no-fund --no-audit
else
  npm install -g openclaw@latest --force --prefer-offline --no-fund --no-audit
fi

if ! command -v openclaw >/dev/null 2>&1; then
  echo "openclaw CLI not found after installation" >&2
  exit 1
fi

openclaw --version | tail -n 1
