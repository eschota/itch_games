$ErrorActionPreference = "Stop"

if ($env:ITCH_GAMES_POST_COMMIT_AUTODEPLOY -eq "0") {
  Write-Host "[post-commit-autodeploy] disabled by ITCH_GAMES_POST_COMMIT_AUTODEPLOY=0"
  exit 0
}

$root = (& git rev-parse --show-toplevel).Trim()
Set-Location $root

$branch = (& git rev-parse --abbrev-ref HEAD).Trim()
$commit = (& git rev-parse --short HEAD).Trim()
if ($branch -ne "main") {
  Write-Host "[post-commit-autodeploy] skip: branch '$branch' is not main"
  exit 0
}

$message = (& git log -1 --pretty=%B) -join "`n"
if ($message -match "\[(skip deploy|deploy skip|no deploy)\]") {
  Write-Host "[post-commit-autodeploy] skip: commit message requested no deploy"
  exit 0
}

$lockDir = Join-Path $root ".git/unsoccer-post-commit-autodeploy.lock"
try {
  New-Item -ItemType Directory -Path $lockDir -ErrorAction Stop | Out-Null
} catch {
  Write-Host "[post-commit-autodeploy] skip: another deploy hook is running"
  exit 0
}

$logDir = Join-Path $root ".git/hooks/logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$logFile = Join-Path $logDir "unsoccer-post-commit-autodeploy-$commit-$stamp.log"

function Write-Log {
  param([string] $Message)
  Write-Host $Message
  Add-Content -LiteralPath $logFile -Value $Message -Encoding UTF8
}

function Invoke-Logged {
  param(
    [string] $Label,
    [scriptblock] $Command
  )
  Write-Log "[post-commit-autodeploy] $Label"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & $Command *>&1 | ForEach-Object {
      $line = Out-String -InputObject $_
      $line = $line.TrimEnd()
      if ($line) {
        Write-Host $line
        Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
      }
    }
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($exitCode -ne 0) {
    throw "$Label failed with exit $exitCode"
  }
}

function Get-CommittedText {
  param([string] $Path)
  try {
    return ((& git show "HEAD:$Path") -join "`n")
  } catch {
    return ""
  }
}

function Test-CommittedUnsoccerDistReady {
  param(
    [string] $ExpectedVersion,
    [string] $ExpectedWeight
  )
  $html = Get-CommittedText "unsoccer/client/dist/index.html"
  $server = Get-CommittedText "unsoccer/server/dist/index.js"
  $shared = Get-CommittedText "unsoccer/shared/dist/index.js"
  if (-not $html -or -not $server -or -not $shared) {
    return $false
  }
  return $html.Contains($ExpectedVersion) -and $html.Contains($ExpectedWeight) -and $server.Contains("GAME_VERSION") -and $shared.Contains($ExpectedVersion)
}

try {
  Write-Log "[post-commit-autodeploy] commit=$commit branch=$branch"
  Write-Log "[post-commit-autodeploy] log=$logFile"

  $packageJson = Get-CommittedText "package.json"
  if (-not $packageJson) { throw "committed package.json not found" }
  $expectedVersion = (($packageJson | ConvertFrom-Json).games.unsoccer.version).Trim()
  $clientSource = Get-CommittedText "unsoccer/client/src/main.ts"
  $expectedWeight = if ($clientSource -match 'BUILD_WEIGHT_LABEL\s*=\s*["'']([^"'']+)["'']') { $Matches[1] } else { "" }
  if (-not $expectedWeight) { throw "BUILD_WEIGHT_LABEL not found in committed unsoccer/client/src/main.ts" }
  Write-Log "[post-commit-autodeploy] expected UnSoccer version=$expectedVersion"
  Write-Log "[post-commit-autodeploy] expected UnSoccer weight=$expectedWeight"

  $dirty = @(& git status --porcelain --untracked-files=no)
  $allowedGenerated = "^( M| D|M |D |MM|MD|AM|AD|A |R |C ) (unsoccer/(client|server|shared)/dist/|dist/)"
  $dirtyBlockers = @($dirty | Where-Object { $_ -and ($_ -notmatch $allowedGenerated) })
  $skipLocalGate = $false
  if ($dirtyBlockers.Count -gt 0) {
    Write-Log "[post-commit-autodeploy] tracked non-generated files are dirty after commit"
    foreach ($line in $dirtyBlockers) {
      Write-Log $line
    }
    if (Test-CommittedUnsoccerDistReady -ExpectedVersion $expectedVersion -ExpectedWeight $expectedWeight) {
      Write-Log "[post-commit-autodeploy] committed UnSoccer dist is ready; skipping dirty working-tree gate and pushing fast-release artifact"
      $skipLocalGate = $true
    } else {
      Write-Log "[post-commit-autodeploy] abort: dist is not ready, so dirty working-tree validation would be unsafe"
      Write-Log "[post-commit-autodeploy] commit stayed local; push manually after cleaning or committing the remaining files"
      exit 1
    }
  }

  if (-not $skipLocalGate) {
    Invoke-Logged "running acceptance gate" { cmd.exe /d /s /c "npm run test:unsoccer:acceptance 2>&1" }
    Invoke-Logged "packaging itch artifact" { cmd.exe /d /s /c "npm run package:unsoccer 2>&1" }
  }
  Invoke-Logged "pushing main to origin; GitHub webhook will trigger production autodeploy" { cmd.exe /d /s /c "git push origin HEAD:main 2>&1" }

  $waitSeconds = 45
  if ($env:ITCH_GAMES_POST_COMMIT_WAIT_SECONDS) {
    $waitSeconds = [Math]::Max(0, [int]$env:ITCH_GAMES_POST_COMMIT_WAIT_SECONDS)
  }
  $deadline = (Get-Date).AddSeconds($waitSeconds)
  $healthUrl = "https://io-games.mecharulez.com/ai_chat/api/deploy-health"
  Write-Log "[post-commit-autodeploy] waiting up to ${waitSeconds}s for production health at $healthUrl"

  while ((Get-Date) -lt $deadline) {
    $healthRaw = ""
    try {
      $healthRaw = (& curl.exe -fsS $healthUrl) -join "`n"
    } catch {
      $healthRaw = ""
    }

    if ($healthRaw) {
      try {
        $health = $healthRaw | ConvertFrom-Json
        $remoteCommit = [string]$health.git.commit
        $remoteVersion = [string]$health.project_version
        $publicApiVersion = [string]$health.unsoccer.public_api_health.json.version
        $ready = [bool]$health.ready
        $running = [bool]$health.deploy_running
        Write-Log "[post-commit-autodeploy] health commit=$remoteCommit version=$remoteVersion public_api=$publicApiVersion ready=$ready running=$running"
        if ($remoteCommit -eq $commit -and $remoteVersion -eq $expectedVersion -and $publicApiVersion -eq $expectedVersion -and $ready) {
          Write-Log "[post-commit-autodeploy] production ready for $expectedVersion at commit $commit"
          exit 0
        }
      } catch {
        Write-Log "[post-commit-autodeploy] deploy-health parse failed: $($_.Exception.Message)"
      }
    } else {
      Write-Log "[post-commit-autodeploy] deploy-health unavailable"
    }
    Start-Sleep -Seconds 10
  }

  Write-Log "[post-commit-autodeploy] warning: production did not become ready before timeout"
  Write-Log "[post-commit-autodeploy] check $healthUrl and /ai_chat deploy messages"
  exit 1
} finally {
  Remove-Item -LiteralPath $lockDir -Force -ErrorAction SilentlyContinue
}
