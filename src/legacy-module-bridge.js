export function getLegacyModule(name) {
  const app = window.LegacyApp;
  if (!app || !app.modules) {
    throw new Error('LegacyApp runtime is not initialized');
  }
  const target = app.modules[name];
  if (!target) {
    throw new Error(`LegacyApp module "${name}" is not available`);
  }
  return target;
}
