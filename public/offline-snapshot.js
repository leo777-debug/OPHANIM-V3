/* Text-only rendering of the explicitly saved public snapshot; no remote requests. */
(async () => {
  const status = document.getElementById('snapshot-status'), list = document.getElementById('snapshot-events');
  const cacheName = 'ophanim-public-snapshot-v1', path = '/_ophanim_offline/public-advisories';
  document.getElementById('clear-snapshot').addEventListener('click', async () => {
    try { await caches.delete(cacheName); list.replaceChildren(); status.textContent = 'Saved public snapshot cleared.'; }
    catch { status.textContent = 'Could not clear offline storage in this browser.'; }
  });
  try {
    if (!('caches' in globalThis)) throw new Error('Storage unavailable');
    const response = await (await caches.open(cacheName)).match(path);
    if (!response) { status.textContent = 'No public snapshot saved. While online, open Public advisories and choose Save public snapshot offline.'; return; }
    const snapshot = await response.json();
    if (snapshot.version !== 1 || !Array.isArray(snapshot.events)) throw new Error('Invalid snapshot');
    status.textContent = `Saved ${snapshot.savedAt || 'unknown time'} · source API checked ${snapshot.checkedAt || 'unknown time'}. ${snapshot.limitation || ''}`;
    for (const event of snapshot.events.slice(0, 150)) {
      const article = document.createElement('article'), heading = document.createElement('h2');
      heading.textContent = String(event.title || 'Untitled publication'); article.append(heading);
      for (const value of [event.sourceName, `Published: ${event.publishedAt || 'not provided'} · fetched: ${event.retrievedAt || 'not recorded'} · original mode: ${event.dataMode || 'unknown'}`, event.summary, event.publicationAnomaly, event.attribution]) {
        if (!value) continue; const paragraph = document.createElement('p'); paragraph.textContent = String(value); article.append(paragraph);
      }
      list.append(article);
    }
  } catch { status.textContent = 'The saved public snapshot could not be read. Reconnect and save a new snapshot.'; }
})();
