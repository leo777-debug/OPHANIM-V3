// Worker-only policy. No credentials, private queries or raw errors are logged.
import { createHash, timingSafeEqual } from 'node:crypto';
import { request } from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
const digest = value => createHash('sha256').update(value).digest();
function configured(token) { return typeof token === 'string' && token.length >= 32 && !/[\s\x00-\x1f\x7f]/.test(token); }
function authorized(header, token) { return configured(token) && timingSafeEqual(digest(header || ''), digest(`Bearer ${token}`)); }
async function publicJson(input) {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.href.length > 16000 ||
    !(url.hostname === 'www.wikidata.org' && url.pathname === '/w/api.php' || url.hostname === 'query.wikidata.org' && url.pathname === '/sparql')) throw new Error('Unapproved source.');
  const { publicAddress } = await import('../ops/shared/public-address.mjs');
  const controller = new AbortController(); let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Source timed out.')); }, 8000); });
  try {
    const answers = await Promise.race([lookup(url.hostname,{all:true}),timeout]);
    if (!answers.length || answers.some(row => !publicAddress(row.address)) || controller.signal.aborted) throw new Error('Source address blocked.');
    const address = answers[0].address;
    return await Promise.race([new Promise((resolve,reject) => {
      const outgoing = request(url,{agent:false,signal:controller.signal,maxHeaderSize:16384,
        headers:{Accept:'application/json','Accept-Encoding':'identity','User-Agent':'Ophanim-reference-enrichment/1.0 (https://github.com/leo777-debug/OPHANIM-V3)'},
        lookup:(_host,options,done)=>options.all?done(null,[{address,family:isIP(address)}]):done(null,address,isIP(address))},response=>{
        if(response.statusCode!==200){response.resume();reject(new Error('Source unavailable.'));return;}
        let size=0;const chunks=[];
        response.on('data',chunk=>{size+=chunk.length;if(size>2000000)response.destroy(new Error('Source too large.'));else chunks.push(chunk);});
        response.on('error',()=>reject(new Error('Source interrupted.')));
        response.on('end',()=>{try{const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));resolve({ok:true,status:200,json:async()=>body});}catch{reject(new Error('Invalid source data.'));}});
      });outgoing.on('error',()=>reject(new Error('Source unavailable.')));outgoing.end();
    }),timeout]);
  } finally { clearTimeout(timer); controller.abort(); }
}
export {configured,authorized,publicJson};
