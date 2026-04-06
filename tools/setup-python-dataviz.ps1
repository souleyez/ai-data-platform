$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$skillRoot = Join-Path $repoRoot 'skills\python-dataviz'
$venvRoot = Join-Path $skillRoot '.venv'
$venvPython = Join-Path $venvRoot 'Scripts\python.exe'

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [string[]]$Arguments = @()
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    $joined = if ($Arguments.Length) { $Arguments -join ' ' } else { '' }
    throw "Command failed ($LASTEXITCODE): $FilePath $joined"
  }
}

if (-not (Test-Path -LiteralPath $skillRoot)) {
  throw "python-dataviz skill not found at $skillRoot"
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw 'python is not available on PATH'
}

if (-not (Test-Path -LiteralPath $venvPython)) {
  Write-Host "Creating virtual environment at $venvRoot"
  Invoke-Checked -FilePath 'python' -Arguments @('-m', 'venv', $venvRoot)
}
else {
  Write-Host "Using existing virtual environment at $venvRoot"
}

Write-Host 'Upgrading pip in python-dataviz venv'
Invoke-Checked -FilePath $venvPython -Arguments @('-m', 'pip', 'install', '--upgrade', 'pip')

Write-Host 'Installing python-dataviz dependencies into venv'
Push-Location $skillRoot
try {
  Invoke-Checked -FilePath $venvPython -Arguments @('-m', 'pip', 'install', '.', '--retries', '8', '--timeout', '60')
}
finally {
  Pop-Location
}

Write-Host ''
Write-Host 'python-dataviz virtual environment is ready.'
Write-Host "Python: $venvPython"
