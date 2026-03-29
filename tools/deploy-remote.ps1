param(
  [Alias('Host')]
  [string]$RemoteHost = '120.24.251.24',
  [Alias('User')]
  [string]$RemoteUser = 'root',
  [string]$Password = '',
  [string]$ProjectDir = '/srv/ai-data-platform',
  [string]$Branch = 'master',
  [string]$RemoteName = 'origin',
  [string]$HealthUrl = 'http://127.0.0.1:3100/api/health',
  [ValidateSet('fail', 'stash-safe')]
  [string]$RemoteWorktreeMode = 'fail',
  [switch]$PreflightOnly,
  [int]$HealthTimeout = 20,
  [string]$Services = 'ai-data-platform-model-bridge ai-data-platform-api ai-data-platform-worker ai-data-platform-web',
  [string]$BuildPackages = 'api web worker',
  [string]$StashMessage = ''
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

function ConvertTo-ShellLiteral {
  param([string]$Value)
  return "'" + ($Value -replace "'", "'""'""'") + "'"
}

$scriptText = Get-Content -Path $remoteScript -Raw -Encoding UTF8
$scriptBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($scriptText))
$preflightFlag = if ($PreflightOnly.IsPresent) { '1' } else { '0' }
$stashMessageValue = if ([string]::IsNullOrWhiteSpace($StashMessage)) {
  "ai-data-platform deploy preflight $(Get-Date -Format 'yyyyMMddTHHmmss')"
} else {
  $StashMessage
}

$command = @"
python3 - <<'PY'
import base64
from pathlib import Path
content = base64.b64decode('$scriptBase64')
Path('/tmp/ai-data-platform-update.sh').write_bytes(content)
PY
chmod +x /tmp/ai-data-platform-update.sh
PROJECT_DIR=$(ConvertTo-ShellLiteral $ProjectDir) BRANCH=$(ConvertTo-ShellLiteral $Branch) REMOTE_NAME=$(ConvertTo-ShellLiteral $RemoteName) HEALTH_URL=$(ConvertTo-ShellLiteral $HealthUrl) HEALTH_TIMEOUT=$(ConvertTo-ShellLiteral ([string]$HealthTimeout)) REMOTE_WORKTREE_MODE=$(ConvertTo-ShellLiteral $RemoteWorktreeMode) PREFLIGHT_ONLY=$(ConvertTo-ShellLiteral $preflightFlag) STASH_MESSAGE=$(ConvertTo-ShellLiteral $stashMessageValue) SERVICES=$(ConvertTo-ShellLiteral $Services) BUILD_PACKAGES=$(ConvertTo-ShellLiteral $BuildPackages) /tmp/ai-data-platform-update.sh
"@

& $nodeBin $remoteExec `
  --host $RemoteHost `
  --user $RemoteUser `
  --password $Password `
  --command $command
