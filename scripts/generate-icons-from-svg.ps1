param(
  [string]$SourceSvgPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'assets/images/vector_icon.svg'),
  [string]$ImagesDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'assets/images'),
  [string]$ChromePath
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

function Find-ChromePath {
  param(
    [string]$PreferredPath
  )

  if ($PreferredPath) {
    if (Test-Path -LiteralPath $PreferredPath) {
      return (Resolve-Path -LiteralPath $PreferredPath).Path
    }

    throw "Chrome was not found at the provided path: $PreferredPath"
  }

  $command = Get-Command chrome.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidatePaths = @(
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
  )

  foreach ($candidatePath in $candidatePaths) {
    if (Test-Path -LiteralPath $candidatePath) {
      return $candidatePath
    }
  }

  throw 'Chrome was not found. Install Google Chrome or pass -ChromePath explicitly.'
}

function New-Bitmap {
  param(
    [int]$Width,
    [int]$Height
  )

  return [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
}

function Save-Png {
  param(
    [System.Drawing.Image]$Bitmap,
    [string]$Path
  )

  $directory = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory | Out-Null
  }

  $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Resize-Image {
  param(
    [System.Drawing.Image]$Source,
    [int]$Width,
    [int]$Height
  )

  $bitmap = New-Bitmap -Width $Width -Height $Height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.DrawImage($Source, 0, 0, $Width, $Height)
  }
  finally {
    $graphics.Dispose()
  }

  return $bitmap
}

function New-SolidBitmap {
  param(
    [int]$Size,
    [System.Drawing.Color]$Color
  )

  $bitmap = New-Bitmap -Width $Size -Height $Size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear($Color)
  }
  finally {
    $graphics.Dispose()
  }

  return $bitmap
}

function Load-SvgDocument {
  param(
    [string]$Path
  )

  $doc = New-Object System.Xml.XmlDocument
  $doc.PreserveWhitespace = $true
  $doc.Load($Path)
  return $doc
}

function Get-SvgCanvasSize {
  param(
    [System.Xml.XmlDocument]$Document
  )

  $root = $Document.DocumentElement
  $viewBox = $root.GetAttribute('viewBox')
  if ($viewBox) {
    $parts = $viewBox -split '\s+'
    if ($parts.Count -eq 4) {
      return @{
        Width = [double]::Parse($parts[2], [System.Globalization.CultureInfo]::InvariantCulture)
        Height = [double]::Parse($parts[3], [System.Globalization.CultureInfo]::InvariantCulture)
      }
    }
  }

  return @{
    Width = [double]::Parse(($root.GetAttribute('width') -replace 'px$', ''), [System.Globalization.CultureInfo]::InvariantCulture)
    Height = [double]::Parse(($root.GetAttribute('height') -replace 'px$', ''), [System.Globalization.CultureInfo]::InvariantCulture)
  }
}

function Get-TopLevelDrawableNodes {
  param(
    [System.Xml.XmlDocument]$Document
  )

  $ignoredNames = @('defs', 'title', 'desc', 'metadata')

  return @(
    $Document.DocumentElement.ChildNodes |
      Where-Object { $_ -is [System.Xml.XmlElement] -and $_.LocalName -notin $ignoredNames }
  )
}

function Test-IsWhiteFill {
  param(
    [System.Xml.XmlElement]$Element
  )

  $fill = $Element.GetAttribute('fill')
  return $fill -match '^(white|#fff(?:fff)?|rgb\(255,\s*255,\s*255\))$'
}

function Test-IsBackgroundNode {
  param(
    [System.Xml.XmlElement]$Element,
    [double]$CanvasWidth,
    [double]$CanvasHeight
  )

  if (-not (Test-IsWhiteFill -Element $Element)) {
    return $false
  }

  if ($Element.LocalName -eq 'rect') {
    $x = if ($Element.HasAttribute('x')) { [double]::Parse($Element.GetAttribute('x'), [System.Globalization.CultureInfo]::InvariantCulture) } else { 0.0 }
    $y = if ($Element.HasAttribute('y')) { [double]::Parse($Element.GetAttribute('y'), [System.Globalization.CultureInfo]::InvariantCulture) } else { 0.0 }
    $width = [double]::Parse($Element.GetAttribute('width'), [System.Globalization.CultureInfo]::InvariantCulture)
    $height = [double]::Parse($Element.GetAttribute('height'), [System.Globalization.CultureInfo]::InvariantCulture)

    return $x -eq 0.0 -and $y -eq 0.0 -and $width -eq $CanvasWidth -and $height -eq $CanvasHeight
  }

  if ($Element.LocalName -eq 'path') {
    $normalizedD = (($Element.GetAttribute('d') -replace ',', ' ') -replace '\s+', ' ').Trim()
    $pattern = '^M\s*0(?:\.0+)?\s+0(?:\.0+)?\s*H\s*(?<width>-?\d+(?:\.\d+)?)\s*V\s*(?<height>-?\d+(?:\.\d+)?)\s*H\s*0(?:\.0+)?\s*V\s*0(?:\.0+)?\s*Z$'

    if ($normalizedD -match $pattern) {
      $width = [double]::Parse($Matches['width'], [System.Globalization.CultureInfo]::InvariantCulture)
      $height = [double]::Parse($Matches['height'], [System.Globalization.CultureInfo]::InvariantCulture)
      return $width -eq $CanvasWidth -and $height -eq $CanvasHeight
    }
  }

  return $false
}

function Remove-WhiteBackground {
  param(
    [System.Xml.XmlDocument]$Document
  )

  $canvasSize = Get-SvgCanvasSize -Document $Document
  $drawableNodes = Get-TopLevelDrawableNodes -Document $Document

  if ($drawableNodes.Count -eq 0) {
    return
  }

  $firstDrawable = $drawableNodes[0]
  if (Test-IsBackgroundNode -Element $firstDrawable -CanvasWidth $canvasSize.Width -CanvasHeight $canvasSize.Height) {
    [void]$Document.DocumentElement.RemoveChild($firstDrawable)
  }
}

function Remove-DefsNodes {
  param(
    [System.Xml.XmlDocument]$Document
  )

  $defsNodes = @($Document.DocumentElement.ChildNodes | Where-Object { $_ -is [System.Xml.XmlElement] -and $_.LocalName -eq 'defs' })
  foreach ($defsNode in $defsNodes) {
    [void]$Document.DocumentElement.RemoveChild($defsNode)
  }
}

function Convert-ToMonochrome {
  param(
    [System.Xml.XmlNode]$Node
  )

  foreach ($childNode in $Node.ChildNodes) {
    if ($childNode -isnot [System.Xml.XmlElement]) {
      continue
    }

    if ($childNode.LocalName -eq 'defs') {
      continue
    }

    $isDrawableElement = $childNode.LocalName -in @('path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line')

    if ($childNode.HasAttribute('fill') -and $childNode.GetAttribute('fill') -ne 'none') {
      $childNode.SetAttribute('fill', '#FFFFFF')
    }
    elseif ($isDrawableElement -and -not $childNode.HasAttribute('stroke')) {
      $childNode.SetAttribute('fill', '#FFFFFF')
    }

    if ($childNode.HasAttribute('stroke') -and $childNode.GetAttribute('stroke') -ne 'none') {
      $childNode.SetAttribute('stroke', '#FFFFFF')
    }

    Convert-ToMonochrome -Node $childNode
  }
}

function Get-SvgOuterXml {
  param(
    [System.Xml.XmlDocument]$Document
  )

  return $Document.OuterXml
}

function Render-SvgToPng {
  param(
    [string]$SvgContent,
    [string]$OutputPath,
    [int]$Size,
    [string]$ChromeExecutable,
    [bool]$TransparentBackground
  )

  $tempDir = Join-Path $env:TEMP ('tnote-icon-render-' + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $tempDir | Out-Null

  try {
    $htmlPath = Join-Path $tempDir 'render.html'
    $bodyBackground = if ($TransparentBackground) { 'transparent' } else { 'white' }

    $html = @"
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: ${Size}px;
      height: ${Size}px;
      overflow: hidden;
      background: ${bodyBackground};
    }
    body > svg {
      display: block;
      width: ${Size}px;
      height: ${Size}px;
    }
  </style>
</head>
<body>
${SvgContent}
</body>
</html>
"@

    Set-Content -LiteralPath $htmlPath -Value $html -Encoding UTF8

    $arguments = @(
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--run-all-compositor-stages-before-draw',
      "--window-size=$Size,$Size"
    )

    if ($TransparentBackground) {
      $arguments += '--default-background-color=00000000'
    }

    $arguments += "--screenshot=$OutputPath"
    $arguments += ([System.Uri]::new($htmlPath)).AbsoluteUri

    $process = Start-Process -FilePath $ChromeExecutable -ArgumentList $arguments -NoNewWindow -Wait -PassThru

    if ($process.ExitCode -ne 0) {
      throw "Chrome exited with code $($process.ExitCode) while rendering $OutputPath"
    }

    if (-not (Test-Path -LiteralPath $OutputPath)) {
      throw "Chrome did not produce screenshot: $OutputPath"
    }
  }
  finally {
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if (-not (Test-Path -LiteralPath $SourceSvgPath)) {
  throw "Source SVG was not found: $SourceSvgPath"
}

if (-not (Test-Path -LiteralPath $ImagesDir)) {
  throw "Images directory was not found: $ImagesDir"
}

$resolvedChromePath = Find-ChromePath -PreferredPath $ChromePath

$originalSvg = Load-SvgDocument -Path $SourceSvgPath
$transparentColorSvg = Load-SvgDocument -Path $SourceSvgPath
$transparentMonochromeSvg = Load-SvgDocument -Path $SourceSvgPath

try {
  Remove-WhiteBackground -Document $transparentColorSvg
  Remove-WhiteBackground -Document $transparentMonochromeSvg
  Remove-DefsNodes -Document $transparentMonochromeSvg
  Convert-ToMonochrome -Node $transparentMonochromeSvg.DocumentElement

  $tempRenderDir = Join-Path $env:TEMP ('tnote-icon-masters-' + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $tempRenderDir | Out-Null

  try {
    $colorMasterPath = Join-Path $tempRenderDir 'color-master-1024.png'
    $transparentColorMasterPath = Join-Path $tempRenderDir 'transparent-color-master-1024.png'
    $transparentMonochromeMasterPath = Join-Path $tempRenderDir 'transparent-monochrome-master-1024.png'

    Render-SvgToPng -SvgContent (Get-SvgOuterXml -Document $originalSvg) -OutputPath $colorMasterPath -Size 1024 -ChromeExecutable $resolvedChromePath -TransparentBackground:$false
    Render-SvgToPng -SvgContent (Get-SvgOuterXml -Document $transparentColorSvg) -OutputPath $transparentColorMasterPath -Size 1024 -ChromeExecutable $resolvedChromePath -TransparentBackground:$true
    Render-SvgToPng -SvgContent (Get-SvgOuterXml -Document $transparentMonochromeSvg) -OutputPath $transparentMonochromeMasterPath -Size 1024 -ChromeExecutable $resolvedChromePath -TransparentBackground:$true

    $colorMaster = [System.Drawing.Bitmap]::new($colorMasterPath)
    $transparentColorMaster = [System.Drawing.Bitmap]::new($transparentColorMasterPath)
    $transparentMonochromeMaster = [System.Drawing.Bitmap]::new($transparentMonochromeMasterPath)

    try {
      $iconColor512 = Resize-Image -Source $colorMaster -Width 512 -Height 512
      $favicon = Resize-Image -Source $colorMaster -Width 48 -Height 48
      $androidForeground = Resize-Image -Source $transparentColorMaster -Width 512 -Height 512
      $monochrome512 = Resize-Image -Source $transparentMonochromeMaster -Width 512 -Height 512
      $notificationMonochrome = Resize-Image -Source $transparentMonochromeMaster -Width 432 -Height 432
      $androidBackground = New-SolidBitmap -Size 512 -Color ([System.Drawing.Color]::White)

      try {
        Save-Png -Bitmap $colorMaster -Path (Join-Path $ImagesDir 'icon.png')
        Save-Png -Bitmap $colorMaster -Path (Join-Path $ImagesDir 'icon-color-1024.png')
        Save-Png -Bitmap $iconColor512 -Path (Join-Path $ImagesDir 'icon-color-512.png')
        Save-Png -Bitmap $colorMaster -Path (Join-Path $ImagesDir 'splash-icon.png')
        Save-Png -Bitmap $favicon -Path (Join-Path $ImagesDir 'favicon.png')
        Save-Png -Bitmap $androidBackground -Path (Join-Path $ImagesDir 'android-icon-background.png')
        Save-Png -Bitmap $androidForeground -Path (Join-Path $ImagesDir 'android-icon-foreground.png')
        Save-Png -Bitmap $transparentMonochromeMaster -Path (Join-Path $ImagesDir 'icon-monochrome-1024.png')
        Save-Png -Bitmap $monochrome512 -Path (Join-Path $ImagesDir 'icon-monochrome-512.png')
        Save-Png -Bitmap $notificationMonochrome -Path (Join-Path $ImagesDir 'android-icon-monochrome.png')
      }
      finally {
        $iconColor512.Dispose()
        $favicon.Dispose()
        $androidForeground.Dispose()
        $monochrome512.Dispose()
        $notificationMonochrome.Dispose()
        $androidBackground.Dispose()
      }
    }
    finally {
      $colorMaster.Dispose()
      $transparentColorMaster.Dispose()
      $transparentMonochromeMaster.Dispose()
    }
  }
  finally {
    Remove-Item -LiteralPath $tempRenderDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
finally {
  $originalSvg = $null
  $transparentColorSvg = $null
  $transparentMonochromeSvg = $null
}

Write-Output "Generated app icon assets from $SourceSvgPath"
