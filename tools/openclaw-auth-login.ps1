$ErrorActionPreference = 'Stop'

param(
  [Parameter(Mandatory = $true)]
  [string]$Provider,

  [Parameter(Mandatory = $true)]
  [string]$Method,

  [string]$Distro = 'Ubuntu-24.04'
)

$quotedProvider = $Provider.Replace("'", "''")
$quotedMethod = $Method.Replace("'", "''")
$quotedDistro = $Distro.Replace("'", "''")
$loginCommand = "openclaw models auth login --provider '$quotedProvider' --method '$quotedMethod' --set-default"

$innerCommand = @"
Write-Host ''
Write-Host 'OpenClaw 模型登录' -ForegroundColor Cyan
Write-Host 'Provider: $Provider'
Write-Host 'Method:   $Method'
Write-Host ''
wsl.exe -d '$quotedDistro' -- bash -lc ""$loginCommand""
Write-Host ''
Write-Host '登录流程已结束。回到项目页面后点一次刷新即可重新读取状态。' -ForegroundColor Green
"@

Start-Process powershell.exe -ArgumentList @(
  '-NoExit',
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
  $innerCommand
) | Out-Null

Write-Output 'login_window_started'
