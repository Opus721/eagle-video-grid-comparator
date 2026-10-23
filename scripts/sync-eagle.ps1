param(
    [string]$Destination
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($Destination)) {
    $Destination = Join-Path (Split-Path -Parent $repoRoot) "dist\Video Grid Comparator"
}
$targetRoot = [System.IO.Path]::GetFullPath($Destination)
$runtimeJson = node --input-type=module -e "import('./scripts/runtime-files.mjs').then((module) => console.log(JSON.stringify(module.runtimeFiles)))"
$runtimeFiles = $runtimeJson | ConvertFrom-Json

if (-not (Test-Path -LiteralPath $targetRoot)) {
    New-Item -ItemType Directory -Path $targetRoot | Out-Null
}

foreach ($relativePath in $runtimeFiles) {
    $sourcePath = Join-Path $repoRoot $relativePath
    $targetPath = Join-Path $targetRoot $relativePath
    $targetDirectory = Split-Path -Parent $targetPath

    if (-not (Test-Path -LiteralPath $targetDirectory)) {
        New-Item -ItemType Directory -Path $targetDirectory | Out-Null
    }

    Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
    Write-Output "synced`t$relativePath"
}

Write-Output "target`t$targetRoot"
