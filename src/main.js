import '../script.js';

import * as formAndReference from './core/form-and-reference.js';
import * as templateNormalizer from './domain/template-normalizer.js';
import * as indexEnumValidation from './domain/index-enum-validation.js';
import * as editorActions from './domain/editor-actions.js';

const legacyApp = window.LegacyApp || {};

const appModules = {
  ...(legacyApp.modules || {}),
  formAndReference,
  templateNormalizer,
  indexEnumValidation,
  editorActions,
};

window.AppModules = appModules;
window.AppState = legacyApp.state || null;

async function bootstrapApp() {
  if (typeof legacyApp.bootstrap === 'function') {
    await legacyApp.bootstrap();
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    void bootstrapApp();
  }, { once: true });
} else {
  void bootstrapApp();
}

export default appModules;
