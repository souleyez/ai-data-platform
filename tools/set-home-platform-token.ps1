param(
  [string]$Token = '',
  [switch]$Clear
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $root 'tmp\local-dev'
$tokenFile = Join-Path $runDir 'home-platform-token.txt'

New-Item -ItemType Directory -Force -Path $runDir | Out-Null

if ($Clear.IsPresent) {
  Remove-Item $tokenFile -Force -ErrorAction SilentlyContinue
  Write-Output 'home platform token cleared'
  exit 0
}

$normalizedToken = $Token.Trim()
if (-not $normalizedToken) {
  throw 'Token is required unless -Clear is used.'
}

Set-Content -Path $tokenFile -Value "$normalizedToken`n" -Encoding ascii
Write-Output "home platform token saved to $tokenFile"
