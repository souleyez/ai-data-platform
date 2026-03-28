$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$skillsDir = Join-Path $repoRoot 'skills'
$distro = $env:OPENCLAW_WSL_DISTRO
if (-not $distro) {
  $distro = 'Ubuntu-24.04'
}

function Ensure-Directory {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

function Ensure-ClawHub {
  $candidateCmd = Join-Path $repoRoot 'node_modules\.bin\clawhub.cmd'
  $candidatePs1 = Join-Path $repoRoot 'node_modules\.bin\clawhub.ps1'
  $candidateJs = Join-Path $repoRoot 'node_modules\clawhub\dist\index.js'

  if (Test-Path -LiteralPath $candidateCmd) {
    return $candidateCmd
  }

  if (Test-Path -LiteralPath $candidatePs1) {
    return $candidatePs1
  }

  if (Test-Path -LiteralPath $candidateJs) {
    return "node `"$candidateJs`""
  }

  Write-Host 'Local clawhub package not found, installing workspace dependencies...'
  Push-Location $repoRoot
  try {
    corepack pnpm install | Out-Host
  }
  finally {
    Pop-Location
  }

  if (Test-Path -LiteralPath $candidateCmd) {
    return $candidateCmd
  }

  if (Test-Path -LiteralPath $candidatePs1) {
    return $candidatePs1
  }

  if (Test-Path -LiteralPath $candidateJs) {
    return "node `"$candidateJs`""
  }

  throw 'Local clawhub package is still unavailable after install'
}

function Ensure-OpenClawInWsl {
  $probe = wsl.exe -d $distro -- bash -lc "command -v openclaw >/dev/null 2>&1 && openclaw --version" 2>$null
  if ($LASTEXITCODE -eq 0) {
    return ($probe | Select-Object -Last 1)
  }

  Write-Host "openclaw not found in WSL distro $distro, running project installer..."
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'install-openclaw-latest.ps1')

  $probe = wsl.exe -d $distro -- bash -lc "command -v openclaw >/dev/null 2>&1 && openclaw --version"
  if ($LASTEXITCODE -ne 0) {
    throw "openclaw still not available in WSL distro $distro after install"
  }

  return ($probe | Select-Object -Last 1)
}

Ensure-Directory -Path $skillsDir
$clawhubCommand = Ensure-ClawHub
$openclawVersion = Ensure-OpenClawInWsl

Write-Host 'Workspace OpenClaw infrastructure is ready.'
Write-Host "Repo skills dir: $skillsDir"
Write-Host "WSL distro: $distro"
Write-Host "OpenClaw: $openclawVersion"
if ($clawhubCommand -like 'node *') {
  $clawhubVersion = Invoke-Expression "$clawhubCommand -V"
}
else {
  $clawhubVersion = & $clawhubCommand -V
}
Write-Host ("ClawHub: " + (($clawhubVersion | Select-Object -First 1)))
