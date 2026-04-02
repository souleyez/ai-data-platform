param(
  [string]$DesiredDistro = '',
  [switch]$ApplyFixes
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

Ensure-ClientLayout
Assert-WindowsSupported

$state = Get-ClientState
if (-not $DesiredDistro) {
  if ($state.openClaw -and $state.openClaw.distro) {
    $DesiredDistro = [string]$state.openClaw.distro
  } elseif ($env:OPENCLAW_WSL_DISTRO) {
    $DesiredDistro = [string]$env:OPENCLAW_WSL_DISTRO
  } else {
    $DesiredDistro = 'Ubuntu-24.04'
  }
}

$items = New-Object System.Collections.Generic.List[object]
$result = [ordered]@{
  status = 'ok'
  applyFixes = [bool]$ApplyFixes
  desiredDistro = $DesiredDistro
  selectedDistro = ''
  needsElevation = $false
  restartRequired = $false
  manualActionRequired = $false
  items = @()
  versions = $null
}

function Add-PrerequisiteItem {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$Status,
    [string]$Version = '',
    [string]$Message = '',
    [bool]$FixApplied = $false
  )

  $items.Add([pscustomobject]@{
    name = $Name
    status = $Status
    version = $Version
    message = $Message
    fixApplied = $FixApplied
  }) | Out-Null

  switch ($Status) {
    'elevation_required' { $result.needsElevation = $true }
    'restart_required' { $result.restartRequired = $true }
    'manual_action_required' { $result.manualActionRequired = $true }
    'failed' { $result.manualActionRequired = $true }
  }
}

function Finalize-PrerequisiteResult {
  $result.items = @($items.ToArray())
  $result.versions = Get-InstalledToolVersions

  if ($items | Where-Object { $_.status -eq 'failed' }) {
    $result.status = 'failed'
  } elseif ($result.manualActionRequired) {
    $result.status = 'manual_action_required'
  } elseif ($result.restartRequired) {
    $result.status = 'restart_required'
  } elseif ($result.needsElevation) {
    $result.status = 'elevation_required'
  } else {
    $result.status = 'ok'
  }

  return [pscustomobject]$result
}

function Invoke-WingetInstall {
  param(
    [Parameter(Mandatory)][string]$PackageId,
    [Parameter(Mandatory)][string]$DisplayName
  )

  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "winget is not available, cannot install $DisplayName automatically."
  }

  $scope = if (Test-IsAdministrator) { 'machine' } else { 'user' }
  $arguments = @(
    'install',
    '--id', $PackageId,
    '--exact',
    '--scope', $scope,
    '--accept-source-agreements',
    '--accept-package-agreements',
    '--disable-interactivity',
    '--silent'
  )

  $output = @(& winget @arguments 2>&1)
  $exitCode = $LASTEXITCODE
  $normalizedOutput = @(
    $output |
      ForEach-Object { ([string]$_).Trim() } |
      Where-Object { $_ }
  ) -join "`n"

  if ($exitCode -notin @(0, 3010)) {
    throw "winget install failed for $DisplayName. $normalizedOutput"
  }

  return [pscustomobject]@{
    ExitCode = $exitCode
    Output = $normalizedOutput.Trim()
    Scope = $scope
  }
}

function Test-WslDistroReady {
  param([Parameter(Mandatory)][string]$Distro)

  $probe = Invoke-WslCapture -Distro $Distro -Command 'printf ready' -RunAsRoot
  return [pscustomobject]@{
    Ready = ($probe.ExitCode -eq 0 -and $probe.Output -match 'ready')
    Output = $probe.Output
    ExitCode = $probe.ExitCode
  }
}

$gitVersion = Get-CommandVersionText -Command 'git'
if ($gitVersion) {
  Add-PrerequisiteItem -Name 'git' -Status 'ok' -Version $gitVersion
} elseif ($ApplyFixes) {
  try {
    $gitInstall = Invoke-WingetInstall -PackageId 'Git.Git' -DisplayName 'Git'
    Refresh-ProcessPathFromSystem
    $gitVersion = Get-CommandVersionText -Command 'git'
    if ($gitVersion) {
      Add-PrerequisiteItem -Name 'git' -Status 'ok' -Version $gitVersion -Message "Installed with winget ($($gitInstall.Scope) scope)." -FixApplied $true
      if ($gitInstall.ExitCode -eq 3010) {
        Add-PrerequisiteItem -Name 'git-restart' -Status 'restart_required' -Message 'Windows reported that a restart is required after Git installation.'
      }
    } else {
      Add-PrerequisiteItem -Name 'git' -Status 'failed' -Message "Git install did not make git available. $($gitInstall.Output)"
    }
  } catch {
    Add-PrerequisiteItem -Name 'git' -Status 'failed' -Message $_.Exception.Message
  }
} else {
  Add-PrerequisiteItem -Name 'git' -Status 'missing' -Message 'Git is not installed.'
}

$nodeMajor = Get-NodeMajorVersion
$nodeVersion = Get-CommandVersionText -Command 'node'
if ($nodeMajor -ge 22) {
  Add-PrerequisiteItem -Name 'node' -Status 'ok' -Version $nodeVersion
} elseif ($ApplyFixes) {
  try {
    $nodeInstall = Invoke-WingetInstall -PackageId 'OpenJS.NodeJS.LTS' -DisplayName 'Node.js LTS'
    Refresh-ProcessPathFromSystem
    $nodeMajor = Get-NodeMajorVersion
    $nodeVersion = Get-CommandVersionText -Command 'node'
    if ($nodeMajor -ge 22) {
      Add-PrerequisiteItem -Name 'node' -Status 'ok' -Version $nodeVersion -Message "Installed with winget ($($nodeInstall.Scope) scope)." -FixApplied $true
      if ($nodeInstall.ExitCode -eq 3010) {
        Add-PrerequisiteItem -Name 'node-restart' -Status 'restart_required' -Message 'Windows reported that a restart is required after Node.js installation.'
      }
    } else {
      Add-PrerequisiteItem -Name 'node' -Status 'failed' -Message "Node.js LTS install did not make Node 22+ available. $($nodeInstall.Output)"
    }
  } catch {
    Add-PrerequisiteItem -Name 'node' -Status 'failed' -Message $_.Exception.Message
  }
} else {
  Add-PrerequisiteItem -Name 'node' -Status 'missing' -Version $nodeVersion -Message 'Node.js 22 LTS is required.'
}

$corepackVersion = Get-CommandVersionText -Command 'corepack'
if ($corepackVersion) {
  try {
    if ($ApplyFixes) {
      & corepack enable *> $null
      & corepack prepare pnpm@10.11.0 --activate *> $null
    }
    Add-PrerequisiteItem -Name 'corepack' -Status 'ok' -Version $corepackVersion
  } catch {
    Add-PrerequisiteItem -Name 'corepack' -Status 'failed' -Version $corepackVersion -Message $_.Exception.Message
  }
} elseif ($nodeMajor -gt 0) {
  Add-PrerequisiteItem -Name 'corepack' -Status 'missing' -Message 'Corepack is not available from the current Node.js installation.'
} else {
  Add-PrerequisiteItem -Name 'corepack' -Status 'missing' -Message 'Corepack cannot be enabled until Node.js is installed.'
}

if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
  Add-PrerequisiteItem -Name 'wsl' -Status 'manual_action_required' -Message 'WSL command is unavailable. Update Windows WSL support first.'
  Finalize-PrerequisiteResult | ConvertTo-Json -Depth 10
  return
}

$distroList = Get-WslDistroList
if ($distroList -contains $DesiredDistro) {
  $wslReady = Test-WslDistroReady -Distro $DesiredDistro
  if ($wslReady.Ready) {
    $result.selectedDistro = $DesiredDistro
    Add-PrerequisiteItem -Name 'wsl' -Status 'ok' -Version ((Get-InstalledToolVersions).wsl) -Message "WSL distro $DesiredDistro is ready."
  } else {
    Add-PrerequisiteItem -Name 'wsl' -Status 'manual_action_required' -Message "WSL distro $DesiredDistro exists but did not finish initializing. $($wslReady.Output)"
  }
} elseif ($ApplyFixes) {
  if (-not (Test-IsAdministrator)) {
    Add-PrerequisiteItem -Name 'wsl' -Status 'elevation_required' -Message "Installing WSL distro $DesiredDistro requires administrator approval."
  } else {
    $installOutput = @(& wsl.exe --install --distribution $DesiredDistro 2>&1)
    $installCode = $LASTEXITCODE
    $normalizedInstallOutput = @(
      $installOutput |
        ForEach-Object { Convert-WslText -Text ([string]$_) } |
        Where-Object { $_ }
    ) -join "`n"

    Start-Sleep -Seconds 2
    $distroList = Get-WslDistroList
    if ($distroList -contains $DesiredDistro) {
      $wslReady = Test-WslDistroReady -Distro $DesiredDistro
      if ($wslReady.Ready) {
        $result.selectedDistro = $DesiredDistro
        Add-PrerequisiteItem -Name 'wsl' -Status 'ok' -Version ((Get-InstalledToolVersions).wsl) -Message "Installed WSL distro $DesiredDistro." -FixApplied $true
      } else {
        Add-PrerequisiteItem -Name 'wsl' -Status 'manual_action_required' -Message "WSL distro $DesiredDistro was installed but still needs first-run initialization. $($wslReady.Output)"
      }
    } elseif ($installCode -eq 3010 -or $normalizedInstallOutput -match 'restart|reboot') {
      Add-PrerequisiteItem -Name 'wsl' -Status 'restart_required' -Message "WSL install needs a Windows restart before $DesiredDistro can be used. $normalizedInstallOutput"
    } else {
      Add-PrerequisiteItem -Name 'wsl' -Status 'failed' -Message "WSL install failed. $normalizedInstallOutput"
    }
  }
} else {
  Add-PrerequisiteItem -Name 'wsl' -Status 'missing' -Message "WSL distro $DesiredDistro is not installed."
}

Finalize-PrerequisiteResult | ConvertTo-Json -Depth 10
