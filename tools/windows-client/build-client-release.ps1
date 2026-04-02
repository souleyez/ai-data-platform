param(
  [string]$Version = '',
  [string]$OutputDir = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

Assert-RequiredCommands -Commands @('git')

$repoRoot = $script:RepoRoot
$resolvedVersion = if ($Version) { $Version.Trim() } else { Get-DefaultClientVersion }
$resolvedOutputDir = if ($OutputDir) { $OutputDir } else { Join-Path $repoRoot 'tmp\client-releases' }

New-Item -ItemType Directory -Force -Path $resolvedOutputDir | Out-Null

$archivePath = Join-Path $resolvedOutputDir "ai-data-platform-$resolvedVersion.zip"
$manifestPath = Join-Path $resolvedOutputDir "ai-data-platform-$resolvedVersion.manifest.json"

if (Test-Path $archivePath) {
  Remove-Item -Force $archivePath
}

Push-Location $repoRoot
try {
  & git archive --format=zip --output=$archivePath HEAD
  if ($LASTEXITCODE -ne 0) {
    throw 'git archive failed'
  }
} finally {
  Pop-Location
}

$hash = (Get-FileHash -Algorithm SHA256 -Path $archivePath).Hash.ToLowerInvariant()
$size = (Get-Item $archivePath).Length
$manifest = [pscustomobject]@{
  package = 'ai-data-platform-runtime'
  version = $resolvedVersion
  archivePath = $archivePath
  archiveSha256 = $hash
  archiveSize = $size
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  gitCommit = (& git -C $repoRoot rev-parse HEAD).Trim()
}

Set-Content -Path $manifestPath -Value (($manifest | ConvertTo-Json -Depth 8) + "`n") -Encoding utf8

$manifest | Add-Member -NotePropertyName manifestPath -NotePropertyValue $manifestPath -Force
$manifest | ConvertTo-Json -Depth 8
