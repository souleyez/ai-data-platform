param(
  [string]$WorkspacePath = '',
  [string]$ControlPlaneBaseUrl = '',
  [string]$ProjectKey = '',
  [switch]$SkipOpenClawInstall,
  [switch]$SkipPrereqChecks,
  [switch]$RelaunchedAsAdmin,
  [string]$ResultPath = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

function ConvertTo-ArgumentString {
  param([Parameter(Mandatory)][string[]]$Arguments)

  return [string]::Join(' ', ($Arguments | ForEach-Object {
    if ($_ -match '\s') {
      '"' + ($_ -replace '"', '\"') + '"'
    } else {
      $_
    }
  }))
}

function Write-InstallResult {
  param([Parameter(Mandatory)]$Payload)

  $json = $Payload | ConvertTo-Json -Depth 12
  if ($ResultPath) {
    Set-Content -Path $ResultPath -Value "$json`n" -Encoding utf8
  }
  return $json
}

function Invoke-PrerequisiteCheck {
  param(
    [Parameter(Mandatory)][string]$DesiredDistro,
    [switch]$ApplyFixes
  )

  $scriptPath = Join-Path $PSScriptRoot 'ensure-client-prerequisites.ps1'
  $arguments = @(
    '-ExecutionPolicy', 'Bypass',
    '-File', $scriptPath,
    '-DesiredDistro', $DesiredDistro
  )
  if ($ApplyFixes) {
    $arguments += '-ApplyFixes'
  }

  $json = (& powershell @arguments | Out-String).Trim()
  return ($json | ConvertFrom-Json)
}

function Start-ElevatedInstall {
  param(
    [Parameter(Mandatory)][string]$DesiredDistro,
    [Parameter(Mandatory)]$State
  )

  $tempResultPath = if ($ResultPath) { $ResultPath } else { Join-Path ([System.IO.Path]::GetTempPath()) ("ai-data-platform-install-{0}.json" -f [guid]::NewGuid().ToString('n')) }
  $argumentList = @(
    '-ExecutionPolicy', 'Bypass',
    '-File', $PSCommandPath,
    '-ControlPlaneBaseUrl', (Get-ControlPlaneBaseUrl -State $State),
    '-ProjectKey', (Resolve-ClientProjectKey -State $State -ProjectKey $ProjectKey),
    '-ResultPath', $tempResultPath,
    '-RelaunchedAsAdmin'
  )

  if ($WorkspacePath) {
    $argumentList += @('-WorkspacePath', (Resolve-Path $WorkspacePath).Path)
  }
  if ($SkipOpenClawInstall) {
    $argumentList += '-SkipOpenClawInstall'
  }
  if ($SkipPrereqChecks) {
    $argumentList += '-SkipPrereqChecks'
  }

  $childArgumentString = ConvertTo-ArgumentString -Arguments $argumentList
  $child = Start-Process -FilePath 'powershell' -ArgumentList $childArgumentString -Verb RunAs -PassThru -Wait
  if ($child.ExitCode -ne 0) {
    throw "Elevated installer exited with code $($child.ExitCode)."
  }
  if (-not (Test-Path $tempResultPath)) {
    throw 'Elevated installer did not return a result payload.'
  }

  $resultJson = Get-Content -Raw -Path $tempResultPath -Encoding utf8
  if (-not $ResultPath) {
    Remove-Item -Path $tempResultPath -Force -ErrorAction SilentlyContinue
  }
  return $resultJson
}

Ensure-ClientLayout
Assert-WindowsSupported

$state = Get-ClientState
Set-ClientProjectKey -State $state -ProjectKey $ProjectKey | Out-Null
$desiredDistro = if ($state.openClaw -and $state.openClaw.distro) {
  [string]$state.openClaw.distro
} elseif ($env:OPENCLAW_WSL_DISTRO) {
  [string]$env:OPENCLAW_WSL_DISTRO
} else {
  'Ubuntu-24.04'
}

$preflight = $null
if ($SkipPrereqChecks) {
  $preflight = [pscustomobject]@{
    status = 'skipped'
    applyFixes = $false
    desiredDistro = $desiredDistro
    selectedDistro = $desiredDistro
    needsElevation = $false
    restartRequired = $false
    manualActionRequired = $false
    items = @()
    versions = (Get-InstalledToolVersions)
  }
} else {
  $preflight = Invoke-PrerequisiteCheck -DesiredDistro $desiredDistro -ApplyFixes
  if ($preflight.status -eq 'elevation_required' -and -not (Test-IsAdministrator) -and -not $RelaunchedAsAdmin) {
    $state.openClaw.distro = $desiredDistro
    Save-ClientState -State $state
    Start-ElevatedInstall -DesiredDistro $desiredDistro -State $state
    return
  }
}

$state.bootstrapRoot = Sync-BootstrapFiles
$state.bootstrapVersion = Get-BootstrapVersion
$state.bootstrapInstalledAt = (Get-Date).ToUniversalTime().ToString('o')
$state.workspacePath = if ($WorkspacePath) {
  (Resolve-Path $WorkspacePath).Path
} elseif ($state.workspacePath) {
  [string]$state.workspacePath
} elseif ($script:RepoRoot) {
  $script:RepoRoot
} else {
  ''
}
$state.controlPlaneBaseUrl = if ($ControlPlaneBaseUrl) { $ControlPlaneBaseUrl.TrimEnd('/') } else { Get-ControlPlaneBaseUrl -State $state }
$state.installedAt = (Get-Date).ToUniversalTime().ToString('o')
$state.prerequisites = $preflight
if ($preflight.selectedDistro) {
  $state.openClaw.distro = [string]$preflight.selectedDistro
} else {
  $state.openClaw.distro = $desiredDistro
}

Save-ClientState -State $state

if ($preflight.status -in @('elevation_required', 'restart_required', 'manual_action_required', 'failed')) {
  Write-InstallResult -Payload ([pscustomobject]@{
    status = [string]$preflight.status
    projectKey = [string]$state.projectKey
    clientRoot = $script:ClientRoot
    bootstrapRoot = $state.bootstrapRoot
    bootstrapVersion = $state.bootstrapVersion
    workspacePath = $state.workspacePath
    currentVersion = [string]$state.currentVersion
    controlPlaneBaseUrl = $state.controlPlaneBaseUrl
    openClawVersion = [string]$state.openClaw.version
    prerequisites = $preflight
    validation = [pscustomobject]@{
      projectKey = [string]$state.projectKey
      controlPlaneBaseUrl = [string]$state.controlPlaneBaseUrl
      readyForAuth = ($preflight.status -eq 'skipped')
    }
  })
  return
}

if (-not $SkipOpenClawInstall) {
  $openClawInstallScript = Resolve-BootstrapAssetPath -RelativePath 'tools\install-openclaw-latest.ps1'
  if (-not $openClawInstallScript) {
    $openClawInstallScript = Resolve-BootstrapAssetPath -RelativePath 'install-openclaw-latest.ps1'
  }
  if (-not $openClawInstallScript) {
    throw 'OpenClaw installer script not found in bootstrap assets.'
  }
  $openClawVersion = & powershell -ExecutionPolicy Bypass -File $openClawInstallScript -Distro $state.openClaw.distro | Select-Object -Last 1
  $state.openClaw.version = [string]$openClawVersion
  $state.openClaw.installedAt = (Get-Date).ToUniversalTime().ToString('o')
}

if ($state.currentVersion) {
  Update-InstalledVersionsList -State $state -Version $state.currentVersion
}
Save-ClientState -State $state

Write-InstallResult -Payload ([pscustomobject]@{
  status = 'ok'
  projectKey = [string]$state.projectKey
  clientRoot = $script:ClientRoot
  bootstrapRoot = $state.bootstrapRoot
  bootstrapVersion = $state.bootstrapVersion
  workspacePath = $state.workspacePath
  currentVersion = [string]$state.currentVersion
  controlPlaneBaseUrl = $state.controlPlaneBaseUrl
  openClawVersion = [string]$state.openClaw.version
  openClawDistro = [string]$state.openClaw.distro
  prerequisites = $preflight
  validation = [pscustomobject]@{
    projectKey = [string]$state.projectKey
    controlPlaneBaseUrl = [string]$state.controlPlaneBaseUrl
    readyForAuth = $true
    readyForRuntime = [bool]($state.workspacePath)
  }
})
