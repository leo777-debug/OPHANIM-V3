(() => {
  const root = globalThis.OphanimExtension;
  root.registerAdapter({
    id: 'generic',
    priority: 0,
    matches: () => true,
    detect: () => root.detectEntities(`${document.title}\n${document.body?.innerText || ''}`, 'generic'),
  });
})();
