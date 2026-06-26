$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendRoot = Join-Path $projectRoot "frontend"
$distIndex = Join-Path $frontendRoot "dist\index.html"
$venvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $distIndex)) {
    Push-Location $frontendRoot
    try {
        npm.cmd run build
    }
    finally {
        Pop-Location
    }
}

$python = if (Test-Path -LiteralPath $venvPython) { $venvPython } else { "python" }
& $python (Join-Path $projectRoot "app_flask.py")
