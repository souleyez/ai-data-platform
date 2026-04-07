$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][string[]]$Command
  )

  Write-Host ""
  Write-Host "==> $Label" -ForegroundColor Cyan
  Write-Host ($Command -join ' ')
  & $Command[0] $Command[1..($Command.Length - 1)]
  if ($LASTEXITCODE -ne 0) {
    throw "Step failed: $Label"
  }
}

function Read-JsonFile {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  try {
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  } catch {
    throw "Failed to parse runtime json: $Path"
  }
}

$storageRoot = if ($env:AI_DATA_PLATFORM_STORAGE_ROOT) {
  $env:AI_DATA_PLATFORM_STORAGE_ROOT
} else {
  Join-Path $repoRoot 'storage'
}

$sha = (& git rev-parse HEAD).Trim()
$runtimeFiles = @(
  Join-Path $storageRoot 'config\task-runtime-metrics.json'
  Join-Path $storageRoot 'config\openclaw-memory-sync-status.json'
  Join-Path $storageRoot 'config\report-center.json'
  Join-Path $storageRoot 'cache\document-deep-parse-queue.json'
  Join-Path $storageRoot 'config\datasources\runs.json'
)

Write-Host "Phase 1 stability verification" -ForegroundColor Green
Write-Host "Git SHA: $sha"
Write-Host "Storage root: $storageRoot"
Write-Host "Runtime files:"
$runtimeFiles | ForEach-Object { Write-Host " - $_" }

Invoke-Step 'API regression suite (phase1 core)' @(
  'corepack', 'pnpm', '--filter', 'api', 'exec', 'tsx', '--test',
  'test/document-extraction-governance.test.ts',
  'test/document-parser-library-template.test.ts',
  'test/document-schema.test.ts',
  'test/document-parser-table.test.ts',
  'test/document-parser-order.test.ts',
  'test/document-parser-footfall.test.ts',
  'test/document-deep-parse-queue.test.ts',
  'test/datasource-execution.test.ts',
  'test/runtime-state-repositories.test.ts',
  'test/operations-overview.test.ts',
  'test/operations-overview-telemetry.test.ts',
  'test/report-dataviz.test.ts',
  'test/document-parser-xinshijie-ioa.test.ts',
  'test/library-knowledge-pages.test.ts'
)

Invoke-Step 'API build' @('corepack', 'pnpm', '--filter', 'api', 'build')
Invoke-Step 'Web build' @('corepack', 'pnpm', '--filter', 'web', 'build')

Write-Host ""
Write-Host "==> Runtime telemetry gate" -ForegroundColor Cyan

$taskRuntimeMetrics = Read-JsonFile (Join-Path $storageRoot 'config\task-runtime-metrics.json')
$memorySyncStatus = Read-JsonFile (Join-Path $storageRoot 'config\openclaw-memory-sync-status.json')

$warnings = New-Object System.Collections.Generic.List[string]
$blockingErrors = New-Object System.Collections.Generic.List[string]

if ($null -eq $taskRuntimeMetrics) {
  $warnings.Add('task-runtime-metrics.json not found; skipping task-family telemetry gate.')
} else {
  foreach ($item in @($taskRuntimeMetrics.items)) {
    if ($null -eq $item) { continue }
    $family = [string]$item.family
    $status = [string]$item.status
    $lastErrorMessage = [string]$item.lastErrorMessage
    $lastMessage = [string]$item.lastMessage

    if ($status -eq 'failed') {
      $blockingErrors.Add("Task family '$family' is in failed state: $lastErrorMessage")
    } elseif ($status -eq 'skipped' -and $family -eq 'dataviz' -and $lastMessage -match 'renderer-unavailable') {
      $warnings.Add("Dataviz renderer is unavailable on this runtime: $lastMessage")
    }
  }
}

if ($null -eq $memorySyncStatus) {
  $warnings.Add('openclaw-memory-sync-status.json not found; skipping memory-sync freshness gate.')
} else {
  $memoryStatus = [string]$memorySyncStatus.status
  $lastSuccessAt = [string]$memorySyncStatus.lastSuccessAt
  if ($memoryStatus -eq 'failed') {
    $blockingErrors.Add("Memory sync is failed: $([string]$memorySyncStatus.lastErrorMessage)")
  } elseif ($lastSuccessAt) {
    $age = (Get-Date) - ([datetime]$lastSuccessAt)
    if ($age.TotalHours -ge 24) {
      $blockingErrors.Add("Memory sync last success is stale by $([math]::Round($age.TotalHours, 1)) hours.")
    } elseif ($age.TotalHours -ge 6) {
      $warnings.Add("Memory sync is stale by $([math]::Round($age.TotalHours, 1)) hours.")
    }
  } else {
    $warnings.Add('Memory sync has no recorded success timestamp yet.')
  }
}

if ($warnings.Count -gt 0) {
  Write-Host 'Warnings:' -ForegroundColor Yellow
  $warnings | ForEach-Object { Write-Host " - $_" -ForegroundColor Yellow }
}

if ($blockingErrors.Count -gt 0) {
  Write-Host 'Blocking errors:' -ForegroundColor Red
  $blockingErrors | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
  throw 'Phase 1 stability verification failed on runtime telemetry gate.'
}

Write-Host ""
Write-Host "Phase 1 stability verification passed." -ForegroundColor Green
