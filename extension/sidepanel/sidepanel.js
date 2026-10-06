const views = ['loading', 'signed-out', 'empty', 'result', 'error'];
const $ = (id) => document.getElementById(id);
let currentContext = null;
let currentResult = null;

function show(id) {
  for (const view of views) $(view).classList.toggle('hidden', view !== id);
}

function text(id, value) {
  $(id).textContent = value == null ? '' : String(value);
}

function appendTag(container, value) {
  const tag = document.createElement('span');
  tag.textContent = value;
  container.append(tag);
}

function renderSignal(card) {
  const article = document.createElement('article');
  article.className = 'signal';
  article.dataset.status = card.status;
  const icon = document.createElement('span');
  icon.className = 'signal-icon';
  icon.textContent = card.status === 'act' ? '▲' : '●';
  const copy = document.createElement('div');
  copy.className = 'signal-copy';
  const header = document.createElement('div');
  header.className = 'signal-header';
  const category = document.createElement('strong');
  category.textContent = card.category;
  const confidence = document.createElement('small');
  confidence.textContent = `${card.confidence}% confidence`;
  const title = document.createElement('h2');
  title.textContent = card.title;
  header.append(category, confidence);
  copy.append(header, title);
  if (card.detail) {
    const detail = document.createElement('p');
    detail.textContent = card.detail;
    copy.append(detail);
  }
  article.append(icon, copy);
  return article;
}

function render(result) {
  currentResult = result;
  const shipment = result.primaryShipment;
  const firstEntity = result.detectedEntities?.[0];
  text('adapter', result.page?.adapter?.toUpperCase() || 'PAGE');
  text('page-title', result.page?.title || result.page?.url || 'Current page');
  text('entity-label', shipment ? 'MATCHED SHIPMENT' : firstEntity?.label || 'DETECTED CONTEXT');
  text('shipment-reference', shipment?.reference || firstEntity?.value || 'No match');
  text('shipment-route', shipment?.route || (shipment ? 'Route not recorded' : 'Not linked to a stored shipment'));

  const metadata = $('shipment-meta');
  metadata.replaceChildren();
  if (shipment?.status) appendTag(metadata, shipment.status.replaceAll('_', ' '));
  if (shipment?.containerNumber) appendTag(metadata, shipment.containerNumber);
  if (shipment?.vesselName) appendTag(metadata, shipment.vesselName);
  if (result.relatedShipments?.length > 1) appendTag(metadata, `${result.relatedShipments.length} related shipments`);

  const signals = $('signals');
  signals.replaceChildren();
  if (result.cards?.length) result.cards.forEach((card) => signals.append(renderSignal(card)));
  else {
    const empty = document.createElement('p');
    empty.className = 'no-signals';
    empty.textContent = shipment ? 'No relevant active alert is stored for this shipment.' : 'Ophanim found no stored shipment matching the detected entities.';
    signals.append(empty);
  }

  text('development-count', result.developments || 0);
  text('summary-message', result.message);
  const entities = $('entities');
  entities.replaceChildren();
  (result.detectedEntities || []).slice(0, 8).forEach((entity) => appendTag(entities, `${entity.label} · ${entity.value}`));
  $('open-ophanim').textContent = shipment ? 'Open shipment in Ophanim ↗' : 'Open Ophanim ↗';
  show('result');
}

async function load() {
  show('loading');
  const active = await chrome.runtime.sendMessage({ type: 'OPHANIM_GET_ACTIVE_CONTEXT' });
  currentContext = active?.context;
  if (!currentContext) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    const retry = await chrome.runtime.sendMessage({ type: 'OPHANIM_GET_ACTIVE_CONTEXT' });
    currentContext = retry?.context;
  }
  if (!currentContext?.entities?.length) {
    show('empty');
    return;
  }
  const response = await chrome.runtime.sendMessage({ type: 'OPHANIM_FETCH_CONTEXT', payload: currentContext });
  if (!response?.ok) {
    if (response?.status === 401) show('signed-out');
    else {
      text('error-message', response?.error || 'Check that the Ophanim app is running and try again.');
      show('error');
    }
    return;
  }
  render(response.data);
}

$('refresh').addEventListener('click', load);
$('try-again').addEventListener('click', load);
$('sign-in').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'OPHANIM_OPEN_PATH', path: '/login?returnTo=/extension-connected' }));
$('open-ophanim').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'OPHANIM_OPEN_PATH', path: currentResult?.primaryShipment?.deepLink || '/' }));
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'OPHANIM_CONTEXT_CHANGED') load();
});

load().catch((error) => {
  text('error-message', error instanceof Error ? error.message : 'Unexpected extension error.');
  show('error');
});
