import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { godotProjectAssets } from '../src/generators/godot-project-assets.js';
import { buildGodotRuntimeFiles, buildGodotGameRootSceneContent, buildGodotObjectBaseSceneContent, buildModuleDeclareTemplate, buildSystemModuleDeclareTemplate } from '../src/generators/godot-project-bootstrap-generator.js';
import { buildGodotRuntimeLoaderContent, buildGodotRuntimeTesterContent, buildModelStructContent } from '../src/generators/csharp-runtime-generator.js';
import { buildGodotCSharpProjectContent, ensureGodotCSharpDependencies } from '../src/generators/godot-project-config.js';

test('every bundled asset matches its canonical project snapshot and hash', async () => {
  const root = new URL('../../Runtime/GodotProject/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(Object.keys(godotProjectAssets).length, manifest.files.length);
  for (const f of manifest.files) {
    const source = await readFile(new URL(f.path, root));
    assert.equal(createHash('sha256').update(source).digest('hex'), f.sha256, f.path);
    assert.equal(godotProjectAssets[f.path], source.toString('utf8'), f.path);
  }
});

test('Godot save and quick-init emit the current loader, model and complete framework', () => {
  assert.equal(buildGodotRuntimeLoaderContent(), godotProjectAssets['godotCsharpDate/modelstruct/DataEntityRuntimeLoader.cs']);
  assert.equal(buildModelStructContent({ godot: true }), godotProjectAssets['godotCsharpDate/modelstruct/modelCsharpe.cs']);
  assert.equal(buildGodotRuntimeTesterContent(), godotProjectAssets['godotCsharpDate/DataEntityRuntimeTester.cs']);
  for (const file of buildGodotRuntimeFiles()) assert.equal(file.content, godotProjectAssets[file.relativePath], file.relativePath);
  const names = buildGodotRuntimeFiles().map(f => f.relativePath);
  assert.ok(names.includes('ui/UiSystemTypes.cs')); assert.ok(names.includes('ui/UiSystemModule.cs'));
  assert.equal(new Set(names).size, names.length);
});

test('new declarations expose current UI fields and register the UI service module', () => {
  for (const table of [buildModuleDeclareTemplate(), buildSystemModuleDeclareTemplate()]) {
    assert.equal(table.parameters.find(p => p.name === 'uiPrefabPath').type, 'string');
    assert.equal(table.parameters.find(p => p.name === 'uiPriority').type, 'int');
    for (const inst of table.instances) assert.equal(inst.payload.uiPrefabPath, '');
  }
  assert.ok(buildSystemModuleDeclareTemplate().instances.some(i => i.payload.moduleKey === 'UiSystemModule'));
});

test('new scenes support scripts/Script roots and do not depend on PAS business modules', () => {
  for (const name of ['scripts', 'Script']) {
    const root = buildGodotGameRootSceneContent({ scriptOutputRootName: name });
    const object = buildGodotObjectBaseSceneContent({ scriptOutputRootName: name });
    assert.ok(root.includes(`res://${name}/ui/UiSystemModule.cs`));
    assert.ok(object.includes(`res://${name}/EventBusTickRunner/Godot/GodotObjectRootNode.cs`));
    assert.ok(!/actor\/|weapon\/|collision\/|player_/.test(root + object));
  }
});

test('project dependencies preserve custom settings and are idempotent', () => {
  const original = `<Project Sdk="Godot.NET.Sdk/4.5"><PropertyGroup><TargetFramework>net9.0</TargetFramework></PropertyGroup><!--custom--></Project>`;
  const updated = ensureGodotCSharpDependencies(original);
  assert.ok(updated.includes('Sdk="Godot.NET.Sdk/4.5"'));
  assert.ok(updated.includes('<TargetFramework>net9.0</TargetFramework>'));
  assert.ok(updated.includes('<!--custom-->')); assert.ok(updated.includes('Newtonsoft.Json'));
  assert.ok(updated.includes('<EnableDynamicLoading>true</EnableDynamicLoading>'));
  assert.equal(ensureGodotCSharpDependencies(updated), updated);
  assert.equal(ensureGodotCSharpDependencies(buildGodotCSharpProjectContent()), buildGodotCSharpProjectContent());
  const existing = `<Project><PropertyGroup><EnableDynamicLoading>true</EnableDynamicLoading></PropertyGroup><ItemGroup><PackageReference Include='Newtonsoft.Json' Version='13.0.3' /></ItemGroup></Project>`;
  assert.equal(ensureGodotCSharpDependencies(existing), existing);
  const commented = '<Project><PropertyGroup><EnableDynamicLoading>false</EnableDynamicLoading></PropertyGroup></Project><!--after project-->';
  const fixed = ensureGodotCSharpDependencies(commented);
  assert.ok(fixed.includes('<!--after project-->')); assert.ok(fixed.includes('Newtonsoft.Json'));
  assert.equal(ensureGodotCSharpDependencies(fixed), fixed);
  assert.throws(() => ensureGodotCSharpDependencies('<broken>'), /格式不受支持/);
});
