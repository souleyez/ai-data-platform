$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $root 'tmp\local-dev'
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

function Wait-ForPort {
  param(
    [int]$Port,
    [int]$TimeoutMs = 12000
  )

  $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
  do {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
      return $listener
    }
    Start-Sleep -Milliseconds 300
  } while ((Get-Date) -lt $deadline)

  return $null
}

function Wait-ForProcessExit {
  param(
    [int]$ProcessId,
    [int]$TimeoutMs = 1500
  )

  $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
  do {
    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $process) {
      return $true
    }
    Start-Sleep -Milliseconds 150
  } while ((Get-Date) -lt $deadline)

  return $false
}

function Start-NodeService {
  param(
    [string]$Name,
    [string]$Workdir,
    [string[]]$Arguments,
    [string]$PidFile,
    [Nullable[int]]$Port = $null,
    [hashtable]$EnvVars = @{}
  )

  if (Test-Path $PidFile) {
    $existingPid = Get-Content $PidFile -ErrorAction SilentlyContinue
    if ($existingPid) {
      $process = Get-Process -Id ([int]$existingPid) -ErrorAction SilentlyContinue
      if ($process) {
        if (-not $Port -or (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)) {
          Write-Output "$Name already running (PID $existingPid)"
          return
        }
      }
    }

    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
  }

  $stdout = Join-Path $runDir "$Name.out.log"
  $stderr = Join-Path $runDir "$Name.err.log"
  Remove-Item $stdout -Force -ErrorAction SilentlyContinue
  Remove-Item $stderr -Force -ErrorAction SilentlyContinue

  $previousEnv = @{}
  foreach ($key in $EnvVars.Keys) {
    $previousEnv[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    [Environment]::SetEnvironmentVariable($key, [string]$EnvVars[$key], 'Process')
  }

  try {
    $proc = Start-Process -FilePath 'node' `
      -ArgumentList $Arguments `
      -WorkingDirectory $Workdir `
      -PassThru `
      -WindowStyle Hidden `
      -RedirectStandardOutput $stdout `
      -RedirectStandardError $stderr
  } finally {
    foreach ($key in $EnvVars.Keys) {
      [Environment]::SetEnvironmentVariable($key, $previousEnv[$key], 'Process')
    }
  }

  Set-Content -Path $PidFile -Value $proc.Id -Encoding ascii

  if ($Port) {
    $listener = Wait-ForPort -Port $Port
    if ($listener) {
      Set-Content -Path $PidFile -Value $listener.OwningProcess -Encoding ascii
      Write-Output "$Name started (PID $($listener.OwningProcess))"
      return
    }

    if (Wait-ForProcessExit -ProcessId $proc.Id) {
      $stderrTail = if (Test-Path $stderr) { (Get-Content $stderr -Tail 20) -join [Environment]::NewLine } else { '' }
      throw "$Name failed to start. $stderrTail"
    }

    throw "$Name did not bind port $Port within timeout."
  }

  Start-Sleep -Milliseconds 800
  $process = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
  if (-not $process) {
    $stderrTail = if (Test-Path $stderr) { (Get-Content $stderr -Tail 20) -join [Environment]::NewLine } else { '' }
    throw "$Name exited during startup. $stderrTail"
  }

  Write-Output "$Name started (PID $($proc.Id))"
}

& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'stop-local.ps1') | Out-Null

Start-NodeService `
  -Name 'gateway' `
  -Workdir $root `
  -Arguments @('tools/openclaw-local-gateway.mjs') `
  -PidFile (Join-Path $runDir 'gateway.pid') `
  -Port 18789

Start-Sleep -Seconds 2

Start-NodeService `
  -Name 'api' `
  -Workdir (Join-Path $root 'apps\api') `
  -Arguments @('--import', 'tsx', 'src/server.ts') `
  -PidFile (Join-Path $runDir 'api.pid') `
  -Port 3100 `
  -EnvVars @{
    ENABLE_PADDLE_UIE = '1'
    PADDLE_UIE_PYTHON_BIN = 'C:\Users\soulzyn\develop\python-envs\paddle-uie-runtime310\Scripts\python.exe'
  }

Start-Sleep -Seconds 2

Start-NodeService `
  -Name 'worker' `
  -Workdir (Join-Path $root 'apps\worker') `
  -Arguments @('dist/index.js') `
  -PidFile (Join-Path $runDir 'worker.pid')

Start-Sleep -Seconds 1

Start-NodeService `
  -Name 'web' `
  -Workdir (Join-Path $root 'apps\web') `
  -Arguments @('.\node_modules\next\dist\bin\next', 'start', '-p', '3002') `
  -PidFile (Join-Path $runDir 'web.pid') `
  -Port 3002

Start-Sleep -Seconds 2
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'status-local.ps1')
