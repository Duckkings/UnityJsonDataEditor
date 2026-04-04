import {
  buildGodotRuntimeLoaderContent,
  buildGodotRuntimeLoaderGuideContent,
  buildGodotRuntimeTesterContent,
  buildGodotRuntimeTesterGuideContent,
} from './csharp-runtime-generator.js';

function ensureContext(context) {
  if (!context || typeof context !== 'object') {
    throw new Error('createGodotRuntimeGeneratorModule requires a context object');
  }
  if (!context.appState || typeof context.appState !== 'object') {
    throw new Error('createGodotRuntimeGeneratorModule requires appState');
  }
}

export function createGodotRuntimeGeneratorModule(context) {
  ensureContext(context);

  const {
    appState,
    isGodotMode = () => false,
    writeTextFile = async () => {},
  } = context;

  async function generateRuntimeLoaderArtifacts() {
    if (!isGodotMode()) return;
    if (!appState.csharpHandle || !appState.modelStructHandle) return;

    await writeTextFile(
      appState.modelStructHandle,
      'DataEntityRuntimeLoader.cs',
      buildGodotRuntimeLoaderContent(),
    );
    await writeTextFile(
      appState.modelStructHandle,
      'DataEntityRuntimeLoaderGuide.txt',
      buildGodotRuntimeLoaderGuideContent(),
    );
    await writeTextFile(
      appState.csharpHandle,
      'DataEntityRuntimeTester.cs',
      buildGodotRuntimeTesterContent(),
    );
    await writeTextFile(
      appState.modelStructHandle,
      'DataEntityRuntimeTesterGuide.txt',
      buildGodotRuntimeTesterGuideContent(),
    );
  }

  return {
    generateRuntimeLoaderArtifacts,
  };
}

export function getGodotRuntimeGeneratorModule(context) {
  return createGodotRuntimeGeneratorModule(context);
}

export default createGodotRuntimeGeneratorModule;
