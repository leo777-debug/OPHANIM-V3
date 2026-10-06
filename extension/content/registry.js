(() => {
  const root = globalThis.OphanimExtension = globalThis.OphanimExtension || {};
  root.adapters = root.adapters || [];
  root.registerAdapter = (adapter) => {
    if (!adapter?.id || typeof adapter.detect !== 'function') return;
    root.adapters.push(adapter);
    root.adapters.sort((left, right) => (right.priority || 0) - (left.priority || 0));
  };
  root.adapterForPage = () => root.adapters.find((adapter) => {
    try { return adapter.matches(location, document); } catch { return false; }
  });
})();
