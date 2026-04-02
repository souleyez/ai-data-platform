$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$state = Get-ClientState
if (-not $state.pendingRelease) {
  throw 'No pending release. Run check-client-update.ps1 first.'
}

$version = [string]$state.pendingRelease.version
$artifactUrl = [string]$state.pendingRelease.artifactUrl
$destination = Join-Path $script:ClientDownloadsDir "$version.zip"
$expectedSize = [int64]$state.pendingRelease.artifactSize
$expectedSha = [string]$state.pendingRelease.artifactSha256
$jobName = "AIDataPlatform-$version"

function Convert-BitsCount {
  param($Value)

  if ($null -eq $Value) {
    return [int64]0
  }

  $text = [string]$Value
  if (-not $text.Trim()) {
    return [int64]0
  }

  if ($text -eq '18446744073709551615') {
    return [int64]0
  }

  return [int64]$text
}

function Test-DownloadComplete {
  if (-not (Test-Path $destination)) {
    return $false
  }

  if ($expectedSize -gt 0 -and (Get-Item $destination).Length -ne $expectedSize) {
    return $false
  }

  $sha = (Get-FileHash -Algorithm SHA256 -Path $destination).Hash.ToLowerInvariant()
  return $sha -eq $expectedSha.ToLowerInvariant()
}

function Complete-DirectDownload {
  Invoke-WebRequest -Uri $artifactUrl -OutFile $destination
  if (-not (Test-DownloadComplete)) {
    throw "Downloaded artifact hash mismatch for $version"
  }

  $state.download = [pscustomobject]@{
    version = $version
    destination = $destination
    status = 'completed'
    bytesTransferred = $expectedSize
    bytesTotal = $expectedSize
    updatedAt = (Get-Date).ToUniversalTime().ToString('o')
  }
  Save-ClientState -State $state
  $state.download | ConvertTo-Json -Depth 8
  exit 0
}

if ((Test-Path $destination) -and ((Get-Item $destination).Length -eq $expectedSize)) {
  if (Test-DownloadComplete) {
    $state.download = [pscustomobject]@{
      version = $version
      destination = $destination
      status = 'completed'
      bytesTransferred = $expectedSize
      bytesTotal = $expectedSize
      updatedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    Save-ClientState -State $state
    $state.download | ConvertTo-Json -Depth 8
    exit 0
  }
}

if ((Test-BitsAvailable) -and ($artifactUrl -notmatch '^https?://(127\\.0\\.0\\.1|localhost)(:\\d+)?/')) {
  try {
    $job = @(Get-BitsTransfer -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq $jobName }) | Select-Object -First 1
    if (-not $job) {
      $job = Start-BitsTransfer -Source $artifactUrl -Destination $destination -DisplayName $jobName -Asynchronous
    } elseif ($job.JobState -in @('Suspended', 'TransientError')) {
      Resume-BitsTransfer -BitsJob $job
    }

    if ($job.JobState -eq 'Transferred') {
      Complete-BitsTransfer -BitsJob $job
    }

    $bytesTransferred = Convert-BitsCount -Value $job.BytesTransferred
    $bitsBytesTotal = Convert-BitsCount -Value $job.BytesTotal
    $bytesTotal = if ($bitsBytesTotal -gt 0) { $bitsBytesTotal } elseif ($expectedSize -gt 0) { $expectedSize } elseif (Test-Path $destination) { [int64](Get-Item $destination).Length } else { 0 }
    $status = if (Test-DownloadComplete) { 'completed' } else { 'downloading' }

    $state.download = [pscustomobject]@{
      version = $version
      destination = $destination
      status = $status
      bytesTransferred = $bytesTransferred
      bytesTotal = $bytesTotal
      jobId = [string]$job.Id
      updatedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    Save-ClientState -State $state
    $state.download | ConvertTo-Json -Depth 8
    exit 0
  } catch {
    $bitsJob = @(Get-BitsTransfer -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq $jobName }) | Select-Object -First 1
    if ($bitsJob) {
      Remove-BitsTransfer -BitsJob $bitsJob -Confirm:$false -ErrorAction SilentlyContinue
    }
  }
}

Complete-DirectDownload
