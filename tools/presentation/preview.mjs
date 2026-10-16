import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { startTestDatabase,seedReplay } from './test-db.mjs';

// Isolated local UI preview only; no existing .env or production database is read.
const port=Number(process.env.PRESENTATION_PREVIEW_PORT ?? 3108);
const local=await startTestDatabase(Number(process.env.PRESENTATION_PREVIEW_DB_PORT ?? 55440));
await seedReplay(local.db);
await local.db.query("update ophanim_presentation_settings set presentation_mode=true,presentation_replay='on',revision=revision+1");
const credentials=local.credentials.owner;
await writeFile('.env.presentation.local',`# Generated credentials for this disposable local preview only. Never commit.\nPRESENTATION_DEMO_EMAIL=${credentials.email}\nPRESENTATION_DEMO_PASSWORD=${credentials.password}\nPRESENTATION_DEMO_ORGANIZATION_SLUG=${credentials.organizationSlug}\n`);
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/(KEY|SECRET|TOKEN|PASSWORD|SUPABASE|DATABASE_URL|APP_URL|UMAMI)/i.test(key)));
Object.assign(env,{NODE_ENV:'production',NEXT_DEV_DIST_DIR:'.next-presentation',NEXT_TELEMETRY_DISABLED:'1',DATABASE_URL:local.url+'?sslmode=disable',APP_URL:`http://127.0.0.1:${port}`,NODE_OPTIONS:`--import "${new URL('./network-guard.mjs',import.meta.url).href}"`});
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:'inherit',windowsHide:true});
console.log(`Local preview: http://127.0.0.1:${port}/presentation (SYNTHETIC TEST REPLAY, not live data).`);
console.log('Disposable owner login details are in the uncommitted .env.presentation.local.');
let stopping=false;
async function stop(){if(stopping)return;stopping=true;child.kill();await local.stop();}
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());child.once('exit',()=>void stop());
