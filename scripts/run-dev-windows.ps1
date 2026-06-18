$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

foreach ($command in @("node", "npm.cmd", "cargo")) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "$command was not found. Follow the Windows developer prerequisites in README.md, then open a new terminal."
    }
}

if (-not (Test-Path (Join-Path $projectRoot "node_modules"))) {
    Write-Host "Installing locked frontend dependencies..."
    npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE." }
}

npm.cmd run tauri dev
if ($LASTEXITCODE -ne 0) { throw "Tauri development mode exited with code $LASTEXITCODE." }
