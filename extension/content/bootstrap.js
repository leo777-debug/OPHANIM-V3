(() => {
  const root = globalThis.OphanimExtension;
  let timer;
  let lastFingerprint = '';

  function scan() {
    const adapter = root.adapterForPage();
    if (!adapter) return;
    const entities = adapter.detect();
    const payload = {
      page: { url: location.href, title: document.title, adapter: adapter.id },
      entities,
    };
    const fingerprint = JSON.stringify(payload);
    if (fingerprint === lastFingerprint) return;
    lastFingerprint = fingerprint;
    chrome.runtime.sendMessage({ type: 'OPHANIM_PAGE_CONTEXT', payload }).catch(() => {});
  }

  function scheduleScan(delay = 700) {
    clearTimeout(timer);
    timer = setTimeout(scan, delay);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'OPHANIM_RESCAN') scheduleScan(0);
  });

  const observer = new MutationObserver(() => scheduleScan());
  if (document.body) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener('hashchange', () => scheduleScan(150));
  window.addEventListener('popstate', () => scheduleScan(150));
  scheduleScan(100);
})();
