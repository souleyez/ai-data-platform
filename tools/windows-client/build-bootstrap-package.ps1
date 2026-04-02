$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$outputDir = Join-Path $script:RepoRoot 'tmp\bootstrap-client'
$stagingDir = Join-Path $outputDir 'bootstrap-package'
$archivePath = Join-Path $outputDir 'ai-data-platform-bootstrap.zip'
$manifestPath = Join-Path $outputDir 'ai-data-platform-bootstrap.manifest.json'

if (-not $script:RepoRoot) {
  throw 'Bootstrap package build must run from the repository checkout.'
}

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
Remove-Item -Path $stagingDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null

Copy-Item -Path (Join-Path $PSScriptRoot '*') -Destination $stagingDir -Recurse -Force

$openClawInstaller = Join-Path $script:RepoRoot 'tools\install-openclaw-latest.ps1'
if (-not (Test-Path $openClawInstaller)) {
  throw "OpenClaw installer not found: $openClawInstaller"
}
Copy-Item -Path $openClawInstaller -Destination (Join-Path $stagingDir 'install-openclaw-latest.ps1') -Force

if (Test-Path $archivePath) {
  Remove-Item -Path $archivePath -Force
}

Compress-Archive -Path (Join-Path $stagingDir '*') -DestinationPath $archivePath -Force

$manifest = [pscustomobject]@{
  package = 'ai-data-platform-bootstrap'
  bootstrapVersion = Get-BootstrapVersion
  archivePath = $archivePath
  archiveSha256 = (Get-FileHash -Algorithm SHA256 -Path $archivePath).Hash.ToLowerInvariant()
  archiveSize = (Get-Item $archivePath).Length
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
}

Set-Content -Path $manifestPath -Value (($manifest | ConvertTo-Json -Depth 8) + "`n") -Encoding utf8

[pscustomobject]@{
  status = 'ok'
  package = $manifest.package
  bootstrapVersion = $manifest.bootstrapVersion
  archivePath = $archivePath
  manifestPath = $manifestPath
} | ConvertTo-Json -Depth 8
