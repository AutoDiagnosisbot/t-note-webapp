[CmdletBinding()]
param(
  [switch]$PrebuildClean,
  [switch]$DisableWebViewDebug
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

$scriptRoot = Get-ScriptRoot
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptRoot '..'))
$androidSdkPath = Get-AndroidSdkPath

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
$env:NODE_ENV = 'production'
$env:NODE_OPTIONS = '--max-old-space-size=1024'
$env:WEBVIEW_DEBUG_ENABLED = if ($DisableWebViewDebug) { 'false' } else { 'true' }
$expectedAndroidConfig = Get-ExpoExpectedAndroidValues -ProjectRoot $projectRoot

Write-Host "Android SDK: $androidSdkPath"
Write-Host "JAVA_HOME: $env:JAVA_HOME"
Write-Host "APP_VARIANT: $env:APP_VARIANT"
Write-Host "NODE_ENV: $env:NODE_ENV"
Write-Host "NODE_OPTIONS: $env:NODE_OPTIONS"
Write-Host "WEBVIEW_DEBUG_ENABLED: $env:WEBVIEW_DEBUG_ENABLED"
Write-Host "Expo versionName: $($expectedAndroidConfig.VersionName)"
Write-Host "Expo versionCode: $($expectedAndroidConfig.VersionCode)"

if ($PrebuildClean -or -not (Test-AndroidVariantMatches -ProjectRoot $projectRoot -ExpectedConfig $expectedAndroidConfig)) {
  if ($PrebuildClean) {
    Write-Host 'Running expo prebuild --platform android --clean'
  } else {
    Write-Host 'Android native project does not match resolved Expo config. Running expo prebuild --platform android --clean'
  }

  & npx expo prebuild --platform android --clean
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

$localPropertiesPath = Ensure-AndroidLocalProperties -ProjectRoot $projectRoot -SdkPath $androidSdkPath
Write-Host "local.properties: $localPropertiesPath"

$androidDir = Join-Path $projectRoot 'android'
Push-Location $androidDir
try {
  & .\gradlew.bat assembleRelease --no-parallel --max-workers=1
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}

$apkPath = Join-Path $androidDir 'app\build\outputs\apk\release\app-release.apk'
if (Test-Path $apkPath) {
  Write-Host "APK ready: $apkPath"
}
