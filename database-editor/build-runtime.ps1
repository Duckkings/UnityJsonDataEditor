param(
  [string]$Entry = "src/main.js",
  [string]$OutFile = "script.js"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$indexPath = Join-Path (Split-Path -Parent $repoRoot) "index.html"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

Push-Location $repoRoot
try {
  npx esbuild $Entry --bundle --format=iife --charset=utf8 --outfile=$OutFile
  $outputPath = Join-Path $repoRoot $OutFile
  if (Select-String -Path $outputPath -SimpleMatch -Pattern 'return $""{TrimForLog(text)}"";' -Quiet) {
    throw "Bundle validation failed: detected broken C# string escaping in generated runtime output."
  }
  if (Test-Path $indexPath) {
    $version = Get-Date -Format "yyyyMMddHHmmss"
    $indexContent = [System.IO.File]::ReadAllText($indexPath, $utf8NoBom)
    $indexContent = [System.Text.RegularExpressions.Regex]::Replace(
      $indexContent,
      '\./database-editor/script\.js(\?v=[^"]*)?',
      "./database-editor/script.js?v=$version"
    )
    [System.IO.File]::WriteAllText($indexPath, $indexContent, $utf8NoBom)
  }
} finally {
  Pop-Location
}
