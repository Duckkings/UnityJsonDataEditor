import { getLegacyModule } from '../legacy-module-bridge.js';

export function getCsvServiceModule() {
  return getLegacyModule('csvService');
}

export default getCsvServiceModule;
