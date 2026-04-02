param(
  [string]$Phone = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

function Start-BackgroundUpdater {
  param([Parameter(Mandatory)]$State)

  $existingPid = ''
  if ($State.backgroundUpdate -and $State.backgroundUpdate.pid) {
    $existingPid = [string]$State.backgroundUpdate.pid
  }
  if ($existingPid) {
    $existingProcess = Get-Process -Id ([int]$existingPid) -ErrorAction SilentlyContinue
    if ($existingProcess) {
      return
    }
  }

  $proc = Start-Process `
    -FilePath 'powershell' `
    -ArgumentList @(
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', (Join-Path $PSScriptRoot 'run-client-background-update.ps1')
    ) `
    -WindowStyle Hidden `
    -PassThru

  $releaseVersion = if ($State.pendingRelease) { [string]$State.pendingRelease.version } else { '' }

  $State.backgroundUpdate = [pscustomobject]@{
    status = 'scheduled'
    stage = 'queued'
    pid = $proc.Id
    releaseVersion = $releaseVersion
    message = 'Background updater has been scheduled.'
    updatedAt = (Get-Date).ToUniversalTime().ToString('o')
  }
  Save-ClientState -State $State
}

$state = Get-ClientState
if ($Phone) {
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'auth-client.ps1') -Phone $Phone | Out-Null
  $state = Get-ClientState
}

if (-not (Test-SessionValid -State $state)) {
  throw 'No valid client session. Pass -Phone or run auth-client.ps1 first.'
}

if ($state.lastAuth -and $state.lastAuth.upgrade -and $state.lastAuth.upgrade.state -eq 'force_upgrade_required') {
  throw 'Client is blocked by a forced upgrade requirement. Run check-client-update.ps1 and apply-client-update.ps1 first.'
}

$modelAccessMode = ''
if ($state.lastPolicy -and $state.lastPolicy.modelAccessMode) {
  $modelAccessMode = [string]$state.lastPolicy.modelAccessMode
} elseif ($state.modelAccess -and $state.modelAccess.mode) {
  $modelAccessMode = [string]$state.modelAccess.mode
}

if ($modelAccessMode -eq 'lease' -and -not (Test-ClientModelLeaseValid -State $state)) {
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'lease-client-model.ps1') | Out-Null
  $state = Get-ClientState
}

if ($state.download -and [string]$state.download.status -eq 'completed' -and $state.pendingRelease -and [string]$state.pendingRelease.version -and [string]$state.pendingRelease.version -ne [string]$state.currentVersion) {
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'apply-client-update.ps1') | Out-Null
  $state = Get-ClientState
}

$startScript = Resolve-WorkspaceToolPath -State $state -RelativePath 'tools\start-local.ps1'
if (-not (Test-Path $startScript)) {
  throw "Runtime start script not found: $startScript"
}

& powershell -ExecutionPolicy Bypass -File $startScript
Start-BackgroundUpdater -State $state
