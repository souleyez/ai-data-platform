$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$state = Get-ClientState
if (-not $state.pendingRelease) {
  throw 'No pending release. Run check-client-update.ps1 first.'
}
if (-not $state.download -or $state.download.status -ne 'completed') {
  throw 'No completed download. Run download-client-update.ps1 first.'
}

$version = [string]$state.pendingRelease.version
$archivePath = [string]$state.download.destination
$destination = Join-Path $script:ClientReleasesDir $version

if (-not (Test-Path $archivePath)) {
  throw "Downloaded archive missing: $archivePath"
}

if (Test-Path $destination) {
  Remove-Item -Path $destination -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $destination | Out-Null
Expand-Archive -LiteralPath $archivePath -DestinationPath $destination -Force

$installCommand = 'corepack pnpm install'
$buildWorkerCommand = 'corepack pnpm --filter worker build'
$buildWebCommand = 'corepack pnpm --filter web build'

Push-Location $destination
try {
  & powershell -NoProfile -Command $installCommand | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'Dependency install failed after applying update.'
  }

  & powershell -NoProfile -Command $buildWorkerCommand | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'Worker build failed after applying update.'
  }

  & powershell -NoProfile -Command $buildWebCommand | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'Web build failed after applying update.'
  }
} finally {
  Pop-Location
}

$startScript = Join-Path $destination 'tools\start-local.ps1'
if (-not (Test-Path $startScript)) {
  throw "Release package missing tools/start-local.ps1: $destination"
}

$state.currentReleasePath = $destination
$state.currentVersion = $version
Update-InstalledVersionsList -State $state -Version $version
Save-ClientState -State $state

[pscustomobject]@{
  status = 'ok'
  currentVersion = $state.currentVersion
  currentReleasePath = $state.currentReleasePath
} | ConvertTo-Json -Depth 8
