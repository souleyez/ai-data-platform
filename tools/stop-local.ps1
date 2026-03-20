$ErrorActionPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $root 'tmp\local-dev'

foreach ($name in @('gateway', 'api', 'worker', 'web')) {
  $pidFile = Join-Path $runDir "$name.pid"
  if (-not (Test-Path $pidFile)) {
    continue
  }

  $pid = Get-Content $pidFile
  if ($pid) {
    Stop-Process -Id ([int]$pid) -Force -ErrorAction SilentlyContinue
  }
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

# Kill anything still holding the known local ports, even if the pid file only
# tracked an outer cmd.exe process and left the real node listener behind.
foreach ($port in @(18789, 3100, 3002)) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}

# Clean up any remaining app-local node/cmd processes tied to this workspace.
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -in @('node.exe', 'cmd.exe') -and
    (
      $_.CommandLine -match 'ai-data-platform\\apps\\api' -or
      $_.CommandLine -match 'ai-data-platform\\apps\\worker' -or
      $_.CommandLine -match 'ai-data-platform\\apps\\web' -or
      $_.CommandLine -match 'ai-data-platform\\tools\\openclaw-local-gateway\.mjs' -or
      $_.CommandLine -match 'ai-data-platform.*src\\server\.ts' -or
      $_.CommandLine -match 'ai-data-platform.*dist\\index\.js' -or
      $_.CommandLine -match 'ai-data-platform.*next\\dist\\bin\\next.*start -p 3002' -or
      $_.CommandLine -match 'ai-data-platform.*node dist\\server\.js'
    )
  } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }

Write-Output 'local services stopped'
exit 0
