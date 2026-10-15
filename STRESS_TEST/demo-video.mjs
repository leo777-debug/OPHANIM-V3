import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { zipSync, strToU8 } from 'fflate';
import { withIsolatedApp } from './harness.mjs';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'STRESS_TEST/video');
await mkdir(resolve(out, 'raw'), { recursive: true });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function excel() {
  const rows = [['Shipment Reference', 'Origin Port', 'Destination Port', 'Origin Port Code', 'Destination Port Code', 'ETA'], ['DXB-291', 'Jebel Ali', 'Nhava Sheva', 'AEJEA', 'INNSA', '2026-10-16T12:00:00.000Z']];
  const xml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const data = rows.map((row, index) => `<row r="${index + 1}">${row.map((value, column) => `<c r="${String.fromCharCode(65 + column)}${index + 1}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`).join('')}</row>`).join('');
  return zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Synthetic shipments" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${data}</sheetData></worksheet>`),
  });
}
const encodeOnly = process.argv.includes('--encode-only');
const previous = encodeOnly ? JSON.parse(await readFile(resolve(root, 'STRESS_TEST/artifacts/video.json'), 'utf8')) : null;
const recording = previous?.recording ?? [];
const captions = previous?.captions ?? [];
if (!encodeOnly) await withIsolatedApp(async ({ base }) => {
  const demo = JSON.parse(await readFile(resolve(root, 'STRESS_TEST/runtime/demo-context.json'), 'utf8'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: resolve(out, 'raw'), size: { width: 1920, height: 1080 } } });
  await context.addCookies([{ name: 'ophanim_session', value: demo.token, url: base, httpOnly: true, sameSite: 'Lax' }]);
  await context.route('**/*', (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const warm = await context.newPage();
  await warm.goto(`${base}/imports`, { waitUntil: 'domcontentloaded' });
  await warm.getByRole('heading', { name: 'Import records', exact: true }).waitFor();
  await warm.goto(`${base}/logistics/rescue`, { waitUntil: 'domcontentloaded' });
  await warm.getByRole('heading', { name: 'Active rescue cases', exact: true }).waitFor();
  await warm.close();
  const page = await context.newPage();
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  const start = performance.now();
  const caption = (text) => captions.push({ start: (performance.now() - start) / 1000, text });
  try {
    caption('Ophanim - organization-scoped freight intelligence. Synthetic demo only.');
    await page.goto(`${base}/imports`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Import records', exact: true }).waitFor();
    await pause(5000);
    caption('Import an Excel shipment file. Review mapping before any records are created.');
    await page.locator('input[type="file"]').setInputFiles({ name: 'DEMO-ONLY-shipments.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(excel()) });
    await page.getByRole('button', { name: 'Preview import', exact: true }).click();
    await page.getByRole('heading', { name: '3. Review and import', exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole('heading', { name: '2. Confirm column mapping', exact: true }).scrollIntoViewIfNeeded();
    await pause(12000);
    caption('The review gate validates columns and duplicates. The operator confirms the import.');
    await page.getByRole('button', { name: 'Confirm import', exact: true }).scrollIntoViewIfNeeded();
    await pause(5000);
    await page.getByRole('button', { name: 'Confirm import', exact: true }).click();
    await page.getByText('completed', { exact: true }).waitFor({ timeout: 15000 });
    await pause(8000);
    const response = await context.request.get(`${base}/api/logistics/shipments`);
    const shipment = (await response.json()).shipments.find((item) => item.shipmentReference === 'DXB-291');
    if (!shipment) throw new Error('Import did not create DXB-291. Do not record a fabricated success.');
    caption('DXB-291: Jebel Ali to Nhava Sheva. The stored shipment opens as a real record.');
    await page.goto(`${base}/logistics/shipments/${shipment.id}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'DXB-291', exact: true }).waitFor();
    await pause(12000);
    const advisory = await context.request.post(`${base}/api/logistics/disruptions`, { data: {
      source: 'synthetic_demo', sourceReference: 'synthetic-weather-demo-2026-10',
      title: 'DEMO ONLY - severe weather at Nhava Sheva', disruptionType: 'weather', severity: 5,
      description: 'Synthetic recorded scenario, not a live forecast. Destination-port matching must be reviewed by an operator.',
      affectedPorts: ['INNSA'], effectiveAt: '2026-10-16T00:00:00Z', reportedAt: '2026-10-13T08:00:00Z',
    } });
    if (!advisory.ok()) throw new Error('Synthetic advisory could not be stored.');
    const disruption = (await advisory.json()).disruption;
    const impactResponse = await context.request.post(`${base}/api/logistics/disruptions/${disruption.id}/reconcile`, { data: {} });
    const impacts = await impactResponse.json();
    if (!impactResponse.ok() || !impacts.assessments?.some((item) => item.shipmentId === shipment.id)) throw new Error('The actual matcher did not connect the synthetic weather advisory to DXB-291.');
    caption('A synthetic weather advisory matches DXB-291 by destination port. Rules decide; operators review.');
    await page.goto(`${base}/logistics/disruptions?selected=${disruption.id}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: disruption.title, exact: true }).waitFor();
    await page.getByText('DXB-291', { exact: true }).first().scrollIntoViewIfNeeded();
    await pause(16000);
    const rescueResponse = await context.request.post(`${base}/api/logistics/rescue-cases`, { data: { shipmentId: shipment.id, disruptionId: disruption.id, objective: 'DEMO ONLY - review carrier options before changing bookings.' } });
    if (rescueResponse.status() !== 201) throw new Error('Actual rescue workflow could not be created.');
    const rescue = (await rescueResponse.json()).rescueCase;
    caption('The operator records a next step and rationale. No carrier booking is changed.');
    await page.goto(`${base}/logistics/rescue`, { waitUntil: 'domcontentloaded' });
    await page.locator('button.ops-case-row').filter({ hasText: 'DXB-291' }).first().click();
    await page.getByRole('heading', { name: 'Decisions and evidence', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Decisions and evidence', exact: true }).scrollIntoViewIfNeeded();
    await page.getByLabel('Decision', { exact: true }).selectOption('note');
    const rationale = 'DEMO ONLY: ask the carrier for alternate sailings before changing bookings.';
    await page.getByPlaceholder('Decision rationale', { exact: true }).fill(rationale);
    await pause(4000);
    await page.getByRole('button', { name: 'Record decision', exact: true }).click();
    await page.getByText(rationale, { exact: false }).waitFor();
    const storedDecision = await context.request.get(`${base}/api/logistics/rescue-cases/${rescue.id}`);
    if (!(await storedDecision.json()).rescueCase?.decisions?.some((item) => item.rationale === rationale)) throw new Error('The actual decision log did not preserve the operator note.');
    await pause(10000);
    caption('Verify checks public-event claims. These examples are explicitly synthetic replays.');
    await page.goto(`${base}/verify`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Is this true?', exact: true }).waitFor();
    await pause(7000);
    await page.getByRole('button', { name: 'Dubai airport fog', exact: true }).click();
    await page.getByRole('article', { name: 'Verification result' }).waitFor({ timeout: 15000 });
    await page.getByRole('article', { name: 'Verification result' }).scrollIntoViewIfNeeded();
    caption('PARTLY TRUE: fog and diversions, but recorded departures contradict a full closure.');
    await pause(13000);
    await page.getByRole('heading', { name: 'Evidence 3', exact: false }).scrollIntoViewIfNeeded().catch(() => {});
    caption('Evidence shows sources, observation times and what supports or contradicts the claim.');
    await page.mouse.wheel(0, 500); await pause(8000);
    caption('A public share contains only the claim and evidence, not private organization records.');
    await page.getByLabel('This claim contains no private or organization data. Make the claim and evidence public.').check();
    await page.getByRole('button', { name: 'Create share link', exact: true }).click();
    await page.getByRole('link', { name: 'Open shared result', exact: true }).waitFor();
    const shared = await page.getByRole('link', { name: 'Open shared result', exact: true }).getAttribute('href');
    await page.goto(`${base}${shared}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('article', { name: 'Verification result' }).waitFor(); await pause(12000);
    caption('Signed-in history preserves previous checks. Deterministic verification works without AI.');
    await page.goto(`${base}/verify`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Tokyo earthquake', exact: true }).click();
    await page.getByRole('article', { name: 'Verification result' }).waitFor();
    await page.getByRole('heading', { name: 'Your history', exact: false }).scrollIntoViewIfNeeded();
    await pause(10000);
    caption('Ophanim watches the world for your freight. Recorded fixtures, not live intelligence.');
    await pause(8000);
    if (errors.length) throw new Error(`Demo path has ${errors.length} page exceptions.`);
    recording.push({ importedShipment: true, ruleBasedWeatherMatch: true, decisionLog: true, verifyReplay: true, sharedResult: true, history: true, errors, durationSeconds: (performance.now() - start) / 1000 });
  } finally {
    const video = page.video(); await context.close();
    if (video) await video.saveAs(resolve(out, 'raw/verified-demo.webm'));
    await browser.close();
  }
});
const duration = recording[0].durationSeconds;
const stamp = (seconds) => `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(Math.floor(seconds) % 60).padStart(2, '0')}.${String(Math.floor(seconds % 1 * 100)).padStart(2, '0')}`;
const header = '[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Default,Arial,30,&H00FFFFFF,&H00FFFFFF,&H80000000,&H80000000,0,0,0,0,100,100,0,0,3,2,0,2,60,60,32,1\nStyle: Replay,Arial,22,&H00FFFFFF,&H00FFFFFF,&H80000000,&H80000000,0,0,0,0,100,100,0,0,3,2,0,8,40,40,8,1\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n';
await writeFile(resolve(out, 'raw/captions.ass'), header + `Dialogue: 1,${stamp(0)},${stamp(duration)},Replay,,0,0,0,,SYNTHETIC DEMO ONLY - recorded test fixtures, not live intelligence\n` + captions.map((caption, index) => `Dialogue: 0,${stamp(caption.start)},${stamp(captions[index + 1]?.start ?? duration)},Default,,0,0,0,,${caption.text}\n`).join(''));
const file = resolve(out, 'Ophanim-Demo-2026-10.mp4');
await copyFile(process.env.OPHANIM_DEMO_FONT ?? resolve(process.env.WINDIR ?? 'C:/Windows', 'Fonts/arial.ttf'), resolve(out, 'raw/presentation-font.ttf'));
await new Promise((resolve, reject) => {
  const cards = (heading, subheading) => `drawtext=fontfile=raw/presentation-font.ttf:text='${heading}':fontcolor=white:fontsize=64:x=(w-tw)/2:y=(h-th)/2-50,drawtext=fontfile=raw/presentation-font.ttf:text='${subheading}':fontcolor=0x8BD5CE:fontsize=34:x=(w-tw)/2:y=(h-th)/2+45,drawtext=fontfile=raw/presentation-font.ttf:text='SYNTHETIC DEMO - NOT LIVE DATA':fontcolor=white:fontsize=22:x=(w-tw)/2:y=h-80`;
  const filter = `[1:v]${cards('Ophanim', 'Watches the world for your freight')}[intro];[0:v]subtitles=raw/captions.ass,fps=30,setpts=PTS-STARTPTS[body];[2:v]${cards('Ophanim', 'Evidence for the decisions that move your freight')}[outro];[intro][body][outro]concat=n=3:v=1:a=0[out]`;
  const child = spawn('ffmpeg', ['-y', '-i', 'raw/verified-demo.webm', '-f', 'lavfi', '-i', 'color=c=0x101518:s=1920x1080:r=30:d=3', '-f', 'lavfi', '-i', 'color=c=0x101518:s=1920x1080:r=30:d=3', '-filter_complex', filter, '-map', '[out]', '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { cwd: out, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let output = ''; child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-3000); }); child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(output)));
});
const copy = 'D:/OPHANIM/Documentation';
if (await stat(copy).then((item) => item.isDirectory()).catch(() => false)) await copyFile(file, resolve(copy, 'Ophanim-Demo-2026-10.mp4'));
await writeFile(resolve(root, 'STRESS_TEST/artifacts/video.json'), JSON.stringify({ file, recording, captions, limitations: ['Existing import, shipment, actual port-match, operator decision log and Verify workflows recorded.', 'This matcher shows a port match, not a validated forecast-cone/time-window engine. The operator note does not change a carrier booking.', 'Document discrepancy, Gulf signal and confirmation scenes not yet included.', 'No real customer data, API keys or live provider traffic.'], complete: false }, null, 2));
console.log(`Recorded H.264 demo: ${file}`);
