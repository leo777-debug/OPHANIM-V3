(() => {
  const root = globalThis.OphanimExtension;
  root.registerAdapter({
    id: 'gmail',
    priority: 100,
    matches: (location) => location.hostname === 'mail.google.com',
    detect: () => {
      const subject = document.querySelector('h2.hP')?.textContent || document.title;
      const visibleMessages = [...document.querySelectorAll('.a3s.aiL')].filter((node) => node.getClientRects().length > 0).slice(-5);
      const text = `${subject}\n${visibleMessages.map((node) => node.textContent || '').join('\n')}`;
      return root.detectEntities(text, 'gmail');
    },
  });
})();
