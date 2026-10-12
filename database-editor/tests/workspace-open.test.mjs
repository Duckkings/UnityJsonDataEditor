import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceStorageModule } from '../src/services/workspace-storage.js';

test('choose, auto-restore and refresh never generate or access runtime scripts in any engine mode', async () => {
  for (const mode of ['Unity', 'Godot', 'UE']) {
    const accesses = [], generated = [], messages = [];
    let loaded = 0, savedHandle;
    const directory = (path) => ({
      name: path.split('/').at(-1),
      queryPermission: async () => 'granted',
      async getDirectoryHandle(name) {
        const child = `${path}/${name}`;
        accesses.push(child);
        assert.ok(['project/dataEditorConfig', 'project/dataEntity', 'project/dataEntity/toilet'].includes(child), child);
        return directory(child);
      },
      async getFileHandle(name) {
        assert.equal(path, 'project/dataEditorConfig');
        assert.equal(name, 'config.json');
        return { getFile: async () => ({ text: async () => JSON.stringify({ engineMode: mode }) }) };
      },
    });
    const root = directory('project');
    globalThis.window = { showDirectoryPicker: async () => root };
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { storage: {} } });
    globalThis.indexedDB = {
      open() {
        const request = {};
        request.result = {
          transaction() {
            const tx = {
              objectStore: () => ({
                put(value) { savedHandle = value.handle; queueMicrotask(() => tx.oncomplete()); },
                get() {
                  const result = { result: { handle: savedHandle } };
                  queueMicrotask(() => result.onsuccess());
                  return result;
                },
              }),
            };
            return tx;
          },
        };
        queueMicrotask(() => request.onsuccess());
        return request;
      },
    };
    const appState = {
      CONFIG_DIR_NAME: 'dataEditorConfig', CONFIG_FILE_NAME: 'config.json', TRASH_FOLDER_NAME: 'toilet',
      ENGINE_MODES: { UNITY: 'Unity', GODOT: 'Godot', UE: 'UE' }, currentEngineMode: mode,
      templates: [], currentTemplateIndex: -1, currentInstanceIndex: -1, editingParamIndex: -1,
      selectedTemplates: new Set(), selectedInstances: new Set(), selectedParams: new Set(),
    };
    const module = createWorkspaceStorageModule({
      appState, isUnityMode: () => mode === 'Unity', isGodotMode: () => mode === 'Godot',
      loadAllTemplates: async () => { loaded++; },
      ensureModelStruct: async () => generated.push('model'),
      generateRuntimeLoaderArtifacts: async () => generated.push('runtime'),
      showMessage: (message) => messages.push(message),
    });
    await module.chooseDirectory();
    assert.equal(loaded, 1, messages.join('\n'));
    assert.equal(savedHandle, root);
    appState.directoryHandle = null;
    await module.autoRestoreLastDirectory();
    assert.equal(loaded, 2, messages.join('\n'));
    await module.refreshCurrentWorkspace();
    assert.equal(loaded, 3, messages.join('\n'));
    assert.deepEqual(generated, []);
    assert.ok(accesses.includes('project/dataEntity'));
  }
});
