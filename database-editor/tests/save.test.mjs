import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createTemplatePersistenceModule } from '../src/services/template-persistence.js';
import { collectDuplicateIdInfo, isEnumTemplate } from '../src/domain/index-enum-validation.js';
import { collectListTypeViolations } from '../src/domain/editor-actions.js';
import { getListElementTypeForParam } from '../src/core/form-and-reference.js';
import { createWorkspaceStorageModule } from '../src/services/workspace-storage.js';

const sample = () => ({ name: 'actor', parameters: [{ name: 'health', type: 'int' }], instances: [{ id: 1, name: 'test', payload: { health: 10 } }] });

function harness(mode = 'godot', initial = [sample()]) {
  const files = new Map(initial.map(t => [`${t.name}.json`, JSON.stringify(t)]));
  files.set('manifest.json', '[]');
  const events = [];
  const messages = [];
  const scripts = { kind: 'scripts' };
  const data = {
    async removeEntry(name) {
      if (!files.delete(name)) throw Object.assign(new Error(name), { name: 'NotFoundError' });
    },
    async *values() {
      for (const [name, value] of files) yield { kind: 'file', name, getFile: async () => ({ text: async () => value }) };
    },
  };
  const appState = {
    templates: [], directoryHandle: {}, dataEntityHandle: data, csharpHandle: scripts,
    templateUidState: { counter: 0 }, pendingTemplateDeletions: new Map(), lastSavedStructureSnapshot: new Map(),
  };
  const context = {
    appState, isUnityMode: () => mode === 'unity', isGodotMode: () => mode === 'godot',
    isEnumTemplate, collectDuplicateIdInfo,
    collectListTypeViolations: t => collectListTypeViolations(t, { getListElementTypeForParam }),
    ensureTemplateUid: t => t.__uid ||= `t${++appState.templateUidState.counter}`,
    captureCurrentStructureSnapshot: () => new Map(appState.templates.map(t => [t.__uid, t.name])),
    ensureSubFolders: async options => events.push(['folders', options]),
    resolveScriptOutputRootHandle: async () => ({ getDirectoryHandle: async () => scripts }),
    ensureModelStruct: async () => events.push(['model']),
    cleanConflictingEngineArtifacts: async () => events.push(['cleanup']),
    ensureEngineGenerationConsent: async () => { events.push(['consent']); return true; },
    writeTextFile: async (handle, name, value) => { events.push(['write', handle === data ? 'data' : 'script', name]); if (handle === data) files.set(name, value); },
    readTextFileIfExists: async (handle, name) => handle === data ? (files.get(name) ?? null) : null,
    deleteDataEntityFileIfExists: async name => { events.push(['deleteData', name]); files.delete(name); },
    deleteCSharpFileIfExists: async name => events.push(['deleteScript', name]),
    moveTemplateJsonToTrash: async name => { events.push(['trash', name]); files.delete(`${name}.json`); return { moved: true }; },
    generateCSContent: t => `class ${t.name} {}`,
    generateEnumCSFiles: async () => events.push(['enumGenerator']),
    generateRuntimeLoaderArtifacts: async () => events.push(['loaderGenerator']),
    generateUECppStructuresForCurrentTemplates: async () => { events.push(['ueGenerator']); return {}; },
    showMessage: value => messages.push(value),
  };
  return { files, events, messages, appState, context, create: () => createTemplatePersistenceModule(context) };
}

for (const mode of ['unity', 'godot', 'ue']) {
  test(`${mode}: data-only writes all data and never touches scripts`, async () => {
    const h = harness(mode, [sample(), { name: 'enum', parameters: [], instances: [] }]);
    const mod = h.create(); await mod.loadAllTemplates(); h.events.length = 0;
    h.appState.templates.find(t => t.name === 'actor').instances[0].payload.health = 20;
    await mod.saveAll();
    assert.equal(JSON.parse(h.files.get('actor.json')).instances[0].payload.health, 20);
    assert.ok(h.files.has('enum.json'));
    assert.equal(mod.hasUnsavedTemplateChanges(), false);
    assert.ok(h.events.every(e => ['write', 'folders'].includes(e[0])));
    assert.ok(h.events.filter(e => e[0] === 'folders').every(e => e[1].dataOnly));
    assert.ok(h.events.filter(e => e[0] === 'write').every(e => e[1] === 'data'));
    await mod.saveAll(); assert.match(h.messages.at(-1), /已保存数据/);
  });
}

for (const invalid of ['duplicate', 'list', 'name']) {
  test(`invalid ${invalid}: blocks entire save with zero writes`, async () => {
    const h = harness(); const mod = h.create(); await mod.loadAllTemplates(); h.events.length = 0;
    const t = h.appState.templates[0];
    if (invalid === 'duplicate') t.instances.push(structuredClone(t.instances[0]));
    if (invalid === 'list') { t.parameters = [{ name: 'values', type: 'list', elementType: 'int' }]; t.instances[0].payload.values = ['invalid']; }
    if (invalid === 'name') t.name = 'manifest';
    await mod.saveAll({ refreshScripts: true });
    assert.equal(h.events.length, 0);
    assert.match(h.messages.at(-1), /保存失败/);
  });
}

for (const change of ['edit', 'add', 'delete']) {
  test(`external ${change}: prevents overwriting disk`, async () => {
    const h = harness(); const mod = h.create(); await mod.loadAllTemplates(); h.events.length = 0;
    if (change === 'edit') h.files.set('actor.json', 'external');
    if (change === 'add') h.files.set('new.json', '{}');
    if (change === 'delete') h.files.delete('actor.json');
    const before = [...h.files]; await mod.saveAll({ refreshScripts: true });
    assert.deepEqual([...h.files], before); assert.equal(h.events.length, 0);
    assert.match(h.messages.at(-1), /外部修改/);
  });
}

test('data-only deletion preserves scripts and updates manifest', async () => {
  const h = harness(); const mod = h.create(); await mod.loadAllTemplates(); h.events.length = 0;
  h.appState.templates.length = 0; h.appState.pendingTemplateDeletions.set('actor', {});
  await mod.saveAll(); assert.ok(!h.files.has('actor.json'));
  assert.equal(h.files.get('manifest.json'), '[]'); assert.ok(!h.events.some(e => e[0] === 'deleteScript'));
});

for (const answer of ['2', '3', '1']) {
  test(`C# prompt ${answer}: respects data-only, cancel, or generate`, async () => {
    const h = harness(); const mod = h.create(); await mod.loadAllTemplates(); h.events.length = 0;
    globalThis.prompt = () => answer;
    await mod.saveAll({ refreshScripts: true });
    if (answer === '3') assert.ok(h.events.every(e => ['consent', 'folders'].includes(e[0])));
    if (answer === '2') assert.ok(!h.events.some(e => /Generator|cleanup|model|deleteScript/.test(e[0]) || (e[0] === 'write' && e[1] === 'script')));
    if (answer === '1') { assert.ok(h.events.some(e => e[0] === 'loaderGenerator')); assert.ok(h.events.some(e => e[0] === 'write' && e[1] === 'script')); }
  });
}

test('UE withScripts invokes generation', async () => {
  const h = harness('ue'); const mod = h.create(); await mod.loadAllTemplates();
  await mod.saveAll({ refreshScripts: true }); assert.ok(h.events.some(e => e[0] === 'ueGenerator'));
});

test('invalid loaded JSON blocks saving remaining templates', async () => {
  const h = harness(); h.files.set('broken.json', '{'); const mod = h.create(); await mod.loadAllTemplates(); h.events.length = 0;
  await mod.saveAll(); assert.equal(h.events.length, 0); assert.match(h.messages.at(-1), /异常文件/);
});

test('sheet validation failure aborts before writes', async () => {
  const h = harness(); h.context.commitActiveSheetEdits = () => ({ ok: false }); const mod = h.create();
  await mod.loadAllTemplates(); h.events.length = 0; await mod.saveAll(); assert.equal(h.events.length, 0);
});

test('write failure remains dirty and permits retry', async () => {
  const h = harness(); const original = h.context.writeTextFile; let fail = true;
  h.context.writeTextFile = async (...args) => { if (fail) throw new Error('disk full'); return original(...args); };
  const mod = h.create(); await mod.loadAllTemplates(); h.appState.templates[0].instances[0].payload.health = 25;
  await mod.saveAll(); assert.equal(mod.hasUnsavedTemplateChanges(), true); assert.match(h.messages.at(-1), /disk full/);
  fail = false; await mod.saveAll(); assert.equal(mod.hasUnsavedTemplateChanges(), false);
});

test('simultaneous saves do not overlap', async () => {
  const h = harness(); let release; const gate = new Promise(r => release = r);
  h.context.ensureSubFolders = async () => gate;
  const mod = h.create(); await mod.loadAllTemplates();
  const first = mod.saveAll(); const second = mod.saveAll(); await second;
  assert.match(h.messages.at(-1), /正在保存/); release(); await first;
  assert.equal(h.events.filter(e => e[0] === 'write' && e[2] === 'actor.json').length, 1);
});

test('storage data-only setup creates no script directories; missing write handle fails', async () => {
  const directories = [];
  const root = { getDirectoryHandle: async name => { directories.push(name); return root; } };
  const storage = createWorkspaceStorageModule({ appState: { directoryHandle: root, TRASH_FOLDER_NAME: 'toilet' } });
  await storage.ensureSubFolders({ dataOnly: true });
  assert.deepEqual(directories, ['dataEntity', 'toilet']);
  await assert.rejects(storage.writeTextFile(null, 'test.json', '{}'), /目录不可用/);
});

test('standalone settings JSON remains unchanged', async () => {
  const h = harness(); h.files.set('settings.json', '{"WidthMeters":0.8}');
  const mod = h.create(); await mod.loadAllTemplates(); await mod.saveAll();
  assert.equal(h.files.get('settings.json'), '{"WidthMeters":0.8}'); assert.match(h.messages.at(-1), /已保存数据/);
});

test('late external edit is caught immediately before its file write', async () => {
  const h = harness(); h.context.ensureSubFolders = async () => h.files.set('actor.json', 'late external');
  const mod = h.create(); await mod.loadAllTemplates(); await mod.saveAll();
  assert.equal(h.files.get('actor.json'), 'late external'); assert.match(h.messages.at(-1), /外部修改/);
});

test('partial data write failure preserves dirty state and allows retry', async () => {
  const h = harness(); const original = h.context.writeTextFile; let fail = true;
  h.context.writeTextFile = async (...args) => {
    if (args[1] === 'manifest.json' && fail) throw new Error('manifest write failed');
    return original(...args);
  };
  const mod = h.create(); await mod.loadAllTemplates(); h.appState.templates[0].instances[0].payload.health = 30;
  await mod.saveAll(); assert.equal(JSON.parse(h.files.get('actor.json')).instances[0].payload.health, 30);
  assert.equal(mod.hasUnsavedTemplateChanges(), true);
  fail = false; await mod.saveAll(); assert.equal(mod.hasUnsavedTemplateChanges(), false);
});

test('edits during asynchronous write remain marked unsaved', async () => {
  const h = harness(); const original = h.context.writeTextFile;
  h.context.writeTextFile = async (...args) => {
    await original(...args);
    if (args[1] === 'actor.json') h.appState.templates[0].instances[0].payload.health = 99;
  };
  const mod = h.create(); await mod.loadAllTemplates(); await mod.saveAll();
  assert.equal(JSON.parse(h.files.get('actor.json')).instances[0].payload.health, 10);
  assert.equal(mod.hasUnsavedTemplateChanges(), true);
});

if (process.env.PAS_DATA_DIR) {
  test('PAS tables: read-only disk audit and in-memory data-only round trip', async () => {
    const initial = [];
    for (const name of await readdir(process.env.PAS_DATA_DIR)) {
      if (!name.endsWith('.json') || name === 'manifest.json') continue;
      const t = JSON.parse(await readFile(`${process.env.PAS_DATA_DIR}/${name}`, 'utf8'));
      if (!t.name) continue;
      assert.equal(name, `${t.name}.json`); initial.push(t);
    }
    const h = harness('godot', initial); const mod = h.create(); await mod.loadAllTemplates();
    await mod.saveAll(); assert.match(h.messages.at(-1), /已保存数据/);
    for (const t of initial) {
      const saved = JSON.parse(h.files.get(`${t.name}.json`));
      assert.deepEqual(saved.instances, t.instances, `${t.name}: instances preserved`);
      assert.deepEqual(saved.parameters, t.parameters, `${t.name}: parameters preserved`);
    }
    console.log(`PAS audited ${initial.length} tables; project files were only read.`);
  });
}
