// Pattern audit only: never reads env files and never prints matched values.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const patterns = [
  ['OpenAI-style token', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ['Google API-style key', /\bAIza[A-Za-z0-9_-]{30,}\b/g],
  ['GitHub-style token', /\bgh[pousr]_[A-Za-z0-9]{25,}\b/g],
  ['AWS access-key identifier', /\bAKIA[0-9A-Z]{16}\b/g],
];
let scannedFiles = 0; const findings = [];
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await scan(target);
    else if (entry.isFile() && entry.name.endsWith('.js')) {
      scannedFiles++; const text = await readFile(target, 'utf8');
      for (const [type, pattern] of patterns) {
        pattern.lastIndex = 0; const matches = [...text.matchAll(pattern)];
        if (matches.length) findings.push({ file: target, type, count: matches.length });
      }
    }
  }
}
await scan('.next/static/chunks');
const report = { checkedAt: new Date().toISOString(), scannedFiles, findings,
  limitation: 'Known token-format scan of built browser JavaScript only; does not prove absence of arbitrary-format secrets or cover every runtime response. Credential isolation is also unit-tested. No environment files or matched values were read into the report.' };
await writeFile(new URL('./client-secret-audit.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ scannedFiles, findingCount: findings.length }));
if (findings.length) process.exitCode = 1;
