$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$state = Get-ClientState
$statusScript = Resolve-WorkspaceToolPath -State $state -RelativePath 'tools\status-local.ps1'
$runtimeStatus = ''

if (Test-Path $statusScript) {
  $runtimeStatus = & powershell -ExecutionPolicy Bypass -File $statusScript | Out-String
}

[pscustomobject]@{
  clientRoot = $script:ClientRoot
  bootstrapRoot = [string]$state.bootstrapRoot
  bootstrapVersion = [string]$state.bootstrapVersion
  workspacePath = $state.workspacePath
  currentReleasePath = $state.currentReleasePath
  currentVersion = $state.currentVersion
  channel = $state.channel
  phone = $state.phone
  sessionValid = (Test-SessionValid -State $state)
  modelAccess = $state.modelAccess
  modelLease = $state.modelLease
  modelLeaseValid = (Test-ClientModelLeaseValid -State $state)
  policy = $state.lastPolicy
  pendingReleaseVersion = if ($state.pendingRelease) { [string]$state.pendingRelease.version } else { '' }
  downloadStatus = if ($state.download) { [string]$state.download.status } else { '' }
  backgroundUpdate = $state.backgroundUpdate
  preflightStatus = if ($state.prerequisites -and $state.prerequisites.status) { [string]$state.prerequisites.status } else { '' }
  prerequisites = $state.prerequisites
  controlPlaneBaseUrl = Get-ControlPlaneBaseUrl -State $state
  openClawVersion = [string]$state.openClaw.version
  openClawDistro = [string]$state.openClaw.distro
  runtimeStatus = $runtimeStatus.Trim()
} | ConvertTo-Json -Depth 10
