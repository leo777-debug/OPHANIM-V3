param(
  [Parameter(Mandatory=$true)][ValidateSet('download_base_models','download_from_kaggle','build_model','list_models','remove_model','verify_models','smoke','benchmark')][string]$Action,
  [Parameter(ValueFromRemainingArguments=$true)][string[]]$ToolArgs
)
$ErrorActionPreference = 'Stop'
if (-not $env:OPHANIM_MODELS_DIR) {
  foreach ($taskEnvName in @('.env','.env.local')) {
    $taskEnvPath = Join-Path (Split-Path (Split-Path $PSScriptRoot)) $taskEnvName
    if (Test-Path -LiteralPath $taskEnvPath) {
      foreach ($taskLine in Get-Content -LiteralPath $taskEnvPath) {
        if ($taskLine -match '^\s*OPHANIM_MODELS_DIR\s*=\s*(.*?)\s*$') {
          $env:OPHANIM_MODELS_DIR = $Matches[1].Trim('"',"'")
        }
      }
    }
  }
  if (-not $env:OPHANIM_MODELS_DIR) { $env:OPHANIM_MODELS_DIR = 'D:\models' }
}
$taskDrive = [System.IO.Path]::GetPathRoot($env:OPHANIM_MODELS_DIR)
if (-not (Test-Path -LiteralPath $taskDrive)) { throw "Model drive not found at $env:OPHANIM_MODELS_DIR" }
$env:HF_HOME = Join-Path $env:OPHANIM_MODELS_DIR 'hf-cache'
$env:OLLAMA_MODELS = Join-Path $env:OPHANIM_MODELS_DIR 'ollama'
$taskPython = if ($env:OPHANIM_PYTHON) { $env:OPHANIM_PYTHON } else { 'python' }
$taskScript = switch ($Action) {
  'download_base_models' { 'download_base_models.py' }
  'download_from_kaggle' { 'download_from_kaggle.py' }
  'build_model' { 'build_model.py' }
  'list_models' { $ToolArgs = @('list') + $ToolArgs; 'manage_models.py' }
  'remove_model' { $ToolArgs = @('remove') + $ToolArgs; 'manage_models.py' }
  'verify_models' { $ToolArgs = @('verify') + $ToolArgs; 'manage_models.py' }
  'smoke' { $ToolArgs = @('--smoke','--version',('smoke-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))) + $ToolArgs; 'train.py' }
  'benchmark' { 'benchmark.py' }
}
& $taskPython (Join-Path $PSScriptRoot $taskScript) @ToolArgs
if ($LASTEXITCODE -ne 0) { throw "Model tool failed ($LASTEXITCODE)." }
