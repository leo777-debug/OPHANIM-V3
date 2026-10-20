import { existsSync } from 'node:fs';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const url=new URL(process.env.APP_URL ?? 'http://localhost:3000');
if(url.protocol!=='https:' && !['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Use HTTPS outside localhost.');
if(!process.env.PRESENTATION_OWNER_EMAIL || !process.env.PRESENTATION_OWNER_PASSWORD)throw new Error('Set PRESENTATION_OWNER_EMAIL, PRESENTATION_OWNER_PASSWORD and PRESENTATION_ORGANIZATION_SLUG in the uncommitted .env.local. Use your existing owner login.');
async function main() {
  const login=await fetch(new URL('/api/auth/login',url),{method:'POST',headers:{'Content-Type':'application/json',Origin:url.origin},body:JSON.stringify({email:process.env.PRESENTATION_OWNER_EMAIL,password:process.env.PRESENTATION_OWNER_PASSWORD,organizationSlug:process.env.PRESENTATION_ORGANIZATION_SLUG}),signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!login.ok)throw new Error(`Owner login failed (${login.status}). No credentials were logged.`);
  const cookie=login.headers.getSetCookie().map(value=>value.split(';',1)[0]).join('; ');
  if(!cookie)throw new Error('Login returned no session. Use the dashboard snapshot button instead.');
  const response=await fetch(new URL('/api/presentation/snapshot',url),{method:'POST',headers:{Cookie:cookie,Origin:url.origin},signal:AbortSignal.timeout(40000),redirect:'error'});
  if(!response.ok)throw new Error(`Snapshot failed (${response.status}). Check the owner account and database migration.`);
  const result=await response.json();
  console.log(`Saved ${result.saved.length} public feeds; ${result.unavailable.length} unavailable. Previous snapshots for failed sources were retained.`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
