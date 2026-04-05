param(
  [string]$ProjectKey = 'android-tv'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$originalClientRoot = $env:AI_DATA_PLATFORM_CLIENT_ROOT
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("aidp-client-project-scope-{0}" -f [guid]::NewGuid().ToString('n'))
$env:AI_DATA_PLATFORM_CLIENT_ROOT = $tempRoot

try {
  . (Join-Path $PSScriptRoot 'common.ps1')

  function Assert-Equal {
    param(
      [Parameter(Mandatory)]$Actual,
      [Parameter(Mandatory)]$Expected,
      [Parameter(Mandatory)][string]$Message
    )

    if ($Actual -ne $Expected) {
      throw "$Message Expected '$Expected' but got '$Actual'."
    }
  }

  $defaultState = Get-ClientState
  Assert-Equal -Actual $defaultState.projectKey -Expected 'windows-client' -Message 'Default client project key mismatch.'
  Assert-Equal -Actual $defaultState.schemaVersion -Expected 2 -Message 'Client state schema version mismatch.'

  $defaultState.session.token = 'session-demo-token'
  $defaultState.session.expiresAt = [DateTimeOffset]::UtcNow.AddHours(1).ToString('o')
  $defaultState.modelLease = [pscustomobject]@{
    providerScope = 'moonshot'
    token = 'lease-demo-token'
    expiresAt = [DateTimeOffset]::UtcNow.AddMinutes(30).ToString('o')
  }
  $defaultState.pendingRelease = [pscustomobject]@{
    version = '2026.04.04+001'
  }

  $resolvedProjectKey = Set-ClientProjectKey -State $defaultState -ProjectKey $ProjectKey
  Save-ClientState -State $defaultState

  Assert-Equal -Actual $resolvedProjectKey -Expected $ProjectKey.ToLowerInvariant() -Message 'Resolved project key mismatch.'
  Assert-Equal -Actual $defaultState.projectKey -Expected $ProjectKey.ToLowerInvariant() -Message 'Persisted project key mismatch.'
  Assert-Equal -Actual $defaultState.session.token -Expected '' -Message 'Session token should be cleared when project changes.'
  if ($null -ne $defaultState.modelLease) {
    throw 'Model lease should be cleared when project changes.'
  }
  if ($null -ne $defaultState.pendingRelease) {
    throw 'Pending release should be cleared when project changes.'
  }

  $reloadedState = Get-ClientState
  Assert-Equal -Actual $reloadedState.projectKey -Expected $ProjectKey.ToLowerInvariant() -Message 'Reloaded project key mismatch.'
  Assert-Equal -Actual ([bool](Test-SessionValid -State $reloadedState)) -Expected $false -Message 'Session should be invalid after project change.'

  [pscustomobject]@{
    status = 'ok'
    defaultProjectKey = 'windows-client'
    projectKey = [string]$reloadedState.projectKey
    schemaVersion = [int]$reloadedState.schemaVersion
    statePath = $script:ClientStatePath
  } | ConvertTo-Json -Depth 6
} finally {
  if ($originalClientRoot) {
    $env:AI_DATA_PLATFORM_CLIENT_ROOT = $originalClientRoot
  } else {
    Remove-Item Env:AI_DATA_PLATFORM_CLIENT_ROOT -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
