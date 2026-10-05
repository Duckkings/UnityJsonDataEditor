import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { buildGodotRuntimeFiles, buildGodotGameRootSceneContent, buildGodotObjectBaseSceneContent, buildModuleDeclareTemplate, buildSystemModuleDeclareTemplate, buildSystemEventTemplate, buildSystemEventTagTemplate, buildEventBusInitFilterTemplate } from '../src/generators/godot-project-bootstrap-generator.js';
import { buildGodotRuntimeLoaderContent, buildGodotRuntimeTesterContent, buildModelStructContent, createCSharpRuntimeGeneratorModule } from '../src/generators/csharp-runtime-generator.js';
import { buildGodotCSharpProjectContent } from '../src/generators/godot-project-config.js';

const root = resolve('.validation/godot-bootstrap');
async function put(path, content) { const file = resolve(root, path); await mkdir(dirname(file), { recursive: true }); await writeFile(file, content); }
for (const f of buildGodotRuntimeFiles()) await put(`scripts/${f.relativePath}`, f.content);
await put('scripts/godotCsharpDate/modelstruct/modelCsharpe.cs', buildModelStructContent({ godot: true }));
await put('scripts/godotCsharpDate/modelstruct/DataEntityRuntimeLoader.cs', buildGodotRuntimeLoaderContent());
await put('scripts/godotCsharpDate/DataEntityRuntimeTester.cs', buildGodotRuntimeTesterContent());
const tables = [buildModuleDeclareTemplate(), buildSystemModuleDeclareTemplate(), buildSystemEventTemplate(), buildSystemEventTagTemplate(), buildEventBusInitFilterTemplate()];
const generator = createCSharpRuntimeGeneratorModule({ appState: {} });
for (const t of tables) { await put(`dataEntity/${t.name}.json`, JSON.stringify(t)); await put(`scripts/godotCsharpDate/${t.name}.cs`, generator.generateCSContent(t)); }
await put('dataEntity/manifest.json', JSON.stringify(tables.map(t => ({ template: t.name, path: `${t.name}.json` }))));
await put('prefab/GameRoot.tscn', buildGodotGameRootSceneContent());
await put('prefab/ObjectBase.tscn', buildGodotObjectBaseSceneContent());
await put('BootstrapValidation.csproj', buildGodotCSharpProjectContent());
await put('project.godot', `[application]\nconfig/name="BootstrapValidation"\nrun/main_scene="res://Smoke.tscn"\n[dotnet]\nproject/assembly_name="BootstrapValidation"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n`);
await put('Smoke.tscn', `[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://Smoke.cs" id="1"]\n[node name="Smoke" type="Node"]\nscript = ExtResource("1")\n`);
await put('Probe.cs', `using GameFramework;
using GameFramework.Adapters.Godot;
public partial class Probe : GodotObjectModuleBase, IRequireObjectSnapshotRegion, IObjectSnapshotRegionNameProvider, IObjectSnapshotSync {
  public bool Initialized; public bool Stopped; private IObjectSnapshotRegion region;
  public string GetObjectSnapshotRegionName() => "probe_region";
  public void BindObjectSnapshot(IObjectSnapshotSystem system, IObjectSnapshotRegion value) { region = value; }
  public override void Init(IObjectRuntime root, IEventBus local, IEventBus global) { if (region == null) throw new System.Exception("snapshot not bound before Init"); Initialized = true; }
  public override void Shutdown() { Stopped = true; }
  public void SyncObjectSnapshot(IObjectSnapshotRegion value) { value.Set("alive", true); }
}`);
await put('Smoke.cs', `using System;
using GameFramework;
using GameFramework.Adapters.Godot;
using Godot;
public partial class Smoke : Node {
  private static void Check(bool ok, string message) { if (!ok) throw new Exception(message); }
  public override void _Ready() { Callable.From(Run).CallDeferred(); }
  private void Run() {
    try {
      var game = GD.Load<PackedScene>("res://prefab/GameRoot.tscn").Instantiate<Node>(); AddChild(game);
      var runner = (GodotRootTickRunnerNode)game;
      runner._Process(0.016);
      Check(runner.GetService<IUiSystem>("uisystem") != null, "UI service not initialized");
      var context = GD.Load<PackedScene>("res://prefab/ObjectBase.tscn").Instantiate<Node>();
      var probe = new Probe { Name = "Probe" }; context.AddChild(probe); AddChild(context);
      var domain = context.GetNode<GodotObjectRootNode>("ObjectRoot"); domain.InitializeObjectDomain();
      Check(domain.IsInitialized && probe.Initialized, "object domain not initialized");
      domain._Process(0.016);
      Check(domain.GetObjectSnapshotSystem().TryGetRegion("probe_region", out var region), "snapshot name contract missing");
      Check(region.TryGet("alive", out var alive) && alive is true, "snapshot sync failed");
      var replacement = new Probe { Name = "Replacement" }; context.AddChild(replacement);
      domain.ReplaceDynamicModules(new Node[] { probe }, new Node[] { replacement });
      Check(probe.Stopped && replacement.Initialized, "dynamic replacement lifecycle failed");
      context.RemoveChild(probe); probe.Free();
      context.Free(); Check(replacement.Stopped, "object shutdown missing");
      game.Free(); Check(GodotRootTickRunnerNode.Instance == null, "root instance leaked after shutdown");
      GD.Print("BOOTSTRAP_SMOKE_OK"); GetTree().Quit(0);
    } catch (Exception error) { GD.PushError(error.ToString()); GetTree().Quit(1); }
  }
}`);
console.log(root);
