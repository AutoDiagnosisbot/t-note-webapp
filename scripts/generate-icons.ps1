$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$imagesDir = Join-Path $projectRoot 'assets/images'

$colorMasterPath = Join-Path $imagesDir 'icon-color-1024.png'
$monoMasterPath = Join-Path $imagesDir 'icon-monochrome-1024.png'

$whiteThreshold = 240
$safeZoneRatio = 0.49
$verticalOffsetRatio = 0.035

function New-Bitmap {
  param(
    [int]$Width,
    [int]$Height
  )

  return [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
}

function Save-Png {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    [string]$Path
  )

  $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Merge-Layers {
  param(
    [System.Drawing.Image]$Background,
    [System.Drawing.Image]$Foreground
  )

  $bitmap = New-Bitmap -Width $Background.Width -Height $Background.Height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.DrawImage($Background, 0, 0, $Background.Width, $Background.Height)
    $graphics.DrawImage($Foreground, 0, 0, $Foreground.Width, $Foreground.Height)
  }
  finally {
    $graphics.Dispose()
  }

  return $bitmap
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

function Get-Sign-Bounds {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    [int]$Threshold
  )

  $minX = $Bitmap.Width
  $minY = $Bitmap.Height
  $maxX = -1
  $maxY = -1

  for ($y = 0; $y -lt $Bitmap.Height; $y++) {
    for ($x = 0; $x -lt $Bitmap.Width; $x++) {
      $pixel = $Bitmap.GetPixel($x, $y)
      if ($pixel.R -ge $Threshold -and $pixel.G -ge $Threshold -and $pixel.B -ge $Threshold) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }

  if ($maxX -lt 0 -or $maxY -lt 0) {
    throw 'Failed to detect sign bounds in monochrome master icon.'
  }

  return @{
    X = $minX
    Y = $minY
    Width = $maxX - $minX + 1
    Height = $maxY - $minY + 1
  }
}

function New-Sign-Layer {
  param(
    [System.Drawing.Bitmap]$MonoMaster,
    [hashtable]$Bounds,
    [int]$CanvasSize,
    [double]$SafeZoneRatio,
    [double]$VerticalOffsetRatio,
    [int]$Threshold
  )

  $signBitmap = New-Bitmap -Width $Bounds.Width -Height $Bounds.Height
  for ($y = 0; $y -lt $Bounds.Height; $y++) {
    for ($x = 0; $x -lt $Bounds.Width; $x++) {
      $sourcePixel = $MonoMaster.GetPixel($Bounds.X + $x, $Bounds.Y + $y)
      if ($sourcePixel.R -ge $Threshold -and $sourcePixel.G -ge $Threshold -and $sourcePixel.B -ge $Threshold) {
        $signBitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, 255, 255, 255))
      }
      else {
        $signBitmap.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
      }
    }
  }

  $maxTargetSide = [int][Math]::Round($CanvasSize * $SafeZoneRatio)
  $scale = [Math]::Min($maxTargetSide / $Bounds.Width, $maxTargetSide / $Bounds.Height)
  $targetWidth = [Math]::Max(1, [int][Math]::Round($Bounds.Width * $scale))
  $targetHeight = [Math]::Max(1, [int][Math]::Round($Bounds.Height * $scale))

  $canvas = New-Bitmap -Width $CanvasSize -Height $CanvasSize
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $destX = [int][Math]::Round(($CanvasSize - $targetWidth) / 2)
    $baseDestY = [int][Math]::Round(($CanvasSize - $targetHeight) / 2)
    $offsetY = [int][Math]::Round($CanvasSize * $VerticalOffsetRatio)
    $destY = [Math]::Min($CanvasSize - $targetHeight, [Math]::Max(0, $baseDestY + $offsetY))
    $graphics.DrawImage($signBitmap, $destX, $destY, $targetWidth, $targetHeight)
  }
  finally {
    $graphics.Dispose()
    $signBitmap.Dispose()
  }

  return $canvas
}

function New-Gradient-Background {
  param(
    [System.Drawing.Bitmap]$ColorMaster,
    [int]$Size
  )

  $topLeft = $ColorMaster.GetPixel(0, 0)
  $topRight = $ColorMaster.GetPixel($ColorMaster.Width - 1, 0)
  $bottomLeft = $ColorMaster.GetPixel(0, $ColorMaster.Height - 1)
  $bottomRight = $ColorMaster.GetPixel($ColorMaster.Width - 1, $ColorMaster.Height - 1)

  $bitmap = New-Bitmap -Width $Size -Height $Size

  for ($y = 0; $y -lt $Size; $y++) {
    $ty = if ($Size -le 1) { 0.0 } else { $y / ($Size - 1.0) }
    for ($x = 0; $x -lt $Size; $x++) {
      $tx = if ($Size -le 1) { 0.0 } else { $x / ($Size - 1.0) }

      $topR = $topLeft.R + ($topRight.R - $topLeft.R) * $tx
      $topG = $topLeft.G + ($topRight.G - $topLeft.G) * $tx
      $topB = $topLeft.B + ($topRight.B - $topLeft.B) * $tx

      $bottomR = $bottomLeft.R + ($bottomRight.R - $bottomLeft.R) * $tx
      $bottomG = $bottomLeft.G + ($bottomRight.G - $bottomLeft.G) * $tx
      $bottomB = $bottomLeft.B + ($bottomRight.B - $bottomLeft.B) * $tx

      $red = [int][Math]::Round($topR + ($bottomR - $topR) * $ty)
      $green = [int][Math]::Round($topG + ($bottomG - $topG) * $ty)
      $blue = [int][Math]::Round($topB + ($bottomB - $topB) * $ty)

      $bitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $red, $green, $blue))
    }
  }

  return $bitmap
}

$colorMaster = [System.Drawing.Bitmap]::new($colorMasterPath)
$monoMaster = [System.Drawing.Bitmap]::new($monoMasterPath)

try {
  $bounds = Get-Sign-Bounds -Bitmap $monoMaster -Threshold $whiteThreshold

  $legacyBackground = New-Gradient-Background -ColorMaster $colorMaster -Size 1024
  $legacyForeground = New-Sign-Layer -MonoMaster $monoMaster -Bounds $bounds -CanvasSize 1024 -SafeZoneRatio $safeZoneRatio -VerticalOffsetRatio $verticalOffsetRatio -Threshold $whiteThreshold
  $legacyIcon = Merge-Layers -Background $legacyBackground -Foreground $legacyForeground

  $favicon = Resize-Image -Source $legacyIcon -Width 48 -Height 48
  $iconColor512 = Resize-Image -Source $legacyIcon -Width 512 -Height 512
  $splash = Resize-Image -Source $colorMaster -Width 1024 -Height 1024
  $androidBackground = New-Gradient-Background -ColorMaster $colorMaster -Size 512
  $androidForeground = New-Sign-Layer -MonoMaster $monoMaster -Bounds $bounds -CanvasSize 512 -SafeZoneRatio $safeZoneRatio -VerticalOffsetRatio $verticalOffsetRatio -Threshold $whiteThreshold
  $adaptiveMonochrome = New-Sign-Layer -MonoMaster $monoMaster -Bounds $bounds -CanvasSize 512 -SafeZoneRatio $safeZoneRatio -VerticalOffsetRatio $verticalOffsetRatio -Threshold $whiteThreshold
  $notificationMonochrome = New-Sign-Layer -MonoMaster $monoMaster -Bounds $bounds -CanvasSize 432 -SafeZoneRatio $safeZoneRatio -VerticalOffsetRatio $verticalOffsetRatio -Threshold $whiteThreshold

  try {
    Save-Png -Bitmap $legacyIcon -Path (Join-Path $imagesDir 'icon.png')
    Save-Png -Bitmap $favicon -Path (Join-Path $imagesDir 'favicon.png')
    Save-Png -Bitmap $iconColor512 -Path (Join-Path $imagesDir 'icon-color-512.png')
    Save-Png -Bitmap $splash -Path (Join-Path $imagesDir 'splash-icon.png')
    Save-Png -Bitmap $androidBackground -Path (Join-Path $imagesDir 'android-icon-background.png')
    Save-Png -Bitmap $androidForeground -Path (Join-Path $imagesDir 'android-icon-foreground.png')
    Save-Png -Bitmap $adaptiveMonochrome -Path (Join-Path $imagesDir 'icon-monochrome-512.png')
    Save-Png -Bitmap $notificationMonochrome -Path (Join-Path $imagesDir 'android-icon-monochrome.png')
  }
  finally {
    $legacyBackground.Dispose()
    $legacyForeground.Dispose()
    $legacyIcon.Dispose()
    $favicon.Dispose()
    $iconColor512.Dispose()
    $splash.Dispose()
    $androidBackground.Dispose()
    $androidForeground.Dispose()
    $adaptiveMonochrome.Dispose()
    $notificationMonochrome.Dispose()
  }
}
finally {
  $colorMaster.Dispose()
  $monoMaster.Dispose()
}
