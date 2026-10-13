param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$statePath = Join-Path $PSScriptRoot 'state.json'
$logs = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$log = Join-Path $logs ((Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
$lock = $null
try {
  $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  if ($state.finished -eq $true) { 'Finished. No resume started.' | Out-File -LiteralPath $log; exit 0 }
  $lock = [System.IO.File]::Open((Join-Path $PSScriptRoot '.resume.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
  Push-Location $repo
  try {
    $branch = (& git branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0 -or $branch -ne 'stress-test/competition') { throw 'Wrong branch. This helper never switches or stashes another checkout automatically.' }
    $origin = (& git remote get-url origin).Trim()
    if ($origin -ne 'https://github.com/leo777-debug/OPHANIM-V3.git') { throw 'Unexpected repository remote.' }
    $prompt = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'RESUME_PROMPT.txt') -Raw
    if ($CheckOnly) { "Ready: phase $($state.current_phase), task $($state.current_task). No Codex invocation." | Out-File -LiteralPath $log; exit 0 }
    $codex = (Get-Command codex -ErrorAction Stop).Source
    # Do not load a full-access user profile, rules or hooks for unattended work.
    & $codex exec --ignore-user-config --sandbox workspace-write --color never --cd $repo $prompt *> $log
    $code = $LASTEXITCODE
    if ($code -ne 0) { "Codex exited $code. No automatic retry or permission escalation." | Out-File -LiteralPath $log -Append }
    exit $code
  } finally { Pop-Location }
} catch {
  "Resume not started or failed: $($_.Exception.Message)" | Out-File -LiteralPath $log -Append
  exit 1
} finally { if ($lock) { $lock.Dispose() } }
