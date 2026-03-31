import { getLegacyModule } from '../legacy-module-bridge.js';

export function getSystemPanelsModule() {
  return getLegacyModule('systemPanels');
}

export default getSystemPanelsModule;
