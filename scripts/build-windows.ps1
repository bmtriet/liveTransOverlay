$ErrorActionPreference = "Stop"

function Require-Command {
    param([string]$Name, [string]$Help)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name was not found. $Help"
    }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Require-Command "node" "Install the Node.js LTS per-user package, then open a new terminal."
Require-Command "npm.cmd" "Install the Node.js LTS package, then open a new terminal."
Require-Command "cargo" "Install Rust with rustup for the current user, then open a new terminal."

Write-Host "Installing locked frontend dependencies..."
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE." }

Write-Host "Building the per-user Windows installer..."
npx.cmd tauri build --bundles nsis
if ($LASTEXITCODE -ne 0) { throw "The Windows build failed with exit code $LASTEXITCODE." }

$bundleDirectory = Join-Path $projectRoot "src-tauri\target\release\bundle\nsis"
$installer = Get-ChildItem -Path $bundleDirectory -Filter "*.exe" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $installer) {
    throw "The build completed, but no NSIS installer was found in $bundleDirectory."
}

Write-Host ""
Write-Host "Windows installer ready:"
Write-Host $installer.FullName
Write-Host "It installs for the current user and does not require administrator rights."
