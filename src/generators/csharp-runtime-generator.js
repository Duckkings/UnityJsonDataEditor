import { getLegacyModule } from '../legacy-module-bridge.js';

export function getCSharpRuntimeGeneratorModule() {
  return getLegacyModule('csharpRuntimeGenerator');
}

export default getCSharpRuntimeGeneratorModule;
