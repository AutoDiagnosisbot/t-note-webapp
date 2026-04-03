[CmdletBinding()]
param(
  [string]$Serial,
  [string]$OutputDir = '',
  [switch]$Clear
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-ScriptRoot {
  if ($PSScriptRoot) {
    return $PSScriptRoot
  }

  if ($MyInvocation.MyCommand.Path) {
    return (Split-Path -Parent $MyInvocation.MyCommand.Path)
  }

  return (Get-Location).Path
}

function Get-AdbPath {
  $adbCommand = Get-Command adb -ErrorAction SilentlyContinue
  if ($adbCommand) {
    return $adbCommand.Source
  }

  $sdkAdbPath = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
  if (Test-Path $sdkAdbPath) {
    return $sdkAdbPath
  }

  throw 'adb.exe not found. Install Android platform-tools or add adb to PATH.'
}

function Get-ConnectedDeviceSerials {
  param(
    [Parameter(Mandatory = $true)]
    [string]$AdbPath
  )

  $serials = @()
  $deviceLines = & $AdbPath devices
  foreach ($line in $deviceLines) {
    if ($line -match '^(\S+)\s+device$') {
      $serials += $matches[1]
    }
  }

  return $serials
}

$adbPath = Get-AdbPath
$connectedSerials = @(Get-ConnectedDeviceSerials -AdbPath $adbPath)
$scriptRoot = Get-ScriptRoot

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $OutputDir = Join-Path (Join-Path $scriptRoot '..') 'logs\android'
}

if (-not $Serial) {
  if ($connectedSerials.Count -eq 0) {
    throw 'No Android devices in adb. Connect a phone via USB and allow USB debugging.'
  }

  if ($connectedSerials.Count -gt 1) {
    throw "Multiple Android devices found: $($connectedSerials -join ', '). Pass -Serial explicitly."
  }

  $Serial = $connectedSerials[0]
}

if ($connectedSerials -notcontains $Serial) {
  throw "Android device '$Serial' is not available in adb."
}

$resolvedOutputDir = [System.IO.Path]::GetFullPath($OutputDir)
New-Item -ItemType Directory -Force -Path $resolvedOutputDir | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$rawLogPath = Join-Path $resolvedOutputDir "android-logcat-$timestamp.log"
$filteredLogPath = Join-Path $resolvedOutputDir "android-logcat-$timestamp.filtered.log"
$filterPattern = 'TNoteWebView|ReactNativeJS|cr_WebView|chromium'

Write-Host "Using device: $Serial"
Write-Host "Saving full logcat to: $rawLogPath"
Write-Host "Saving filtered logcat to: $filteredLogPath"
Write-Host 'Press Ctrl+C to stop log capture.'

if ($Clear) {
  & $adbPath -s $Serial logcat -c
}

& $adbPath -s $Serial logcat |
  Tee-Object -FilePath $rawLogPath |
  Select-String -Pattern $filterPattern |
  Tee-Object -FilePath $filteredLogPath
