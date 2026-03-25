$ErrorActionPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $root 'tmp\local-dev'

function Get-ServiceState {
  param(
    [string]$Name,
    [Nullable[int]]$Port
  )

  $pidFile = Join-Path $runDir "$Name.pid"
  $recordedPid = if (Test-Path $pidFile) { [int](Get-Content $pidFile) } else { $null }
  $listener = if ($Port) { Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 } else { $null }
  $effectivePid = if ($listener) { [int]$listener.OwningProcess } elseif ($recordedPid) { $recordedPid } else { $null }
  $process = if ($effectivePid) { Get-Process -Id $effectivePid -ErrorAction SilentlyContinue } else { $null }

  $state = if ($Port) {
    if ($listener -and $process) { 'running' } elseif ($recordedPid) { 'stale' } else { 'stopped' }
  } else {
    if ($process) { 'running' } elseif ($recordedPid) { 'stale' } else { 'stopped' }
  }

  [pscustomobject]@{
    Service = $Name
    PID = if ($process) { $process.Id } elseif ($recordedPid) { $recordedPid } else { '' }
    Port = if ($Port) { $Port } else { '-' }
    State = $state
  }
}

@(
  Get-ServiceState -Name 'gateway' -Port 18789
  Get-ServiceState -Name 'api' -Port 3100
  Get-ServiceState -Name 'worker' -Port $null
  Get-ServiceState -Name 'web' -Port 3002
) | Format-Table -AutoSize
