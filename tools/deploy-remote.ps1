param(
  [string]$RemoteHost = '120.24.251.24',
  [string]$RemoteUser = 'root',
  [string]$Password = '',
  [string]$ProjectDir = '/srv/ai-data-platform',
  [string]$Branch = 'master',
  [string]$HealthUrl = 'http://127.0.0.1:3100/api/health',
  [string]$Services = 'ai-data-platform-model-bridge ai-data-platform-api ai-data-platform-worker ai-data-platform-web',
  [string]$BuildPackages = 'api web worker'
)

$ErrorActionPreference = 'Stop'

if (-not $Password) {
  throw 'Password is required. Pass -Password or configure a secret wrapper.'
}

$root = Split-Path -Parent $PSScriptRoot
$remoteExec = 'C:\Users\soulzyn\develop\remote-tools\remote-exec.mjs'
$nodeBin = 'C:\Users\soulzyn\develop\node\node.exe'
$remoteScript = Join-Path $root 'deploy\server\update-server.sh'

if (-not (Test-Path $remoteExec)) {
  throw "Remote exec tool not found: $remoteExec"
}

if (-not (Test-Path $nodeBin)) {
  throw "Node binary not found: $nodeBin"
}

if (-not (Test-Path $remoteScript)) {
  throw "Remote update script not found: $remoteScript"
}

$scriptText = Get-Content -Path $remoteScript -Raw -Encoding UTF8
$scriptBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($scriptText))

$command = @"
python3 - <<'PY'
import base64
from pathlib import Path
content = base64.b64decode('$scriptBase64')
Path('/tmp/ai-data-platform-update.sh').write_bytes(content)
PY
chmod +x /tmp/ai-data-platform-update.sh
PROJECT_DIR='$ProjectDir' BRANCH='$Branch' HEALTH_URL='$HealthUrl' SERVICES='$Services' BUILD_PACKAGES='$BuildPackages' /tmp/ai-data-platform-update.sh
"@

& $nodeBin $remoteExec `
  --host $RemoteHost `
  --user $RemoteUser `
  --password $Password `
  --command $command
