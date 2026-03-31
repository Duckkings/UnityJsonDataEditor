import { getLegacyModule } from '../legacy-module-bridge.js';

export function getInteractionModule() {
  return getLegacyModule('interaction');
}

export default getInteractionModule;
