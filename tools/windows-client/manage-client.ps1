param(
  [Parameter(Mandatory = $true)][ValidateSet('install', 'preflight', 'auth', 'lease-model', 'check-update', 'download-update', 'apply-update', 'background-update', 'start', 'stop', 'status', 'build-release', 'publish-release')][string]$Action,
  [string]$Phone = '',
  [string]$ProviderScope = '',
  [string]$WorkspacePath = '',
  [string]$ControlPlaneBaseUrl = '',
  [string]$ProjectKey = '',
  [string]$Version = '',
  [string]$ArtifactUrl = '',
  [string]$Channel = 'stable',
  [string]$MinSupportedVersion = '',
  [string]$ReleaseNotes = '',
  [switch]$Publish,
  [switch]$SkipOpenClawInstall,
  [switch]$SkipPrereqChecks
)

$ErrorActionPreference = 'Stop'

switch ($Action) {
  'install' {
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'install-client.ps1') `
      -WorkspacePath $WorkspacePath `
      -ControlPlaneBaseUrl $ControlPlaneBaseUrl `
      -ProjectKey $ProjectKey `
      -SkipOpenClawInstall:$SkipOpenClawInstall `
      -SkipPrereqChecks:$SkipPrereqChecks
  }
  'preflight' {
    $arguments = @(
      '-ExecutionPolicy', 'Bypass',
      '-File', (Join-Path $PSScriptRoot 'ensure-client-prerequisites.ps1')
    )
    if (-not $SkipPrereqChecks) {
      $arguments += '-ApplyFixes'
    }
    & powershell @arguments
  }
  'auth' {
    if (-not $Phone) { throw 'Phone is required for auth action.' }
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'auth-client.ps1') -Phone $Phone -ProjectKey $ProjectKey
  }
  'lease-model' {
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'lease-client-model.ps1') -ProviderScope $ProviderScope -ProjectKey $ProjectKey
  }
  'check-update' {
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'check-client-update.ps1') -ProjectKey $ProjectKey
  }
  'download-update' {
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'download-client-update.ps1')
  }
  'apply-update' {
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'apply-client-update.ps1')
  }
  'background-update' {
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'run-client-background-update.ps1')
  }
  'start' {
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start-client-runtime.ps1') -Phone $Phone -ProjectKey $ProjectKey
  }
  'stop' {
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'stop-client-runtime.ps1')
  }
  'status' {
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'status-client.ps1')
  }
  'build-release' {
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'build-client-release.ps1') -Version $Version
  }
  'publish-release' {
    if (-not $ArtifactUrl) { throw 'ArtifactUrl is required for publish-release action.' }
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'publish-client-release.ps1') `
      -ArtifactUrl $ArtifactUrl `
      -Version $Version `
      -ProjectKey $ProjectKey `
      -Channel $Channel `
      -MinSupportedVersion $MinSupportedVersion `
      -ReleaseNotes $ReleaseNotes `
      -Publish:$Publish
  }
}
