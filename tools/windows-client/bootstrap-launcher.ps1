$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$manageScript = Join-Path $scriptRoot 'manage-client.ps1'

if (-not (Test-Path $manageScript)) {
  throw "Client manager script not found: $manageScript"
}

function Invoke-ClientAction {
  param(
    [Parameter(Mandatory)][string]$Action,
    [hashtable]$Arguments = @{},
    [Parameter(Mandatory)][System.Windows.Forms.TextBox]$LogBox
  )

  $argList = @(
    '-ExecutionPolicy', 'Bypass',
    '-File', $manageScript,
    '-Action', $Action
  )

  foreach ($key in $Arguments.Keys) {
    $value = $Arguments[$key]
    if ($value -is [bool]) {
      if ($value) {
        $argList += "-$key"
      }
    } elseif ($null -ne $value -and "$value".Trim()) {
      $argList += "-$key"
      $argList += [string]$value
    }
  }

  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = 'powershell'
  $psi.Arguments = [string]::Join(' ', ($argList | ForEach-Object {
    if ($_ -match '\s') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
  }))
  $psi.WorkingDirectory = Split-Path -Parent $scriptRoot
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $psi

  [void]$process.Start()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()

  $timestamp = Get-Date -Format 'HH:mm:ss'
  $LogBox.AppendText("[$timestamp] action=$Action`r`n")
  if ($stdout) {
    $LogBox.AppendText("$stdout`r`n")
  }
  if ($stderr) {
    $LogBox.AppendText("ERR: $stderr`r`n")
  }
  $LogBox.AppendText("`r`n")

  if ($process.ExitCode -ne 0) {
    throw "Action failed: $Action"
  }

  if ($stdout.Trim().StartsWith('{')) {
    return $stdout | ConvertFrom-Json
  }

  return $stdout
}

function New-Label {
  param(
    [string]$Text,
    [int]$X,
    [int]$Y,
    [int]$Width = 180,
    [int]$Height = 22,
    [bool]$Bold = $false,
    [string]$Color = '#241b11'
  )

  $label = New-Object System.Windows.Forms.Label
  $label.Text = $Text
  $label.Location = New-Object System.Drawing.Point($X, $Y)
  $label.Size = New-Object System.Drawing.Size($Width, $Height)
  $fontStyle = if ($Bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
  $label.Font = New-Object System.Drawing.Font('Segoe UI', 10, $fontStyle)
  $label.ForeColor = [System.Drawing.ColorTranslator]::FromHtml($Color)
  return $label
}

function New-ValueLabel {
  param(
    [int]$X,
    [int]$Y,
    [int]$Width = 260
  )

  return New-Label -Text '...' -X $X -Y $Y -Width $Width -Height 36 -Bold $true -Color '#7c2d12'
}

function Refresh-StateView {
  param(
    [hashtable]$Refs,
    [System.Windows.Forms.TextBox]$LogBox
  )

  try {
    $status = Invoke-ClientAction -Action 'status' -LogBox $LogBox
    $Refs.ClientRoot.Text = [string]$status.clientRoot
    $Refs.Bootstrap.Text = if ($status.bootstrapVersion) { [string]$status.bootstrapVersion } else { 'bootstrap-1' }
    $Refs.Workspace.Text = if ($status.workspacePath) { [string]$status.workspacePath } else { 'not-downloaded-yet' }
    $Refs.Version.Text = if ($status.currentVersion) { [string]$status.currentVersion } else { 'runtime-not-installed' }
    $Refs.Phone.Text = if ($status.phone) { [string]$status.phone } else { 'not-verified' }
    $Refs.Session.Text = if ($status.sessionValid) { 'valid' } else { 'invalid' }
    $Refs.Policy.Text = if ($status.policy -and $status.policy.modelAccessMode) { "{0} | {1}" -f $status.policy.channel, $status.policy.modelAccessMode } else { 'not-loaded' }
    $Refs.Lease.Text = if ($status.modelLeaseValid -and $status.modelLease -and $status.modelLease.providerScope) { [string]$status.modelLease.providerScope } else { 'inactive' }
    $Refs.Pending.Text = if ($status.pendingReleaseVersion) { [string]$status.pendingReleaseVersion } else { 'none' }
    $Refs.Download.Text = if ($status.downloadStatus) { [string]$status.downloadStatus } else { 'idle' }
    $Refs.ControlPlane.Text = [string]$status.controlPlaneBaseUrl
    $Refs.Runtime.Text = if ($status.runtimeStatus) { [string]$status.runtimeStatus } else { 'stopped' }
  } catch {
    $LogBox.AppendText("[{0}] refresh failed: {1}`r`n`r`n" -f (Get-Date -Format 'HH:mm:ss'), $_.Exception.Message)
  }
}

function New-ActionButton {
  param(
    [string]$Text,
    [int]$X,
    [int]$Y,
    [scriptblock]$OnClick,
    [string]$BackColor = '#9a3412',
    [string]$ForeColor = '#ffffff'
  )

  $button = New-Object System.Windows.Forms.Button
  $button.Text = $Text
  $button.Location = New-Object System.Drawing.Point($X, $Y)
  $button.Size = New-Object System.Drawing.Size(150, 42)
  $button.BackColor = [System.Drawing.ColorTranslator]::FromHtml($BackColor)
  $button.ForeColor = [System.Drawing.ColorTranslator]::FromHtml($ForeColor)
  $button.FlatStyle = 'Flat'
  $button.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 10, [System.Drawing.FontStyle]::Bold)
  $button.Add_Click($OnClick)
  return $button
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'AI Data Platform Windows Bootstrap Client'
$form.StartPosition = 'CenterScreen'
$form.Size = New-Object System.Drawing.Size(1320, 900)
$form.MinimumSize = New-Object System.Drawing.Size(1180, 820)
$form.BackColor = [System.Drawing.ColorTranslator]::FromHtml('#efe9de')

$headerPanel = New-Object System.Windows.Forms.Panel
$headerPanel.Location = New-Object System.Drawing.Point(24, 20)
$headerPanel.Size = New-Object System.Drawing.Size(1250, 120)
$headerPanel.BackColor = [System.Drawing.ColorTranslator]::FromHtml('#fff8ef')
$headerPanel.BorderStyle = 'FixedSingle'

$title = New-Label -Text 'Windows install / upgrade / license bootstrap' -X 20 -Y 18 -Width 780 -Height 34 -Bold $true -Color '#241b11'
$title.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 18, [System.Drawing.FontStyle]::Bold)
$subtitle = New-Label -Text 'This MVP wraps install, auth, update, and runtime controls in a desktop launcher.' -X 22 -Y 62 -Width 980 -Height 24 -Color '#6c5b46'
$subtitle.Text = 'Bootstrap stays fixed. Only the runtime release downloads, stages, and switches.'
$subtitle.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$headerPanel.Controls.AddRange(@($title, $subtitle))
$form.Controls.Add($headerPanel)

$statusPanel = New-Object System.Windows.Forms.Panel
$statusPanel.Location = New-Object System.Drawing.Point(24, 156)
$statusPanel.Size = New-Object System.Drawing.Size(520, 680)
$statusPanel.BackColor = [System.Drawing.ColorTranslator]::FromHtml('#fffbf5')
$statusPanel.BorderStyle = 'FixedSingle'

$statusTitle = New-Label -Text 'Client state' -X 20 -Y 18 -Width 260 -Height 28 -Bold $true
$statusTitle.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 14, [System.Drawing.FontStyle]::Bold)
$statusPanel.Controls.Add($statusTitle)

$refs = @{}
$statusRows = @(
  @{ Key = 'ClientRoot'; Title = 'Client root'; Top = 66; Width = 450 },
  @{ Key = 'Bootstrap'; Title = 'Bootstrap version'; Top = 126; Width = 220 },
  @{ Key = 'Workspace'; Title = 'Workspace'; Top = 186; Width = 450 },
  @{ Key = 'Version'; Title = 'Runtime version'; Top = 246; Width = 220 },
  @{ Key = 'Phone'; Title = 'Phone'; Top = 306; Width = 220 },
  @{ Key = 'Session'; Title = 'Session'; Top = 366; Width = 220 },
  @{ Key = 'Policy'; Title = 'Policy'; Top = 426; Width = 300 },
  @{ Key = 'Lease'; Title = 'Model lease'; Top = 486; Width = 220 },
  @{ Key = 'Pending'; Title = 'Pending release'; Top = 546; Width = 220 },
  @{ Key = 'Download'; Title = 'Download'; Top = 606; Width = 220 },
  @{ Key = 'ControlPlane'; Title = 'Control plane'; Top = 666; Width = 450 },
  @{ Key = 'Runtime'; Title = 'Runtime'; Top = 726; Width = 450 }
)

foreach ($row in $statusRows) {
  $titleLabel = New-Label -Text $row.Title -X 20 -Y $row.Top -Width 160 -Height 20 -Color '#6c5b46'
  $valueLabel = New-ValueLabel -X 20 -Y ($row.Top + 22) -Width $row.Width
  $refs[$row.Key] = $valueLabel
  $statusPanel.Controls.AddRange(@($titleLabel, $valueLabel))
}

$form.Controls.Add($statusPanel)

$actionPanel = New-Object System.Windows.Forms.Panel
$actionPanel.Location = New-Object System.Drawing.Point(564, 156)
$actionPanel.Size = New-Object System.Drawing.Size(710, 360)
$actionPanel.BackColor = [System.Drawing.ColorTranslator]::FromHtml('#fffbf5')
$actionPanel.BorderStyle = 'FixedSingle'

$actionTitle = New-Label -Text 'Actions' -X 20 -Y 18 -Width 260 -Height 28 -Bold $true
$actionTitle.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 14, [System.Drawing.FontStyle]::Bold)
$actionPanel.Controls.Add($actionTitle)

$phoneLabel = New-Label -Text 'Phone' -X 22 -Y 70 -Width 80 -Height 20 -Color '#6c5b46'
$phoneInput = New-Object System.Windows.Forms.TextBox
$phoneInput.Location = New-Object System.Drawing.Point(108, 66)
$phoneInput.Size = New-Object System.Drawing.Size(200, 30)
$phoneInput.Font = New-Object System.Drawing.Font('Segoe UI', 10)

$baseUrlLabel = New-Label -Text 'Control plane' -X 330 -Y 70 -Width 90 -Height 20 -Color '#6c5b46'
$baseUrlInput = New-Object System.Windows.Forms.TextBox
$baseUrlInput.Location = New-Object System.Drawing.Point(418, 66)
$baseUrlInput.Size = New-Object System.Drawing.Size(250, 30)
$baseUrlInput.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$baseUrlInput.Text = if ($env:CONTROL_PLANE_API_BASE_URL) { $env:CONTROL_PLANE_API_BASE_URL } else { 'http://127.0.0.1:3210' }

$skipOpenClaw = New-Object System.Windows.Forms.CheckBox
$skipOpenClaw.Location = New-Object System.Drawing.Point(108, 110)
$skipOpenClaw.Size = New-Object System.Drawing.Size(180, 22)
$skipOpenClaw.Text = 'Skip OpenClaw install'
$skipOpenClaw.Font = New-Object System.Drawing.Font('Segoe UI', 9)

$skipPrereq = New-Object System.Windows.Forms.CheckBox
$skipPrereq.Location = New-Object System.Drawing.Point(330, 110)
$skipPrereq.Size = New-Object System.Drawing.Size(210, 22)
$skipPrereq.Text = 'Skip prerequisite checks'
$skipPrereq.Font = New-Object System.Drawing.Font('Segoe UI', 9)

$actionPanel.Controls.AddRange(@($phoneLabel, $phoneInput, $baseUrlLabel, $baseUrlInput, $skipOpenClaw, $skipPrereq))

$logPanel = New-Object System.Windows.Forms.Panel
$logPanel.Location = New-Object System.Drawing.Point(564, 538)
$logPanel.Size = New-Object System.Drawing.Size(710, 238)
$logPanel.BackColor = [System.Drawing.ColorTranslator]::FromHtml('#17110c')
$logPanel.BorderStyle = 'FixedSingle'

$logTitle = New-Label -Text 'Execution log' -X 16 -Y 14 -Width 140 -Height 24 -Bold $true -Color '#f9ede0'
$logText = New-Object System.Windows.Forms.TextBox
$logText.Location = New-Object System.Drawing.Point(18, 48)
$logText.Size = New-Object System.Drawing.Size(672, 228)
$logText.Multiline = $true
$logText.ScrollBars = 'Vertical'
$logText.ReadOnly = $true
$logText.BackColor = [System.Drawing.ColorTranslator]::FromHtml('#231913')
$logText.ForeColor = [System.Drawing.ColorTranslator]::FromHtml('#f9ede0')
$logText.Font = New-Object System.Drawing.Font('Consolas', 10)
$logPanel.Controls.AddRange(@($logTitle, $logText))

$buttons = @(
  New-ActionButton -Text 'Install / repair' -X 22 -Y 158 -OnClick {
    try {
      Invoke-ClientAction -Action 'install' -Arguments @{
        ControlPlaneBaseUrl = $baseUrlInput.Text
        SkipOpenClawInstall = $skipOpenClaw.Checked
        SkipPrereqChecks = $skipPrereq.Checked
      } -LogBox $logText | Out-Null
      Refresh-StateView -Refs $refs -LogBox $logText
    } catch {
      [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Install failed')
    }
  }
  New-ActionButton -Text 'Verify phone' -X 186 -Y 158 -OnClick {
    if (-not $phoneInput.Text.Trim()) {
      [System.Windows.Forms.MessageBox]::Show('Enter a phone number first.', 'Missing phone')
      return
    }
    try {
      Invoke-ClientAction -Action 'auth' -Arguments @{ Phone = $phoneInput.Text.Trim() } -LogBox $logText | Out-Null
      Refresh-StateView -Refs $refs -LogBox $logText
    } catch {
      [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Verification failed')
    }
  }
  New-ActionButton -Text 'Check update' -X 350 -Y 158 -OnClick {
    try {
      Invoke-ClientAction -Action 'check-update' -LogBox $logText | Out-Null
      Refresh-StateView -Refs $refs -LogBox $logText
    } catch {
      [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Update check failed')
    }
  }
  New-ActionButton -Text 'Lease model' -X 514 -Y 158 -OnClick {
    try {
      Invoke-ClientAction -Action 'lease-model' -LogBox $logText | Out-Null
      Refresh-StateView -Refs $refs -LogBox $logText
    } catch {
      [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Model lease failed')
    }
  }
  New-ActionButton -Text 'Download update' -X 22 -Y 214 -OnClick {
    try {
      Invoke-ClientAction -Action 'download-update' -LogBox $logText | Out-Null
      Refresh-StateView -Refs $refs -LogBox $logText
    } catch {
      [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Download failed')
    }
  }
  New-ActionButton -Text 'Apply update' -X 186 -Y 214 -OnClick {
    try {
      Invoke-ClientAction -Action 'apply-update' -LogBox $logText | Out-Null
      Refresh-StateView -Refs $refs -LogBox $logText
    } catch {
      [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Apply update failed')
    }
  }
  New-ActionButton -Text 'Start runtime' -X 350 -Y 214 -OnClick {
    try {
      $args = @{}
      if ($phoneInput.Text.Trim()) {
        $args['Phone'] = $phoneInput.Text.Trim()
      }
      Invoke-ClientAction -Action 'start' -Arguments $args -LogBox $logText | Out-Null
      Refresh-StateView -Refs $refs -LogBox $logText
    } catch {
      [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Runtime start failed')
    }
  } -BackColor '#166534'
  New-ActionButton -Text 'Stop runtime' -X 514 -Y 214 -OnClick {
    try {
      Invoke-ClientAction -Action 'stop' -LogBox $logText | Out-Null
      Refresh-StateView -Refs $refs -LogBox $logText
    } catch {
      [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Runtime stop failed')
    }
  } -BackColor '#475569'
  New-ActionButton -Text 'Check environment' -X 22 -Y 270 -OnClick {
    Refresh-StateView -Refs $refs -LogBox $logText
    try {
      Invoke-ClientAction -Action 'preflight' -Arguments @{ SkipPrereqChecks = $skipPrereq.Checked } -LogBox $logText | Out-Null
      Refresh-StateView -Refs $refs -LogBox $logText
    } catch {
      [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Environment check failed')
    }
  } -BackColor '#475569'
)

$actionPanel.Controls.AddRange($buttons)

$tips = New-Label -Text 'Install now auto-checks Git, Node, Corepack, WSL, and OpenClaw. Auth also loads policy, and lease mode can mint a model token before runtime starts.' -X 22 -Y 316 -Width 660 -Height 36 -Color '#6c5b46'
$actionPanel.Controls.Add($tips)

$form.Controls.Add($actionPanel)
$form.Controls.Add($logPanel)

$form.Add_Shown({
  $logText.AppendText("[$(Get-Date -Format 'HH:mm:ss')] launcher ready`r`n`r`n")
  Refresh-StateView -Refs $refs -LogBox $logText
})

[void]$form.ShowDialog()
