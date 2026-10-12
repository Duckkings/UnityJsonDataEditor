param([string]$ProjectRoot = 'C:/Project/PASgodot')
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$assetRoot = Join-Path $repoRoot 'Runtime/GodotProject'
$paths = @(
  'EventBusTickRunner/Shared/GameFrameworkRuntime.cs',
  'EventBusTickRunner/Shared/GameFrameworkValueEvents.cs',
  'EventBusTickRunner/Shared/TypedSnapshotRegion.cs',
  'EventBusTickRunner/Shared/SnapshotValueExtensions.cs',
  'EventBusTickRunner/Shared/FixedValueQueue.cs',
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
  $content = [IO.File]::ReadAllText($source)
  # The generic bootstrap must not depend on PAS actors, ECS scheduling or localization.
  if ($path -eq 'EventBusTickRunner/Godot/GodotObjectRootNode.cs') {
    $content = [regex]::Replace($content, '(?m)^.*(?:_crowdGraphVersion|private NonMechEcsRuntime|public bool IsCombatEcsScheduled|internal void AdvanceEcsDomain|_combatEcs\?\.UnregisterDomain|if\(owner is Actor|if\(ResolveContextRoot\(\) is Actor|for\(Node owner=ResolveContextRoot).*(?:\r?\n|$)', '')
    $content = $content.Replace('_combatEcs==null&&', '').Replace('if (_combatEcs == null) TickModules();', 'TickModules();')
  }
  if ($path -eq 'EventBusTickRunner/Godot/GodotEventBusNode.cs') {
    $content = $content.Replace('PasText.Format("text.763f30aa5aea", (ResolveInitializationRootName(resolvedBusOwner)))', '$"[EventBus] Initialized under {ResolveInitializationRootName(resolvedBusOwner)}"')
  }
  if ($content -match '\b(?:PasText|NonMechEcsRuntime|CombatTrialTargetModule|ActorAttributeModule)\b|_combatEcs|_crowdGraphVersion') {
    throw "Project-specific dependency remains in $path; review the generic adapter before syncing."
  }
  [IO.File]::WriteAllText($target, $content, [Text.UTF8Encoding]::new($false))
  [ordered]@{ path = $path; source = "scripts/$path"; sha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() }
}
$manifest = [ordered]@{ sourceProject = [IO.Path]::GetFullPath($ProjectRoot); syncedAt = [DateTimeOffset]::Now.ToString('o'); files = @($entries) }
[IO.File]::WriteAllText((Join-Path $assetRoot 'manifest.json'), ($manifest | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
& (Join-Path $PSScriptRoot 'build-runtime.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Runtime bundle build failed' }
