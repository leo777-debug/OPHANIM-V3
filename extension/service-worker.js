import { backendOrigin } from './config.js';

const CONTEXT_MENU_ID = 'ophanim-ask-selection';
const contextKey = (tabId) => `tab:${tabId}:context`;

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Ask Ophanim about “%s”',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id || !info.selectionText) return;
  const selected = info.selectionText.replace(/\s+/g, ' ').trim().slice(0, 160);
  const page = { url: info.pageUrl || tab.url || '', title: tab.title || '', adapter: 'selection' };
  const context = { page, entities: [{ type: 'selection', value: selected, confidence: 100, source: 'selection' }], detectedAt: Date.now() };
  await chrome.storage.session.set({ [contextKey(tab.id)]: context });
  await chrome.sidePanel.open({ tabId: tab.id });
  chrome.runtime.sendMessage({ type: 'OPHANIM_CONTEXT_CHANGED', tabId: tab.id }).catch(() => {});
});

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function storedContext(tabId) {
  if (!tabId) return null;
  const stored = await chrome.storage.session.get(contextKey(tabId));
  return stored[contextKey(tabId)] || null;
}

async function requestBackendContext(payload) {
  const origin = await backendOrigin();
  const response = await fetch(`${origin}/api/extension/context`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: payload.page, entities: payload.entities }),
  });
  const data = await response.json().catch(() => ({ error: 'Ophanim returned an unreadable response.' }));
  if (!response.ok) {
    const error = new Error(data.error || 'Ophanim request failed.');
    error.status = response.status;
    throw error;
  }
  return { data, origin };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'OPHANIM_PAGE_CONTEXT' && sender.tab?.id) {
    const safeContext = {
      page: message.payload?.page,
      entities: Array.isArray(message.payload?.entities) ? message.payload.entities.slice(0, 30) : [],
      detectedAt: Date.now(),
    };
    chrome.storage.session.set({ [contextKey(sender.tab.id)]: safeContext }).then(() => {
      chrome.runtime.sendMessage({ type: 'OPHANIM_CONTEXT_CHANGED', tabId: sender.tab.id }).catch(() => {});
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message?.type === 'OPHANIM_GET_ACTIVE_CONTEXT') {
    activeTab().then(async (tab) => {
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'OPHANIM_RESCAN' }).catch(() => {});
      sendResponse({ tabId: tab?.id, context: await storedContext(tab?.id) });
    });
    return true;
  }

  if (message?.type === 'OPHANIM_FETCH_CONTEXT') {
    requestBackendContext(message.payload).then((result) => sendResponse({ ok: true, ...result })).catch((error) => {
      sendResponse({ ok: false, status: error.status || 0, error: error.message || 'Ophanim is unavailable.' });
    });
    return true;
  }

  if (message?.type === 'OPHANIM_OPEN_PATH') {
    backendOrigin().then((origin) => {
      const path = typeof message.path === 'string' && message.path.startsWith('/') ? message.path : '/';
      chrome.tabs.create({ url: `${origin}${path}` });
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});
