param(
  [string]$Distro = ''
)

$ErrorActionPreference = 'Stop'

if (-not $Distro) {
  $Distro = if ($env:OPENCLAW_WSL_DISTRO) {
    $env:OPENCLAW_WSL_DISTRO
  } else {
    'Ubuntu-24.04'
  }
}

function Convert-WindowsPathToWsl {
  param([Parameter(Mandatory)][string]$Path)

  $resolved = (Resolve-Path $Path).Path
  $drive = $resolved.Substring(0, 1).ToLowerInvariant()
  $suffix = $resolved.Substring(2) -replace '\\', '/'
  return "/mnt/$drive$suffix"
}

$tempDir = Join-Path $env:TEMP 'ai-data-platform-openclaw'
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
$tempScriptPath = Join-Path $tempDir ("install-openclaw-wsl-{0}.sh" -f [guid]::NewGuid().ToString('n'))

$script = @'
#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

retry_npm_install() {
  local attempts=0
  local max_attempts=4
  while true; do
    if npm install -g openclaw@latest --force --prefer-offline --no-fund --no-audit; then
      return 0
    fi
    attempts=$((attempts + 1))
    if [ "${attempts}" -ge "${max_attempts}" ]; then
      return 1
    fi
    npm uninstall -g openclaw || true
    NPM_ROOT="$(npm root -g)"
    rm -rf "${NPM_ROOT}/openclaw" "${NPM_ROOT}"/.openclaw-* || true
    sleep $((attempts * 10))
  done
}

ensure_node() {
  local install_node=0
  if ! command -v node >/dev/null 2>&1; then
    install_node=1
  elif [ "$(node -p "process.versions.node.split('.')[0]")" -lt 22 ]; then
    install_node=1
  fi

  if [ "${install_node}" -eq 1 ]; then
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    if [ ! -f /etc/apt/keyrings/nodesource.gpg ]; then
      curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
      chmod a+r /etc/apt/keyrings/nodesource.gpg
    fi
    cat >/etc/apt/sources.list.d/nodesource.list <<EOF
deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main
EOF
    apt-get update -y
    apt-get install -y nodejs
  fi
}

ensure_node
retry_npm_install

NPM_ROOT="$(npm root -g)"
OPENCLAW_ENTRY="${NPM_ROOT}/openclaw/dist/entry.js"
if [ ! -f "${OPENCLAW_ENTRY}" ]; then
  echo "openclaw_entry_not_found"
  exit 1
fi

cat >/usr/local/bin/openclaw-gateway-start <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
NPM_ROOT="$(npm root -g)"
OPENCLAW_ENTRY="${NPM_ROOT}/openclaw/dist/entry.js"
PID_FILE="/var/run/openclaw-gateway.pid"
LOG_DIR="/var/log/openclaw"
LOG_FILE="${LOG_DIR}/gateway.log"
mkdir -p "${LOG_DIR}"
if [ -f "${PID_FILE}" ]; then
  EXISTING_PID="$(cat "${PID_FILE}")"
  if kill -0 "${EXISTING_PID}" 2>/dev/null; then
    exit 0
  fi
fi
nohup node "${OPENCLAW_ENTRY}" gateway --port 18789 >>"${LOG_FILE}" 2>&1 &
echo $! > "${PID_FILE}"
EOF
chmod +x /usr/local/bin/openclaw-gateway-start

cat >/usr/local/bin/openclaw-gateway-stop <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
PID_FILE="/var/run/openclaw-gateway.pid"
if [ -f "${PID_FILE}" ]; then
  PID="$(cat "${PID_FILE}")"
  if kill -0 "${PID}" 2>/dev/null; then
    kill "${PID}" || true
    sleep 1
  fi
  rm -f "${PID_FILE}"
fi
EOF
chmod +x /usr/local/bin/openclaw-gateway-stop

cat >/usr/local/bin/openclaw-gateway-restart <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
/usr/local/bin/openclaw-gateway-stop || true
/usr/local/bin/openclaw-gateway-start
EOF
chmod +x /usr/local/bin/openclaw-gateway-restart

/usr/local/bin/openclaw-gateway-restart
node "${OPENCLAW_ENTRY}" --version 2>/dev/null || true
'@

Set-Content -Path $tempScriptPath -Value $script -Encoding utf8
$wslScriptPath = Convert-WindowsPathToWsl -Path $tempScriptPath

try {
  $result = & wsl.exe -d $Distro -u root -- bash $wslScriptPath
  if ($LASTEXITCODE -ne 0) {
    throw "OpenClaw install failed in WSL distro $Distro"
  }
} finally {
  Remove-Item -Path $tempScriptPath -Force -ErrorAction SilentlyContinue
}

$startupFile = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\wake-openclaw-wsl.bat'
$startupDir = Split-Path -Parent $startupFile
New-Item -ItemType Directory -Force -Path $startupDir | Out-Null
Set-Content -Path $startupFile -Encoding ascii -Value @"
@echo off
REM Wake WSL and restart OpenClaw gateway
wsl -d $Distro -u root -- bash -lc "/usr/local/bin/openclaw-gateway-start >/dev/null 2>&1"
"@

Write-Output "OpenClaw latest installed in WSL distro: $Distro"
Write-Output $result
