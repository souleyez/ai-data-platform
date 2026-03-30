$ErrorActionPreference = 'Stop'

$src = 'C:\Users\soulzyn\Desktop\codex\ai-data-platform\tools\generate-divoom-proposal-ppt.ps1'
$tmp = 'C:\Users\soulzyn\Desktop\codex\ai-data-platform\tmp\generate-divoom-proposal-ppt.bom.ps1'

$content = Get-Content -Raw -Encoding UTF8 $src
Set-Content -Path $tmp -Value $content -Encoding UTF8

& $tmp
