$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $root 'tmp\local-dev'
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

function Start-ServiceProcess {
  param(
    [string]$Name,
    [string]$Workdir,
    [string]$Command,
    [string]$PidFile
  )

  if (Test-Path $PidFile) {
    $existingPid = Get-Content $PidFile -ErrorAction SilentlyContinue
    if ($existingPid) {
      $process = Get-Process -Id ([int]$existingPid) -ErrorAction SilentlyContinue
      if ($process) {
        Write-Output "$Name already running (PID $existingPid)"
        return
      }
    }
  }

  $stdout = Join-Path $runDir "$Name.out.log"
  $stderr = Join-Path $runDir "$Name.err.log"
  $proc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c', $Command `
    -WorkingDirectory $Workdir `
    -PassThru `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr

  Set-Content -Path $PidFile -Value $proc.Id -Encoding ascii
  Write-Output "$Name started (PID $($proc.Id))"
}

& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'stop-local.ps1') | Out-Null

Start-ServiceProcess `
  -Name 'gateway' `
  -Workdir $root `
  -Command 'node tools\openclaw-local-gateway.mjs' `
  -PidFile (Join-Path $runDir 'gateway.pid')

Start-Sleep -Seconds 2

Start-ServiceProcess `
  -Name 'api' `
  -Workdir (Join-Path $root 'apps\api') `
  -Command 'set ENABLE_PADDLE_UIE=1&& set PADDLE_UIE_PYTHON_BIN=C:\Users\soulzyn\develop\python-envs\paddle-uie-runtime310\Scripts\python.exe&& node dist\server.js' `
  -PidFile (Join-Path $runDir 'api.pid')

Start-Sleep -Seconds 3

Start-ServiceProcess `
  -Name 'worker' `
  -Workdir (Join-Path $root 'apps\worker') `
  -Command 'node dist/index.js' `
  -PidFile (Join-Path $runDir 'worker.pid')

Start-Sleep -Seconds 2

Start-ServiceProcess `
  -Name 'web' `
  -Workdir (Join-Path $root 'apps\web') `
  -Command 'node_modules\.bin\next.CMD start -p 3002' `
  -PidFile (Join-Path $runDir 'web.pid')

Start-Sleep -Seconds 5
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'status-local.ps1')
