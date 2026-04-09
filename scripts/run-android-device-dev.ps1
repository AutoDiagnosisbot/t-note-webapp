[CmdletBinding()]
param(
  [string]$Serial,
  [string]$DeviceName,
  [int]$Port = 8081,
  [switch]$NoLogWindow,
  [switch]$NoReverse
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

function Get-AndroidSdkPath {
  $candidates = @(
    $env:ANDROID_HOME,
    $env:ANDROID_SDK_ROOT,
    (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return [System.IO.Path]::GetFullPath($candidate)
    }
  }

  throw 'Android SDK not found. Install Android SDK or set ANDROID_HOME.'
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

function Get-DeviceDisplayName {
  param(
    [Parameter(Mandatory = $true)]
    [string]$AdbPath,
    [Parameter(Mandatory = $true)]
    [string]$Serial
  )

  $model = (& $AdbPath -s $Serial shell getprop ro.product.model)
  if (-not $model) {
    return $null
  }

  $trimmedModel = $model.Trim()
  if ([string]::IsNullOrWhiteSpace($trimmedModel)) {
    return $null
  }

  return $trimmedModel
}

function Ensure-AndroidLocalProperties {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot,
    [Parameter(Mandatory = $true)]
    [string]$SdkPath
  )

  $androidDir = Join-Path $ProjectRoot 'android'
  if (-not (Test-Path $androidDir)) {
    throw "Android project directory not found at '$androidDir'."
  }

  $localPropertiesPath = Join-Path $androidDir 'local.properties'
  $normalizedSdkPath = $SdkPath.Replace('\', '/')
  $expectedContent = "sdk.dir=$normalizedSdkPath"

  if (Test-Path $localPropertiesPath) {
    $currentContent = (Get-Content $localPropertiesPath -Raw).Trim()
    if ($currentContent -eq $expectedContent) {
      return $localPropertiesPath
    }
  }

  Set-Content -Path $localPropertiesPath -Value $expectedContent -Encoding ASCII
  return $localPropertiesPath
}

function Get-ExpoExpectedAndroidValues {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot
  )

  Push-Location $ProjectRoot
  try {
    $rawConfig = (& npx expo config --json)
    if ($LASTEXITCODE -ne 0) {
      throw 'Failed to resolve Expo config.'
    }
  } finally {
    Pop-Location
  }

  $configJson = $rawConfig -join "`n"
  $config = $configJson | ConvertFrom-Json

  if (
    -not $config.name -or
    -not $config.scheme -or
    -not $config.version -or
    -not $config.android -or
    -not $config.android.package -or
    -not $config.android.versionCode
  ) {
    throw 'Expo config is missing required Android version fields.'
  }

  return [PSCustomObject]@{
    AppName        = [string]$config.name
    AndroidPackage = [string]$config.android.package
    Scheme         = [string]$config.scheme
    VersionCode    = [string]$config.android.versionCode
    VersionName    = [string]$config.version
  }
}

function Test-AndroidVariantMatches {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot,
    [Parameter(Mandatory = $true)]
    [pscustomobject]$ExpectedConfig
  )

  $stringsPath = Join-Path $ProjectRoot 'android\app\src\main\res\values\strings.xml'
  $buildGradlePath = Join-Path $ProjectRoot 'android\app\build.gradle'
  $manifestPath = Join-Path $ProjectRoot 'android\app\src\main\AndroidManifest.xml'

  if (-not (Test-Path $stringsPath) -or -not (Test-Path $buildGradlePath) -or -not (Test-Path $manifestPath)) {
    return $false
  }

  $stringsContent = Get-Content $stringsPath -Raw
  $buildGradleContent = Get-Content $buildGradlePath -Raw
  $manifestContent = Get-Content $manifestPath -Raw

  $hasExpectedName = $stringsContent.Contains("<string name=""app_name"">$($ExpectedConfig.AppName)</string>")
  $hasExpectedPackage =
    $buildGradleContent.Contains("namespace '$($ExpectedConfig.AndroidPackage)'") -and
    $buildGradleContent.Contains("applicationId '$($ExpectedConfig.AndroidPackage)'")
  $hasExpectedScheme = $manifestContent.Contains("android:scheme=""$($ExpectedConfig.Scheme)""")
  $hasExpectedVersion =
    $buildGradleContent.Contains("versionCode $($ExpectedConfig.VersionCode)") -and
    $buildGradleContent.Contains("versionName ""$($ExpectedConfig.VersionName)""")

  return $hasExpectedName -and $hasExpectedPackage -and $hasExpectedScheme -and $hasExpectedVersion
}

$adbPath = Get-AdbPath
$androidSdkPath = Get-AndroidSdkPath
$connectedSerials = @(Get-ConnectedDeviceSerials -AdbPath $adbPath)
$scriptRoot = Get-ScriptRoot
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptRoot '..'))

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

if ([string]::IsNullOrWhiteSpace($DeviceName)) {
  $DeviceName = Get-DeviceDisplayName -AdbPath $adbPath -Serial $Serial
}

$jdkPath = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot'
if (-not (Test-Path $jdkPath)) {
  throw "Required JDK 17 not found at '$jdkPath'."
}

$env:JAVA_HOME = $jdkPath
if (-not ($env:Path -split ';' | Where-Object { $_ -eq "$jdkPath\bin" })) {
  $env:Path = "$jdkPath\bin;$env:Path"
}

$env:ANDROID_HOME = $androidSdkPath
$env:ANDROID_SDK_ROOT = $androidSdkPath

$env:APP_VARIANT = 'dev'
$env:ANDROID_SERIAL = $Serial
$expectedAndroidConfig = Get-ExpoExpectedAndroidValues -ProjectRoot $projectRoot

if (-not (Test-AndroidVariantMatches -ProjectRoot $projectRoot -ExpectedConfig $expectedAndroidConfig)) {
  Write-Host 'Android native project does not match resolved Expo config. Running expo prebuild --platform android --clean'
  & npx expo prebuild --platform android --clean
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

$localPropertiesPath = Ensure-AndroidLocalProperties -ProjectRoot $projectRoot -SdkPath $androidSdkPath

Write-Host "Using Android device: $Serial"
if ($DeviceName) {
  Write-Host "Expo device name: $DeviceName"
}
Write-Host "Android SDK: $androidSdkPath"
Write-Host "local.properties: $localPropertiesPath"
Write-Host "Metro port: $Port"
Write-Host "APP_VARIANT: $env:APP_VARIANT"
Write-Host "Expo versionName: $($expectedAndroidConfig.VersionName)"
Write-Host "Expo versionCode: $($expectedAndroidConfig.VersionCode)"

& $adbPath -s $Serial wait-for-device

if (-not $NoReverse) {
  Write-Host "Configuring adb reverse tcp:$Port -> tcp:$Port"
  & $adbPath -s $Serial reverse "tcp:$Port" "tcp:$Port"
}

if (-not $NoLogWindow) {
  $collectorScriptPath = Join-Path $scriptRoot 'collect-android-logs.ps1'
  Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    $collectorScriptPath,
    '-Serial',
    $Serial,
    '-Clear'
  ) | Out-Null
}

& npx expo run:android --port $Port
