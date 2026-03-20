$ErrorActionPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $root 'tmp\local-dev'

function Get-ServiceState {
  param(
    [string]$Name,
    [Nullable[int]]$Port
  )

  $pidFile = Join-Path $runDir "$Name.pid"
  $pid = if (Test-Path $pidFile) { Get-Content $pidFile } else { $null }
  $process = if ($pid) { Get-Process -Id ([int]$pid) -ErrorAction SilentlyContinue } else { $null }
  $listening = if ($Port) {
    $portState = Test-NetConnection 127.0.0.1 -Port $Port -WarningAction SilentlyContinue
    [bool]$portState.TcpTestSucceeded
  } else {
    [bool]$process
  }

  [pscustomobject]@{
    Service = $Name
    PID = if ($process) { $process.Id } else { '' }
    Port = if ($Port) { $Port } else { '-' }
    Listening = $listening
  }
}

@(
  Get-ServiceState -Name 'gateway' -Port 18789
  Get-ServiceState -Name 'api' -Port 3100
  Get-ServiceState -Name 'worker' -Port $null
  Get-ServiceState -Name 'web' -Port 3002
) | Format-Table -AutoSize
