$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$skillRoot = Join-Path $repoRoot 'skills\python-dataviz'
$venvPython = Join-Path $skillRoot '.venv\Scripts\python.exe'
$verifyDir = Join-Path $repoRoot 'tmp\python-dataviz-verify'
$pngPath = Join-Path $verifyDir 'verify-chart.png'
$htmlPath = Join-Path $verifyDir 'verify-chart.html'
$scriptPath = Join-Path $verifyDir 'verify_python_dataviz.py'

if (-not (Test-Path -LiteralPath $venvPython)) {
  throw "python-dataviz venv is missing. Run `corepack pnpm dataviz:setup` first."
}

New-Item -ItemType Directory -Force -Path $verifyDir | Out-Null

$script = @"
from pathlib import Path
import pandas as pd
import plotly.express as px

png_path = Path(r'''$pngPath''')
html_path = Path(r'''$htmlPath''')

df = pd.DataFrame(
    {
        "label": ["North", "South", "East", "West"],
        "value": [42, 35, 58, 49],
    }
)

fig = px.bar(df, x="label", y="value", title="python-dataviz verify")
fig.write_image(str(png_path))
fig.write_html(str(html_path), include_plotlyjs="cdn")

print(f"png={png_path}")
print(f"html={html_path}")
"@

Set-Content -LiteralPath $scriptPath -Value $script -Encoding UTF8
& $venvPython $scriptPath
if ($LASTEXITCODE -ne 0) {
  throw "python-dataviz verification failed ($LASTEXITCODE)"
}
