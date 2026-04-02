param(
  [string]$Entry = "src/main.js",
  [string]$OutFile = "script.js"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Push-Location $repoRoot
try {
  npx esbuild $Entry --bundle --format=iife --charset=utf8 --outfile=$OutFile
} finally {
  Pop-Location
}
