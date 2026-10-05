param([string]$ProjectRoot = 'C:/Project/PASgodot')
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$assetRoot = Join-Path $repoRoot 'Runtime/GodotProject'
$paths = @(
  'EventBusTickRunner/Shared/GameFrameworkRuntime.cs',
  'EventBusTickRunner/Godot/GodotRuntimeSupport.cs',
  'EventBusTickRunner/Godot/GodotEventBusNode.cs',
  'EventBusTickRunner/Godot/GodotObjectModuleBase.cs',
  'EventBusTickRunner/Godot/GodotObjectSnapshotSystemNode.cs',
  'EventBusTickRunner/Godot/GodotObjectRootNode.cs',
  'EventBusTickRunner/Godot/GodotRootTickRunnerNode.cs',
  'EventBusTickRunner/Godot/DataTableProvider.cs',
  'ui/UiSystemTypes.cs',
  'ui/UiSystemModule.cs',
  'godotCsharpDate/modelstruct/modelCsharpe.cs',
  'godotCsharpDate/modelstruct/DataEntityRuntimeLoader.cs',
  'godotCsharpDate/modelstruct/DataEntityRuntimeLoaderGuide.txt',
  'godotCsharpDate/DataEntityRuntimeTester.cs',
  'godotCsharpDate/modelstruct/DataEntityRuntimeTesterGuide.txt',
  'godotCsharpDate/TickRunnerEventBusApiGuide.md'
)
# Validate the entire input set before changing the tool's snapshot.
foreach ($path in $paths) {
  if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "scripts/$path") -PathType Leaf)) {
    throw "Missing project source: scripts/$path"
  }
}
$entries = foreach ($path in $paths) {
  $source = Join-Path $ProjectRoot "scripts/$path"
  $target = Join-Path $assetRoot $path
  [IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
  [IO.File]::Copy($source, $target, $true)
  [ordered]@{ path = $path; source = "scripts/$path"; sha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() }
}
$manifest = [ordered]@{ sourceProject = [IO.Path]::GetFullPath($ProjectRoot); syncedAt = [DateTimeOffset]::Now.ToString('o'); files = @($entries) }
[IO.File]::WriteAllText((Join-Path $assetRoot 'manifest.json'), ($manifest | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
& (Join-Path $PSScriptRoot 'build-runtime.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Runtime bundle build failed' }
