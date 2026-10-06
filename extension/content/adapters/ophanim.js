(() => {
  const root = globalThis.OphanimExtension;
  root.registerAdapter({
    id: 'ophanim',
    priority: 90,
    matches: (location) => location.hostname === 'ophanim.live' || location.hostname === 'localhost',
    detect: () => root.detectEntities(`${document.title}\n${document.body?.innerText || ''}`, 'ophanim'),
  });
})();
