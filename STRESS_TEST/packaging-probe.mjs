import { createServer } from 'node:net';
import { startTestApp } from './start-test.mjs';
await new Promise((resolve, reject) => {
  const probe = createServer(); probe.once('error', reject);
  probe.listen(3101, '127.0.0.1', () => probe.close(resolve));
});
const app = startTestApp(['ignore', 'pipe', 'pipe'], true, 3101);
let output = ''; app.stdout.on('data', (data) => { output = (output + data).slice(-6000); });
app.stderr.on('data', (data) => { output = (output + data).slice(-6000); });
try {
  for (let n = 0; n < 200 && !output.includes('Ready in'); n++) await new Promise((resolve) => setTimeout(resolve, 100));
  const response = await fetch('http://127.0.0.1:3101/api/health', { signal: AbortSignal.timeout(15000) });
  console.log(JSON.stringify({ status: response.status, health: await response.json() }));
} catch (error) { console.log(JSON.stringify({ error: error.message, syntheticRuntimeLog: output })); process.exitCode = 1; }
finally { app.kill('SIGTERM'); await new Promise((resolve) => app.exitCode !== null ? resolve() : app.once('exit', resolve)); }
