$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

function Set-BackgroundUpdateState {
  param(
    [Parameter(Mandatory)]$State,
    [Parameter(Mandatory)][string]$Status,
    [Parameter(Mandatory)][string]$Stage,
    [string]$Message = '',
    [string]$ReleaseVersion = ''
  )

  $State.backgroundUpdate = [pscustomobject]@{
    status = $Status
    stage = $Stage
    pid = $PID
    releaseVersion = $ReleaseVersion
    message = $Message
    updatedAt = (Get-Date).ToUniversalTime().ToString('o')
  }
  Save-ClientState -State $State
}

try {
  $state = Get-ClientState
  Set-BackgroundUpdateState -State $state -Status 'running' -Stage 'checking' -Message 'Checking control plane for a newer release.'

  if (-not (Test-SessionValid -State $state)) {
    Set-BackgroundUpdateState -State $state -Status 'blocked' -Stage 'auth_required' -Message 'No valid client session. Background update skipped.'
    [pscustomobject]@{
      status = 'blocked'
      reason = 'auth_required'
    } | ConvertTo-Json -Depth 8
    exit 0
  }

  $policy = Invoke-ControlPlaneJson -State $state -Path '/api/client/policy' -SessionToken $state.session.token
  $release = Invoke-ControlPlaneJson -State $state -Path "/api/client/releases/latest?channel=$($state.channel)" -SessionToken $state.session.token
  $state.lastPolicy = $policy.policy
  $state.pendingRelease = $release.release
  Save-ClientState -State $state

  if (-not $release.release -or -not $release.release.version) {
    Set-BackgroundUpdateState -State $state -Status 'idle' -Stage 'up_to_date' -Message 'No published release available for this channel.'
    [pscustomobject]@{
      status = 'idle'
      message = 'No published release available.'
    } | ConvertTo-Json -Depth 8
    exit 0
  }

  $releaseVersion = [string]$release.release.version
  if ($state.currentVersion -and $state.currentVersion -eq $releaseVersion) {
    Set-BackgroundUpdateState -State $state -Status 'idle' -Stage 'up_to_date' -Message 'Client is already on the latest release.' -ReleaseVersion $releaseVersion
    [pscustomobject]@{
      status = 'idle'
      releaseVersion = $releaseVersion
      message = 'Already on the latest release.'
    } | ConvertTo-Json -Depth 8
    exit 0
  }

  Set-BackgroundUpdateState -State $state -Status 'running' -Stage 'downloading' -Message 'Downloading release package in the background.' -ReleaseVersion $releaseVersion
  $downloadText = & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'download-client-update.ps1') | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw 'Background download step failed.'
  }
  $download = $downloadText | ConvertFrom-Json
  $state = Get-ClientState

  if ($download.status -ne 'completed') {
    Set-BackgroundUpdateState -State $state -Status 'running' -Stage 'downloading' -Message 'Release is still downloading in the background.' -ReleaseVersion $releaseVersion
    [pscustomobject]@{
      status = 'running'
      stage = 'downloading'
      releaseVersion = $releaseVersion
      download = $download
    } | ConvertTo-Json -Depth 8
    exit 0
  }

  if (Test-ClientRuntimeRunning -State $state) {
    Set-BackgroundUpdateState -State $state -Status 'ready' -Stage 'waiting_for_restart' -Message 'Release package is ready and will apply on the next restart.' -ReleaseVersion $releaseVersion
    [pscustomobject]@{
      status = 'ready'
      stage = 'waiting_for_restart'
      releaseVersion = $releaseVersion
    } | ConvertTo-Json -Depth 8
    exit 0
  }

  Set-BackgroundUpdateState -State $state -Status 'running' -Stage 'applying' -Message 'Applying downloaded release.' -ReleaseVersion $releaseVersion
  $applyText = & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'apply-client-update.ps1') | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw 'Background apply step failed.'
  }
  $apply = $applyText | ConvertFrom-Json
  $state = Get-ClientState
  Set-BackgroundUpdateState -State $state -Status 'applied' -Stage 'completed' -Message 'Downloaded release has been applied successfully.' -ReleaseVersion $releaseVersion

  [pscustomobject]@{
    status = 'applied'
    releaseVersion = $releaseVersion
    apply = $apply
  } | ConvertTo-Json -Depth 8
} catch {
  $state = Get-ClientState
  Set-BackgroundUpdateState -State $state -Status 'error' -Stage 'failed' -Message $_.Exception.Message
  throw
}
