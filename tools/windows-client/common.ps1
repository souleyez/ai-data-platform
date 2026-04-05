$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Resolve-LocalRepoRoot {
  $candidate = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
  if ((Test-Path (Join-Path $candidate 'package.json')) -and (Test-Path (Join-Path $candidate 'apps')) -and (Test-Path (Join-Path $candidate 'tools'))) {
    return $candidate
  }
  return ''
}

$script:RepoRoot = Resolve-LocalRepoRoot
$script:DefaultClientRoot = Join-Path $env:LOCALAPPDATA 'AIDataPlatform'
$script:ClientRoot = if ($env:AI_DATA_PLATFORM_CLIENT_ROOT) {
  $env:AI_DATA_PLATFORM_CLIENT_ROOT
} else {
  $script:DefaultClientRoot
}
$script:BootstrapRoot = Join-Path $script:ClientRoot 'bootstrap'
$script:ClientConfigDir = Join-Path $script:ClientRoot 'config'
$script:ClientDownloadsDir = Join-Path $script:ClientRoot 'downloads'
$script:ClientReleasesDir = Join-Path $script:ClientRoot 'releases'
$script:ClientLogsDir = Join-Path $script:ClientRoot 'logs'
$script:ClientRuntimeDir = Join-Path $script:ClientRoot 'runtime'
$script:ClientStatePath = Join-Path $script:ClientConfigDir 'client-state.json'

function Get-DefaultClientProjectKey {
  if ($env:AI_DATA_PLATFORM_CLIENT_PROJECT_KEY) {
    return $env:AI_DATA_PLATFORM_CLIENT_PROJECT_KEY.Trim().ToLowerInvariant()
  }
  if ($env:CONTROL_PLANE_PROJECT_KEY) {
    return $env:CONTROL_PLANE_PROJECT_KEY.Trim().ToLowerInvariant()
  }
  return 'windows-client'
}

function Ensure-ClientLayout {
  foreach ($path in @(
    $script:ClientRoot,
    $script:BootstrapRoot,
    $script:ClientConfigDir,
    $script:ClientDownloadsDir,
    $script:ClientReleasesDir,
    $script:ClientLogsDir,
    $script:ClientRuntimeDir
  )) {
    New-Item -ItemType Directory -Force -Path $path | Out-Null
  }
}

function New-DefaultClientState {
  [pscustomobject]@{
    schemaVersion = 2
    bootstrapVersion = (Get-BootstrapVersion)
    bootstrapRoot = $script:BootstrapRoot
    bootstrapInstalledAt = ''
    channel = 'stable'
    projectKey = (Get-DefaultClientProjectKey)
    controlPlaneBaseUrl = $env:CONTROL_PLANE_API_BASE_URL
    workspacePath = $script:RepoRoot
    currentReleasePath = ''
    currentVersion = ''
    installedVersions = @()
    installedAt = ''
    phone = ''
    session = [pscustomobject]@{
      token = ''
      expiresAt = ''
      validatedAt = ''
    }
    lastAuth = $null
    lastPolicy = $null
    modelAccess = [pscustomobject]@{
      mode = 'lease'
      providers = @()
    }
    modelLease = $null
    pendingRelease = $null
    download = $null
    backgroundUpdate = $null
    prerequisites = [pscustomobject]@{}
    openClaw = [pscustomobject]@{
      distro = if ($env:OPENCLAW_WSL_DISTRO) { $env:OPENCLAW_WSL_DISTRO } else { 'Ubuntu-24.04' }
      version = ''
      installedAt = ''
    }
  }
}

function Test-ClientStateProperty {
  param(
    [Parameter(Mandatory)]$State,
    [Parameter(Mandatory)][string]$Name
  )

  return $State.PSObject.Properties.Name -contains $Name
}

function Ensure-ClientStateDefaults {
  param([Parameter(Mandatory)]$State)

  if (-not (Test-ClientStateProperty -State $State -Name 'schemaVersion') -or [int]$State.schemaVersion -lt 2) { $State | Add-Member -NotePropertyName schemaVersion -NotePropertyValue 2 -Force }
  if (-not (Test-ClientStateProperty -State $State -Name 'bootstrapVersion')) { $State | Add-Member -NotePropertyName bootstrapVersion -NotePropertyValue (Get-BootstrapVersion) -Force }
  if (-not (Test-ClientStateProperty -State $State -Name 'bootstrapRoot')) { $State | Add-Member -NotePropertyName bootstrapRoot -NotePropertyValue $script:BootstrapRoot -Force }
  if (-not (Test-ClientStateProperty -State $State -Name 'bootstrapInstalledAt')) { $State | Add-Member -NotePropertyName bootstrapInstalledAt -NotePropertyValue '' -Force }
  if (-not (Test-ClientStateProperty -State $State -Name 'channel') -or -not $State.channel) { $State | Add-Member -NotePropertyName channel -NotePropertyValue 'stable' -Force }
  if (-not (Test-ClientStateProperty -State $State -Name 'projectKey') -or -not $State.projectKey) { $State | Add-Member -NotePropertyName projectKey -NotePropertyValue (Get-DefaultClientProjectKey) -Force }
  $State.projectKey = if ($State.projectKey) { ([string]$State.projectKey).Trim().ToLowerInvariant() } else { Get-DefaultClientProjectKey }
  if (-not (Test-ClientStateProperty -State $State -Name 'controlPlaneBaseUrl') -or $null -eq $State.controlPlaneBaseUrl) { $State | Add-Member -NotePropertyName controlPlaneBaseUrl -NotePropertyValue '' -Force }
  if (-not (Test-ClientStateProperty -State $State -Name 'workspacePath') -or $null -eq $State.workspacePath) { $State | Add-Member -NotePropertyName workspacePath -NotePropertyValue $script:RepoRoot -Force }
  if (-not (Test-ClientStateProperty -State $State -Name 'currentReleasePath') -or $null -eq $State.currentReleasePath) { $State | Add-Member -NotePropertyName currentReleasePath -NotePropertyValue '' -Force }
  if (-not (Test-ClientStateProperty -State $State -Name 'currentVersion') -or $null -eq $State.currentVersion) { $State | Add-Member -NotePropertyName currentVersion -NotePropertyValue '' -Force }
  if (-not (Test-ClientStateProperty -State $State -Name 'installedVersions') -or $null -eq $State.installedVersions) { $State | Add-Member -NotePropertyName installedVersions -NotePropertyValue @() -Force }
  if (-not (Test-ClientStateProperty -State $State -Name 'installedAt') -or $null -eq $State.installedAt) { $State | Add-Member -NotePropertyName installedAt -NotePropertyValue '' -Force }
  if (-not (Test-ClientStateProperty -State $State -Name 'phone') -or $null -eq $State.phone) { $State | Add-Member -NotePropertyName phone -NotePropertyValue '' -Force }
  if (-not (Test-ClientStateProperty -State $State -Name 'lastAuth')) { $State | Add-Member -NotePropertyName lastAuth -NotePropertyValue $null -Force }
  if (-not (Test-ClientStateProperty -State $State -Name 'lastPolicy')) { $State | Add-Member -NotePropertyName lastPolicy -NotePropertyValue $null -Force }
  if (-not (Test-ClientStateProperty -State $State -Name 'modelAccess') -or $null -eq $State.modelAccess) {
    $State | Add-Member -NotePropertyName modelAccess -NotePropertyValue ([pscustomobject]@{
      mode = 'lease'
      providers = @()
    }) -Force
  }
  if (-not (Test-ClientStateProperty -State $State -Name 'modelLease')) {
    $State | Add-Member -NotePropertyName modelLease -NotePropertyValue $null -Force
  }
  if (-not (Test-ClientStateProperty -State $State -Name 'session') -or $null -eq $State.session) {
    $State | Add-Member -NotePropertyName session -NotePropertyValue ([pscustomobject]@{
      token = ''
      expiresAt = ''
      validatedAt = ''
    }) -Force
  }
  if (-not (Test-ClientStateProperty -State $State -Name 'prerequisites') -or $null -eq $State.prerequisites) {
    $State | Add-Member -NotePropertyName prerequisites -NotePropertyValue ([pscustomobject]@{}) -Force
  }
  if (-not (Test-ClientStateProperty -State $State -Name 'backgroundUpdate') -or $null -eq $State.backgroundUpdate) {
    $State | Add-Member -NotePropertyName backgroundUpdate -NotePropertyValue $null -Force
  }
  if (-not (Test-ClientStateProperty -State $State -Name 'openClaw') -or $null -eq $State.openClaw) {
    $State | Add-Member -NotePropertyName openClaw -NotePropertyValue ([pscustomobject]@{
      distro = if ($env:OPENCLAW_WSL_DISTRO) { $env:OPENCLAW_WSL_DISTRO } else { 'Ubuntu-24.04' }
      version = ''
      installedAt = ''
    }) -Force
  }

  return $State
}

function Get-ClientState {
  Ensure-ClientLayout
  if (-not (Test-Path $script:ClientStatePath)) {
    return Ensure-ClientStateDefaults -State (New-DefaultClientState)
  }

  $raw = Get-Content $script:ClientStatePath -Raw -Encoding utf8
  if (-not $raw.Trim()) {
    return Ensure-ClientStateDefaults -State (New-DefaultClientState)
  }

  return Ensure-ClientStateDefaults -State ($raw | ConvertFrom-Json)
}

function Save-ClientState {
  param([Parameter(Mandatory)]$State)
  Ensure-ClientLayout
  $json = $State | ConvertTo-Json -Depth 12
  Set-Content -Path $script:ClientStatePath -Value "$json`n" -Encoding utf8
}

function Get-DefaultClientVersion {
  if ($env:AI_DATA_PLATFORM_CLIENT_VERSION) {
    return $env:AI_DATA_PLATFORM_CLIENT_VERSION.Trim()
  }
  return "$(Get-Date -Format 'yyyy.MM.dd')+001"
}

function Get-BootstrapVersion {
  if ($env:AI_DATA_PLATFORM_BOOTSTRAP_VERSION) {
    return $env:AI_DATA_PLATFORM_BOOTSTRAP_VERSION.Trim()
  }
  return 'bootstrap-1'
}

function Resolve-EffectiveWorkspacePath {
  param([Parameter(Mandatory)]$State)

  if ($State.currentReleasePath -and (Test-Path $State.currentReleasePath)) {
    return $State.currentReleasePath
  }

  if ($State.workspacePath -and (Test-Path $State.workspacePath)) {
    return $State.workspacePath
  }

  return $script:RepoRoot
}

function Get-ControlPlaneBaseUrl {
  param([Parameter(Mandatory)]$State)

  $baseUrl = if ($State.controlPlaneBaseUrl) { [string]$State.controlPlaneBaseUrl } elseif ($env:CONTROL_PLANE_API_BASE_URL) { $env:CONTROL_PLANE_API_BASE_URL } else { 'http://127.0.0.1:3210' }
  return $baseUrl.TrimEnd('/')
}

function Resolve-ClientProjectKey {
  param(
    [Parameter(Mandatory)]$State,
    [string]$ProjectKey = ''
  )

  if ($ProjectKey) {
    return $ProjectKey.Trim().ToLowerInvariant()
  }

  if ($State.projectKey) {
    return [string]$State.projectKey
  }

  return Get-DefaultClientProjectKey
}

function Reset-ClientProjectScopedState {
  param([Parameter(Mandatory)]$State)

  $State.session = [pscustomobject]@{
    token = ''
    expiresAt = ''
    validatedAt = ''
  }
  $State.lastAuth = $null
  $State.lastPolicy = $null
  $State.modelAccess = [pscustomobject]@{
    mode = 'lease'
    providers = @()
  }
  $State.modelLease = $null
  $State.pendingRelease = $null
  $State.download = $null
  $State.backgroundUpdate = $null
}

function Set-ClientProjectKey {
  param(
    [Parameter(Mandatory)]$State,
    [string]$ProjectKey = '',
    [switch]$SkipReset
  )

  $resolvedProjectKey = Resolve-ClientProjectKey -State $State -ProjectKey $ProjectKey
  $currentProjectKey = if ($State.projectKey) { [string]$State.projectKey } else { '' }
  if ($currentProjectKey -ne $resolvedProjectKey) {
    $State.projectKey = $resolvedProjectKey
    if (-not $SkipReset) {
      Reset-ClientProjectScopedState -State $State
    }
  } elseif (-not $State.projectKey) {
    $State.projectKey = $resolvedProjectKey
  }

  return $resolvedProjectKey
}

function Resolve-ControlPlaneUrl {
  param(
    [Parameter(Mandatory)][string]$BaseUrl,
    [Parameter(Mandatory)][string]$Path
  )

  $normalized = if ($Path.StartsWith('/')) { $Path } else { "/$Path" }
  if ($BaseUrl.EndsWith('/api') -and $normalized.StartsWith('/api/')) {
    return "$BaseUrl$($normalized.Substring(4))"
  }
  return "$BaseUrl$normalized"
}

function Resolve-WebErrorMessage {
  param([Parameter(Mandatory)]$ErrorRecord)

  $response = $ErrorRecord.Exception.Response
  if ($response -and $response.GetResponseStream) {
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    $body = $reader.ReadToEnd()
    if ($body) {
      return $body
    }
  }
  return $ErrorRecord.Exception.Message
}

function Invoke-ControlPlaneJson {
  param(
    [Parameter(Mandatory)]$State,
    [Parameter(Mandatory)][string]$Path,
    [string]$Method = 'GET',
    $Body = $null,
    [string]$SessionToken = '',
    [string]$AdminToken = '',
    [string]$AdminSessionToken = ''
  )

  $uri = Resolve-ControlPlaneUrl -BaseUrl (Get-ControlPlaneBaseUrl -State $State) -Path $Path
  $headers = @{}
  if ($SessionToken) {
    $headers['Authorization'] = "Bearer $SessionToken"
  }
  if ($AdminSessionToken) {
    $headers['X-Control-Plane-Admin-Session'] = $AdminSessionToken
  }
  if ($AdminToken) {
    $headers['X-Control-Plane-Admin-Token'] = $AdminToken
  }

  try {
    $normalizedMethod = $Method.ToUpperInvariant()
    if ($null -ne $Body) {
      return Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 12)
    }
    if ($normalizedMethod -in @('POST', 'PUT', 'PATCH')) {
      return Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers -ContentType 'application/json' -Body '{}'
    }
    return Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers
  } catch {
    throw "Control plane request failed for $uri. $(Resolve-WebErrorMessage -ErrorRecord $_)"
  }
}

function Get-DeviceFingerprint {
  $machineGuid = ''
  try {
    $machineGuid = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid).MachineGuid
  } catch {}

  $biosSerial = ''
  try {
    $biosSerial = (Get-CimInstance Win32_BIOS).SerialNumber
  } catch {}

  $seed = "$env:COMPUTERNAME|$machineGuid|$biosSerial"
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($seed)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hash = $sha.ComputeHash($bytes)
  } finally {
    $sha.Dispose()
  }
  return ([BitConverter]::ToString($hash)).Replace('-', '').ToLowerInvariant()
}

function Assert-WindowsSupported {
  $productName = ''
  try {
    $productName = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -Name ProductName).ProductName
  } catch {
    $productName = 'Unknown Windows'
  }

  if ($productName -notmatch 'Windows 10|Windows 11') {
    throw "Unsupported Windows version: $productName"
  }
}

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Refresh-ProcessPathFromSystem {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $segments = @()

  foreach ($value in @($machinePath, $userPath)) {
    if (-not $value) {
      continue
    }
    foreach ($segment in ($value -split ';')) {
      $trimmed = $segment.Trim()
      if ($trimmed -and $segments -notcontains $trimmed) {
        $segments += $trimmed
      }
    }
  }

  if ($segments.Count -gt 0) {
    [Environment]::SetEnvironmentVariable('Path', ($segments -join ';'), 'Process')
  }
}

function Get-CommandVersionText {
  param([Parameter(Mandatory)][string]$Command)

  if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
    return ''
  }

  try {
    return (& $Command --version 2>$null | Select-Object -First 1)
  } catch {
    return ''
  }
}

function Convert-WslText {
  param([AllowNull()][string]$Text)

  if ($null -eq $Text) {
    return ''
  }

  return ($Text -replace "`0", '').Trim()
}

function Get-NodeMajorVersion {
  $versionText = Get-CommandVersionText -Command 'node'
  if (-not $versionText) {
    return 0
  }

  $match = [regex]::Match($versionText, 'v?(?<major>\d+)')
  if (-not $match.Success) {
    return 0
  }

  return [int]$match.Groups['major'].Value
}

function Get-WslDistroList {
  if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
    return @()
  }

  try {
    $items = @(wsl.exe --list --quiet 2>$null)
    return @(
      $items |
        ForEach-Object { Convert-WslText -Text ([string]$_) } |
        Where-Object { $_ } |
        ForEach-Object { $_.Trim() }
    )
  } catch {
    return @()
  }
}

function Invoke-WslCapture {
  param(
    [Parameter(Mandatory)][string]$Distro,
    [Parameter(Mandatory)][string]$Command,
    [switch]$RunAsRoot
  )

  $arguments = @('-d', $Distro)
  if ($RunAsRoot) {
    $arguments += @('-u', 'root')
  }
  $arguments += '--'
  $arguments += @('bash', '-lc', $Command)

  $rawOutput = @(& wsl.exe @arguments 2>&1)
  $exitCode = $LASTEXITCODE
  $normalizedOutput = @(
    $rawOutput |
      ForEach-Object { Convert-WslText -Text ([string]$_) } |
      Where-Object { $_ }
  ) -join "`n"

  return [pscustomobject]@{
    ExitCode = $exitCode
    Output = $normalizedOutput.Trim()
  }
}

function Get-InstalledToolVersions {
  $versions = [ordered]@{
    git = ''
    node = ''
    corepack = ''
    wsl = ''
    pnpm = ''
  }

  if (Get-Command git -ErrorAction SilentlyContinue) {
    $versions.git = (git --version 2>$null)
  }
  if (Get-Command node -ErrorAction SilentlyContinue) {
    $versions.node = (node --version 2>$null)
  }
  if (Get-Command corepack -ErrorAction SilentlyContinue) {
    $versions.corepack = (corepack --version 2>$null)
    $versions.pnpm = (corepack pnpm --version 2>$null)
  }
  if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
    $versions.wsl = Convert-WslText -Text ([string](wsl.exe --version 2>$null | Select-Object -First 1))
  }

  return [pscustomobject]$versions
}

function Assert-RequiredCommands {
  param([string[]]$Commands)
  foreach ($command in $Commands) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
      throw "Required command not found: $command"
    }
  }
}

function Test-SessionValid {
  param([Parameter(Mandatory)]$State)
  if (-not $State.session -or -not $State.session.token) {
    return $false
  }
  if (-not $State.session.expiresAt) {
    return $false
  }
  return ([DateTimeOffset]::Parse([string]$State.session.expiresAt)) -gt [DateTimeOffset]::UtcNow
}

function Test-ClientModelLeaseValid {
  param([Parameter(Mandatory)]$State)

  if (-not $State.modelLease -or -not $State.modelLease.token -or -not $State.modelLease.expiresAt) {
    return $false
  }

  return ([DateTimeOffset]::Parse([string]$State.modelLease.expiresAt)) -gt [DateTimeOffset]::UtcNow.AddMinutes(5)
}

function Update-InstalledVersionsList {
  param(
    [Parameter(Mandatory)]$State,
    [Parameter(Mandatory)][string]$Version
  )

  $items = @($State.installedVersions)
  if ($items -notcontains $Version) {
    $State.installedVersions = @($items + $Version)
  }
}

function Test-BitsAvailable {
  return [bool](Get-Command Start-BitsTransfer -ErrorAction SilentlyContinue)
}

function Resolve-WorkspaceToolPath {
  param(
    [Parameter(Mandatory)]$State,
    [Parameter(Mandatory)][string]$RelativePath
  )

  $workspaceRoot = Resolve-EffectiveWorkspacePath -State $State
  return Join-Path $workspaceRoot $RelativePath
}

function Resolve-BootstrapAssetPath {
  param([Parameter(Mandatory)][string]$RelativePath)

  $bootstrapCandidate = Join-Path $PSScriptRoot $RelativePath
  if (Test-Path $bootstrapCandidate) {
    return $bootstrapCandidate
  }

  if ($script:RepoRoot) {
    $repoCandidate = Join-Path $script:RepoRoot $RelativePath
    if (Test-Path $repoCandidate) {
      return $repoCandidate
    }
  }

  return ''
}

function Sync-BootstrapFiles {
  Ensure-ClientLayout

  $sourceRoot = (Resolve-Path $PSScriptRoot).Path
  $destinationRoot = $script:BootstrapRoot

  if ((Resolve-Path $destinationRoot).Path -ne $sourceRoot) {
    Copy-Item -Path (Join-Path $sourceRoot '*') -Destination $destinationRoot -Recurse -Force
  }

  $openClawInstaller = Resolve-BootstrapAssetPath -RelativePath 'tools\install-openclaw-latest.ps1'
  if ($openClawInstaller) {
    Copy-Item -Path $openClawInstaller -Destination (Join-Path $destinationRoot 'install-openclaw-latest.ps1') -Force
  }

  return $destinationRoot
}

function Test-ClientRuntimeRunning {
  param([Parameter(Mandatory)]$State)

  $ports = @(18789, 3100, 3002)
  foreach ($port in $ports) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
      return $true
    }
  }

  $statusScript = Resolve-WorkspaceToolPath -State $State -RelativePath 'tools\status-local.ps1'
  if (-not (Test-Path $statusScript)) {
    return $false
  }

  $statusText = & powershell -ExecutionPolicy Bypass -File $statusScript | Out-String
  return $statusText -match 'running'
}
