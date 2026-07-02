param(
  [string] $Target = $env:ITCH_IO_TARGET,
  [switch] $SkipBuild,
  [switch] $NoInstallButler
)

$ErrorActionPreference = "Stop"

$root = (& git rev-parse --show-toplevel).Trim()
Set-Location $root

function Write-Step {
  param([string] $Message)
  Write-Host "[publish-unsoccer-itch] $Message"
}

function Resolve-Butler {
  if ($env:BUTLER_PATH -and (Test-Path -LiteralPath $env:BUTLER_PATH)) {
    return (Resolve-Path -LiteralPath $env:BUTLER_PATH).Path
  }

  $command = Get-Command butler -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $localRoot = Join-Path $env:LOCALAPPDATA "itch-games\butler"
  $localExe = Join-Path $localRoot "butler.exe"
  if (Test-Path -LiteralPath $localExe) {
    return $localExe
  }

  if ($NoInstallButler -or $env:ITCH_IO_INSTALL_BUTLER -eq "0") {
    throw "butler is not installed; install it or set BUTLER_PATH"
  }

  Write-Step "downloading official butler for Windows x64"
  New-Item -ItemType Directory -Path $localRoot -Force | Out-Null
  $zipPath = Join-Path $localRoot "butler-windows-amd64.zip"
  $extractPath = Join-Path $localRoot "extract"
  if (Test-Path -LiteralPath $extractPath) {
    Remove-Item -LiteralPath $extractPath -Recurse -Force
  }
  Invoke-WebRequest -Uri "https://broth.itch.zone/butler/windows-amd64/LATEST/archive/default" -OutFile $zipPath
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractPath -Force
  $downloaded = Get-ChildItem -Path $extractPath -Recurse -Filter "butler.exe" | Select-Object -First 1
  if (-not $downloaded) {
    throw "downloaded butler archive did not contain butler.exe"
  }
  Copy-Item -LiteralPath $downloaded.FullName -Destination $localExe -Force
  return $localExe
}

function Test-ZipEntry {
  param(
    [string] $ZipPath,
    [string] $ExpectedVersion
  )
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    $names = @($zip.Entries | ForEach-Object { $_.FullName })
    if ($names -notcontains "index.html") {
      throw "index.html is missing from zip root"
    }
    $blocked = @($names | Where-Object {
      $lower = $_.ToLowerInvariant()
      $lower.EndsWith(".md") -or
        $lower.Contains("skill") -or
        $lower.Contains("agent") -or
        $lower.Contains("deploy") -or
        $lower.Contains(".git")
    })
    if ($blocked.Count -gt 0) {
      throw "internal files leaked into itch zip: $($blocked -join ', ')"
    }
    $index = $zip.GetEntry("index.html")
    $reader = New-Object System.IO.StreamReader($index.Open())
    try {
      $html = $reader.ReadToEnd()
    } finally {
      $reader.Dispose()
    }
    if (-not $html.Contains($ExpectedVersion)) {
      throw "zip index.html does not contain expected version $ExpectedVersion"
    }
  } finally {
    $zip.Dispose()
  }
}

if (-not $Target) {
  throw "ITCH_IO_TARGET is required, for example owner/ragdoll-soccer-ii:html5"
}
if ($Target -notmatch "^[a-z0-9_-]+/[a-z0-9_-]+:[a-z0-9_-]+$") {
  throw "ITCH_IO_TARGET must look like owner/game:channel, got '$Target'"
}

$version = ((Get-Content -Raw -LiteralPath (Join-Path $root "package.json") | ConvertFrom-Json).games.unsoccer.version).Trim()
if (-not $version) {
  throw "package.json games.unsoccer.version is empty"
}

if (-not $SkipBuild) {
  Write-Step "building and packaging UnSoccer $version"
  cmd.exe /d /s /c "npm run package:unsoccer"
  if ($LASTEXITCODE -ne 0) {
    throw "npm run package:unsoccer failed with exit $LASTEXITCODE"
  }
}

$zipPath = Join-Path $root "dist\unsoccer-itch.zip"
if (-not (Test-Path -LiteralPath $zipPath)) {
  throw "missing $zipPath; run npm run package:unsoccer"
}

Test-ZipEntry -ZipPath $zipPath -ExpectedVersion $version
$butler = Resolve-Butler

Write-Step "butler: $butler"
Write-Step "target: $Target"
Write-Step "version: $version"
& $butler push $zipPath $Target --userversion $version --if-changed
if ($LASTEXITCODE -ne 0) {
  throw "butler push failed with exit $LASTEXITCODE"
}
Write-Step "published $zipPath to $Target as $version"
