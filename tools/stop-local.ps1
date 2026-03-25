$ErrorActionPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $root 'tmp\local-dev'

function Invoke-HardKill {
  param([int]$TargetPid)

  if (-not $TargetPid) { return }

  Stop-Process -Id $TargetPid -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 250
  if (Get-Process -Id $TargetPid -ErrorAction SilentlyContinue) {
    & taskkill /PID $TargetPid /T /F | Out-Null
    Start-Sleep -Milliseconds 250
  }
}

foreach ($name in @('gateway', 'api', 'worker', 'web')) {
  $pidFile = Join-Path $runDir "$name.pid"
  $stdout = Join-Path $runDir "$name.out.log"
  $stderr = Join-Path $runDir "$name.err.log"

  if (Test-Path $pidFile) {
    $rawPid = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    $recordedPid = 0
    [void][int]::TryParse([string]$rawPid, [ref]$recordedPid)
    if ($recordedPid -gt 0) {
      Invoke-HardKill -TargetPid $recordedPid
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
  }

  Remove-Item $stdout -Force -ErrorAction SilentlyContinue
  Remove-Item $stderr -Force -ErrorAction SilentlyContinue
}

foreach ($port in @(18789, 3100, 3002)) {
  $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    Invoke-HardKill -TargetPid ([int]$listener.OwningProcess)
  }
}

$workspaceProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -in @('node.exe', 'cmd.exe', 'python.exe') -and
    (
      $_.CommandLine -match 'ai-data-platform\\apps\\api' -or
      $_.CommandLine -match 'ai-data-platform\\apps\\worker' -or
      $_.CommandLine -match 'ai-data-platform\\apps\\web' -or
      $_.CommandLine -match 'ai-data-platform\\tools\\openclaw-local-gateway\.mjs' -or
      $_.CommandLine -match 'ai-data-platform.*src\\server\.ts' -or
      $_.CommandLine -match 'ai-data-platform.*dist\\index\.js' -or
      $_.CommandLine -match 'ai-data-platform.*next\\dist\\bin\\next.*start -p 3002' -or
      $_.CommandLine -match 'paddle-uie-runtime.*uie_service\.py'
    )
  })

foreach ($proc in $workspaceProcesses) {
  Invoke-HardKill -TargetPid ([int]$proc.ProcessId)
}

Write-Output 'local services stopped'
