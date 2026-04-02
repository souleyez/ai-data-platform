$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

function Find-InnoCompiler {
  $command = Get-Command iscc.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  foreach ($candidate in @(
    'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
    'C:\Program Files\Inno Setup 6\ISCC.exe',
    (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe')
  )) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  return ''
}

$bootstrapBuildText = & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'build-bootstrap-package.ps1') | Out-String
$bootstrapBuild = $bootstrapBuildText | ConvertFrom-Json
$sourceDir = Join-Path $script:RepoRoot 'tmp\bootstrap-client\bootstrap-package'
$outputDir = Join-Path $script:RepoRoot 'tmp\bootstrap-installer'
$compilerPath = Find-InnoCompiler

if (-not $compilerPath) {
  [pscustomobject]@{
    status = 'compiler_missing'
    compiler = 'Inno Setup 6'
    message = 'ISCC.exe was not found. Install Inno Setup 6 to build the fixed bootstrap installer.'
    bootstrapVersion = $bootstrapBuild.bootstrapVersion
    bootstrapSourceDir = $sourceDir
  } | ConvertTo-Json -Depth 8
  exit 0
}

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$scriptPath = Join-Path $PSScriptRoot 'installer\ai-data-platform-bootstrap.iss'

& $compilerPath `
  "/DBootstrapSourceDir=$sourceDir" `
  "/DBootstrapVersion=$($bootstrapBuild.bootstrapVersion)" `
  "/DInstallerOutputDir=$outputDir" `
  $scriptPath | Out-Null

if ($LASTEXITCODE -ne 0) {
  throw 'Inno Setup build failed.'
}

[pscustomobject]@{
  status = 'ok'
  bootstrapVersion = $bootstrapBuild.bootstrapVersion
  installerPath = Join-Path $outputDir 'AIDataPlatformBootstrapSetup.exe'
  compilerPath = $compilerPath
} | ConvertTo-Json -Depth 8
