param(
  [string]$ProviderScope = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$state = Get-ClientState
if (-not (Test-SessionValid -State $state)) {
  throw 'No valid client session. Run auth-client.ps1 first.'
}

if (-not $ProviderScope) {
  if ($state.lastPolicy -and $state.lastPolicy.providerScopes -and @($state.lastPolicy.providerScopes).Count -gt 0) {
    $ProviderScope = [string](@($state.lastPolicy.providerScopes)[0])
  } elseif ($state.modelAccess -and $state.modelAccess.providers -and @($state.modelAccess.providers).Count -gt 0) {
    $ProviderScope = [string](@($state.modelAccess.providers)[0])
  } else {
    $ProviderScope = 'default'
  }
}

$result = Invoke-ControlPlaneJson `
  -State $state `
  -Path '/api/client/model-lease' `
  -Method 'POST' `
  -SessionToken ([string]$state.session.token) `
  -Body @{
    providerScope = $ProviderScope
  }

$state.modelLease = [pscustomobject]@{
  providerScope = $ProviderScope
  token = [string]$result.lease.token
  expiresAt = [string]$result.lease.expiresAt
  proxyBaseUrl = [string]$result.proxy.baseUrl
  issuedAt = (Get-Date).ToUniversalTime().ToString('o')
}
Save-ClientState -State $state

[pscustomobject]@{
  status = 'ok'
  providerScope = $ProviderScope
  lease = $state.modelLease
} | ConvertTo-Json -Depth 10
