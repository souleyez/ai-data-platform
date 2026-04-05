param(
  [string]$ProjectKey = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$state = Get-ClientState
$effectiveProjectKey = Set-ClientProjectKey -State $state -ProjectKey $ProjectKey
if (-not (Test-SessionValid -State $state)) {
  throw 'No valid client session. Run auth-client.ps1 first.'
}

$policy = Invoke-ControlPlaneJson -State $state -Path '/api/client/policy' -SessionToken $state.session.token
$release = Invoke-ControlPlaneJson -State $state -Path "/api/client/releases/latest?channel=$($state.channel)" -SessionToken $state.session.token

$state.pendingRelease = $release.release
$state.lastPolicy = $policy.policy
Save-ClientState -State $state

[pscustomobject]@{
  status = 'ok'
  projectKey = $effectiveProjectKey
  currentVersion = if ($state.currentVersion) { $state.currentVersion } else { Get-DefaultClientVersion }
  channel = $state.channel
  policy = $policy.policy
  pendingRelease = $release.release
} | ConvertTo-Json -Depth 12
