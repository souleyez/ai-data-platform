param(
  [Parameter(Mandatory = $true)][string]$ArtifactUrl,
  [string]$Version = '',
  [string]$ProjectKey = '',
  [string]$Channel = 'stable',
  [string]$MinSupportedVersion = '',
  [string]$ReleaseNotes = '',
  [switch]$Publish
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$state = Get-ClientState
$effectiveProjectKey = Set-ClientProjectKey -State $state -ProjectKey $ProjectKey
$adminToken = if ($env:AI_DATA_PLATFORM_ADMIN_TOKEN) {
  $env:AI_DATA_PLATFORM_ADMIN_TOKEN.Trim()
} elseif ($env:CONTROL_PLANE_ADMIN_TOKEN) {
  $env:CONTROL_PLANE_ADMIN_TOKEN.Trim()
} else {
  ''
}
$adminSessionToken = if ($env:AI_DATA_PLATFORM_ADMIN_SESSION_TOKEN) {
  $env:AI_DATA_PLATFORM_ADMIN_SESSION_TOKEN.Trim()
} elseif ($env:CONTROL_PLANE_ADMIN_SESSION_TOKEN) {
  $env:CONTROL_PLANE_ADMIN_SESSION_TOKEN.Trim()
} else {
  ''
}
$resolvedVersion = if ($Version) { $Version.Trim() } else { Get-DefaultClientVersion }
$manifestPath = Join-Path (Join-Path $script:RepoRoot 'tmp\client-releases') "ai-data-platform-$resolvedVersion.manifest.json"

if (-not (Test-Path $manifestPath)) {
  throw "Release manifest not found: $manifestPath. Run build-client-release.ps1 first."
}

$manifest = Get-Content -Path $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
$createResponse = Invoke-ControlPlaneJson -State $state -Path '/api/admin/releases' -Method 'POST' -Body @{
  projectKey = $effectiveProjectKey
  channel = $Channel
  version = $resolvedVersion
  artifactUrl = $ArtifactUrl
  artifactSha256 = [string]$manifest.archiveSha256
  artifactSize = [int64]$manifest.archiveSize
  openclawVersion = [string]$state.openClaw.version
  installerVersion = $resolvedVersion
  minSupportedVersion = $MinSupportedVersion
  releaseNotes = $ReleaseNotes
} -AdminToken $adminToken -AdminSessionToken $adminSessionToken

if ($Publish) {
  $publishResponse = Invoke-ControlPlaneJson -State $state -Path "/api/admin/releases/$($createResponse.item.id)/publish" -Method 'POST' -AdminToken $adminToken -AdminSessionToken $adminSessionToken
  [pscustomobject]@{
    status = 'ok'
    projectKey = $effectiveProjectKey
    created = $createResponse.item
    published = $publishResponse.item
  } | ConvertTo-Json -Depth 12
  exit 0
}

[pscustomobject]@{
  status = 'ok'
  projectKey = $effectiveProjectKey
  created = $createResponse.item
} | ConvertTo-Json -Depth 12
