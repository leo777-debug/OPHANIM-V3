// Test-process guard only. It is never loaded by the production application.
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
const isLocal=host=>['localhost','127.0.0.1','::1','[::1]'].includes(String(host));
const originalLookup=dns.lookup;
dns.lookup=function(host,options,callback) {
  if(isLocal(host))return originalLookup.call(this,host,options,callback);
  const done=typeof options==='function'?options:callback;
  const error=Object.assign(new Error('External DNS blocked in presentation tests'),{code:'ENOTFOUND'});
  if(done){queueMicrotask(()=>done(error));return;}
  throw error;
};
const originalPromiseLookup=dnsPromises.lookup;
dnsPromises.lookup=async function(host,...options) {
  if(isLocal(host))return originalPromiseLookup.call(this,host,...options);
  throw Object.assign(new Error('External DNS blocked in presentation tests'),{code:'ENOTFOUND'});
};
const originalConnect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args) {
  let options=args[0];if(Array.isArray(options))options=options[0];
  const host=options&&typeof options==='object'?(options.host??options.hostname)
    :typeof args[1]==='string'?args[1]:undefined;
  if(!isLocal(host??'localhost'))throw new Error('External socket blocked in presentation tests');
  return originalConnect.apply(this,args);
};
syncBuiltinESMExports();
const originalFetch=globalThis.fetch;
globalThis.fetch=async function(input,options) {
  const target=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(!isLocal(target.hostname))throw new Error('External API blocked in presentation tests');
  return originalFetch.call(this,input,options);
};
