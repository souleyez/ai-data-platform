param(
  [Parameter(Mandatory = $true)][string]$Phone,
  [string]$ProjectKey = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$state = Get-ClientState
$effectiveProjectKey = Set-ClientProjectKey -State $state -ProjectKey $ProjectKey
$reportedClientVersion = if ($state.currentVersion) { [string]$state.currentVersion } else { '' }
$deviceFingerprint = Get-DeviceFingerprint
$osVersion = try {
  (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -Name ProductName).ProductName
} catch {
  'Windows'
}

$result = Invoke-ControlPlaneJson -State $state -Path '/api/client/bootstrap/auth' -Method 'POST' -Body @{
  phone = $Phone
  projectKey = $effectiveProjectKey
  deviceFingerprint = $deviceFingerprint
  deviceName = $env:COMPUTERNAME
  osVersion = $osVersion
  clientVersion = $reportedClientVersion
  openclawVersion = [string]$state.openClaw.version
}

$state.phone = [string]$result.user.phone
$state.session.token = [string]$result.session.token
$state.session.expiresAt = [string]$result.session.expiresAt
$state.session.validatedAt = (Get-Date).ToUniversalTime().ToString('o')
$state.modelAccess = [pscustomobject]@{
  mode = [string]$result.modelAccess.mode
  providers = @($result.modelAccess.providers)
}
$state.modelLease = $null
$state.lastAuth = $result
$policy = Invoke-ControlPlaneJson -State $state -Path '/api/client/policy' -Method 'GET' -SessionToken ([string]$state.session.token)
$state.lastPolicy = $policy.policy
Save-ClientState -State $state

[pscustomobject]@{
  status = [string]$result.status
  projectKey = [string]$state.projectKey
  user = $result.user
  device = $result.device
  session = $result.session
  upgrade = $result.upgrade
  modelAccess = $result.modelAccess
  policy = $policy.policy
} | ConvertTo-Json -Depth 12
