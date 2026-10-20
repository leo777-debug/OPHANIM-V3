// Test-process guard only. It is never loaded by the production application.
import dns from 'node:dns';
const isLocal=host=>['localhost','127.0.0.1','::1','[::1]'].includes(String(host));
const originalLookup=dns.lookup;
dns.lookup=function(host,options,callback) {
  if(isLocal(host))return originalLookup.call(this,host,options,callback);
  const done=typeof options==='function'?options:callback;
  const error=Object.assign(new Error('External DNS blocked in presentation tests'),{code:'ENOTFOUND'});
  if(done){queueMicrotask(()=>done(error));return;}
  throw error;
};
const originalFetch=globalThis.fetch;
globalThis.fetch=async function(input,options) {
  const target=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(!isLocal(target.hostname))throw new Error('External API blocked in presentation tests');
  return originalFetch.call(this,input,options);
};
