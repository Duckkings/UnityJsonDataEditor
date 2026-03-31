import { getLegacyModule } from '../legacy-module-bridge.js';

export function getSheetModeModule() {
  return getLegacyModule('sheetMode');
}

export default getSheetModeModule;
