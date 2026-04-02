$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$state = Get-ClientState
$stopScript = Resolve-WorkspaceToolPath -State $state -RelativePath 'tools\stop-local.ps1'
if (-not (Test-Path $stopScript)) {
  throw "Runtime stop script not found: $stopScript"
}

& powershell -ExecutionPolicy Bypass -File $stopScript
