$ErrorActionPreference = 'Stop'

$distro = $env:OPENCLAW_WSL_DISTRO
if (-not $distro) {
  $distro = 'Ubuntu-24.04'
}

$script = @'
set -e

if ! command -v npm >/dev/null 2>&1; then
  echo "npm_not_found"
  exit 1
fi

npm install -g openclaw@latest

NPM_ROOT="$(npm root -g)"
OPENCLAW_ENTRY="${NPM_ROOT}/openclaw/dist/entry.js"

if [ ! -f "${OPENCLAW_ENTRY}" ]; then
  echo "openclaw_entry_not_found"
  exit 1
fi

OPENCLAW_VERSION="$(node "${OPENCLAW_ENTRY}" --version 2>/dev/null || true)"
mkdir -p ~/.config/systemd/user

cat > ~/.config/systemd/user/openclaw-gateway.service <<EOF
[Unit]
Description=OpenClaw Gateway
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=$(command -v node) ${OPENCLAW_ENTRY} gateway --port 18789
Restart=always
RestartSec=5
TimeoutStopSec=30
TimeoutStartSec=30
SuccessExitStatus=0 143
KillMode=control-group
Environment=HOME=%h
Environment=PATH=$(dirname "$(command -v node)"):$PATH
Environment=OPENCLAW_GATEWAY_PORT=18789
Environment=OPENCLAW_SERVICE_VERSION=${OPENCLAW_VERSION}

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable openclaw-gateway.service
systemctl --user restart openclaw-gateway.service
(loginctl enable-linger "$USER" >/dev/null 2>&1 || true)
printf '%s\n' "${OPENCLAW_VERSION}"
'@

$result = wsl.exe -d $distro -- bash -lc $script
if ($LASTEXITCODE -ne 0) {
  throw "OpenClaw install failed in WSL distro $distro"
}

$startupFile = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\wake-openclaw-wsl.bat'
$startupDir = Split-Path -Parent $startupFile
New-Item -ItemType Directory -Force -Path $startupDir | Out-Null
Set-Content -Path $startupFile -Encoding ascii -Value @"
@echo off
REM Wake WSL and restart OpenClaw gateway
wsl -d $distro -- bash -lc "systemctl --user restart openclaw-gateway.service"
"@

Write-Output "OpenClaw latest installed in WSL distro: $distro"
Write-Output $result
