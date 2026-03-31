import { getLegacyModule } from '../legacy-module-bridge.js';

export function getPanelsModule() {
  return getLegacyModule('panels');
}

export default getPanelsModule;
