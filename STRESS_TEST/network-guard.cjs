/* eslint-disable @typescript-eslint/no-require-imports -- Node's --require preloader must be CommonJS. */
const net = require('node:net');
const dns = require('node:dns');
const dnsPromises = require('node:dns/promises');
const { syncBuiltinESMExports } = require('node:module');

function isLoopback(host) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(host).toLowerCase());
}
function install() {
  if (process.env.OPHANIM_STRESS_ISOLATED !== '1') throw new Error('Stress network guard requires an explicit isolated runtime.');
  const originalConnect = net.Socket.prototype.connect;
  const originalLookup = dns.lookup;
  const originalPromiseLookup = dnsPromises.lookup;
  const originalFetch = globalThis.fetch;
  net.Socket.prototype.connect = function (...args) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    // Preserve local IPC pipes; TCP destinations must be loopback literals/names.
    const host = typeof first === 'object' && first ? first.host ?? first.hostname ?? 'localhost'
      : typeof first === 'number' ? typeof args[1] === 'string' ? args[1] : 'localhost' : null;
    if (host !== null && !isLoopback(host)) throw new Error('Stress isolation blocked an outbound socket.');
    return originalConnect.apply(this, args);
  };
  dns.lookup = function (host, options, callback) {
    if (isLoopback(host)) return originalLookup.call(this, host, options, callback);
    const cb = typeof options === 'function' ? options : callback;
    const error = Object.assign(new Error('Stress isolation blocked external DNS.'), { code: 'ENETUNREACH' });
    if (cb) return process.nextTick(cb, error);
    throw error;
  };
  dnsPromises.lookup = async (host, options) => {
    if (!isLoopback(host)) throw Object.assign(new Error('Stress isolation blocked external DNS.'), { code: 'ENETUNREACH' });
    return originalPromiseLookup(host, options);
  };
  syncBuiltinESMExports();
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (isLoopback(url.hostname)) return originalFetch(input, init);
    if (url.hostname === 'earthquake.usgs.gov') {
      return Response.json({ type: 'FeatureCollection', metadata: { title: 'Synthetic offline fixture, not live USGS' }, features: [] });
    }
    if (url.hostname === 'eonet.gsfc.nasa.gov') return Response.json({ events: [] });
    throw new Error('External provider unavailable in the isolated stress/replay environment.');
  };
  return () => {
    net.Socket.prototype.connect = originalConnect; dns.lookup = originalLookup;
    dnsPromises.lookup = originalPromiseLookup; globalThis.fetch = originalFetch;
    syncBuiltinESMExports();
  };
}
module.exports = { install, isLoopback };
if (process.env.OPHANIM_STRESS_ISOLATED === '1') install();
