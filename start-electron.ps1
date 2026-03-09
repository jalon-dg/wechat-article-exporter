$ErrorActionPreference = "Stop"
$projectPath = $PSScriptRoot
$electronPath = Join-Path $projectPath "node_modules\.bin\electron.cmd"

Write-Host "Project path: $projectPath"
Write-Host "Electron path: $electronPath"

Set-Location $projectPath

# Start Electron
& $electronPath .