function ensureContext(context) {
  if (!context || typeof context !== 'object') {
    throw new Error('createAppModeModule requires a context object');
  }
  if (!context.appState || typeof context.appState !== 'object') {
    throw new Error('createAppModeModule requires appState');
  }
}

export function createAppModeModule(context) {
  ensureContext(context);

  const {
    appState,
    updateEngineModeUIState = () => {},
    refreshTemplates = () => {},
  } = context;

  function isUnityMode() {
    return appState.currentEngineMode === appState.ENGINE_MODES.UNITY;
  }

  function isGodotMode() {
    return appState.currentEngineMode === appState.ENGINE_MODES.GODOT;
  }

  function isCSharpMode() {
    return isUnityMode() || isGodotMode();
  }

  function isUEMode() {
    return appState.currentEngineMode === appState.ENGINE_MODES.UE;
  }

  function getCurrentEngineLabel() {
    return appState.ENGINE_LABELS[appState.currentEngineMode] || '';
  }

  function setEngineMode(newMode) {
    if (!Object.values(appState.ENGINE_MODES).includes(newMode)) return;
    if (newMode === appState.currentEngineMode) return;
    appState.currentEngineMode = newMode;
    if (appState.engineModeNeedsConfirmation) {
      appState.engineModeNeedsConfirmation[newMode] = true;
    }
    updateEngineModeUIState();
    refreshTemplates();
  }

  function toggleEngineMode() {
    const orderedModes = [
      appState.ENGINE_MODES.UNITY,
      appState.ENGINE_MODES.GODOT,
      appState.ENGINE_MODES.UE,
    ].filter(Boolean);
    const currentIndex = orderedModes.indexOf(appState.currentEngineMode);
    const nextMode = orderedModes[(currentIndex + 1) % orderedModes.length];
    setEngineMode(nextMode);
  }

  function isSheetModeActive() {
    return appState.currentEditMode === appState.EDIT_MODES.SHEET;
  }

  function normalizeSheetSelection() {
    const templates = Array.isArray(appState.templates) ? appState.templates : [];
    if (!templates.length) {
      appState.sheetActiveTemplateIndex = -1;
      appState.sheetActiveInstanceIndex = -1;
      return;
    }
    if (
      appState.sheetActiveTemplateIndex < 0 ||
      appState.sheetActiveTemplateIndex >= templates.length
    ) {
      appState.sheetActiveTemplateIndex =
        appState.currentTemplateIndex >= 0 ? appState.currentTemplateIndex : 0;
      if (appState.sheetActiveTemplateIndex >= templates.length) {
        appState.sheetActiveTemplateIndex = templates.length - 1;
      }
    }
    const tpl = templates[appState.sheetActiveTemplateIndex];
    const instList = Array.isArray(tpl?.instances) ? tpl.instances : [];
    if (instList.length === 0) {
      appState.sheetActiveInstanceIndex = -1;
      return;
    }
    if (
      appState.sheetActiveInstanceIndex < 0 ||
      appState.sheetActiveInstanceIndex >= instList.length
    ) {
      if (
        appState.currentInstanceIndex >= 0 &&
        appState.currentInstanceIndex < instList.length
      ) {
        appState.sheetActiveInstanceIndex = appState.currentInstanceIndex;
      } else {
        appState.sheetActiveInstanceIndex = 0;
      }
    }
  }

  return {
    isUnityMode,
    isGodotMode,
    isCSharpMode,
    isUEMode,
    getCurrentEngineLabel,
    updateEngineModeUIState,
    setEngineMode,
    toggleEngineMode,
    isSheetModeActive,
    normalizeSheetSelection,
  };
}

export function getAppModeModule(context) {
  return createAppModeModule(context);
}

export default createAppModeModule;
