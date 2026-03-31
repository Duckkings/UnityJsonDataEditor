import { getLegacyModule } from '../legacy-module-bridge.js';

export function getUEGeneratorModule() {
  return getLegacyModule('ueGenerator');
}

export default getUEGeneratorModule;
