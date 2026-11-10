// Served only by Vite, before application scripts. Never copied to release output.
globalThis.scriptForgeDev = true;
globalThis.scriptForgeDiagnosticDatabasePrefix = 'scriptforge-dev-';
globalThis.scriptForgeLocalHelperDisabled = true;
document.addEventListener('DOMContentLoaded', () => {
  document.title = `ScriptForge Dev — ${document.title}`;
  const badge = document.createElement('div');
  badge.id = 'scriptforge-dev-badge';badge.textContent = 'ScriptForge Dev · isolated test data · production updates disabled';
  badge.style.cssText = 'position:fixed;bottom:4px;left:8px;z-index:100000;padding:4px 10px;background:#572ca5;color:white;font:12px system-ui;border-radius:5px;pointer-events:none';
  document.body.append(badge);
});
