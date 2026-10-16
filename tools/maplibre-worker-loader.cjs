// MapLibre resolves an already configured, absolute worker URL here. Turbopack
// mistakenly treats the dynamic import.meta-relative URL as a bundled asset.
module.exports = function (source) {
  const original = 'new URL(e,import.meta.url).href';
  if (source.split(original).length !== 2) throw new Error('MapLibre worker workaround needs review for this release.');
  return source.replace(original, 'new URL(e,globalThis.location.href).href');
};
