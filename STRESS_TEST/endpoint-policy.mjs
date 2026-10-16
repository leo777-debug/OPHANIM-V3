import { readdirSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import ts from 'typescript';

const publicRoutes = new Set(`air-quality cctv cctv/stream-status conflicts country-risk crypto cyber-threats demo-status earthquakes entity/expand fires flights frontlines fusion gdelt geo health infrastructure live-news malware map/layers maritime markets news osint/bgp osint/certs osint/cve osint/dns osint/github osint/ip osint/leaks osint/mac osint/phone osint/sanctions osint/sweep osint/threats osint/whois providers proxy-tiles radar region-dossier satellites scm-suppliers sentinel space-weather stats weather`.split(' '));
const cronRoutes = new Set(['imports/cron', 'intelligence/cron', 'knowledge/cron', 'logistics/disruptions/sync', 'platform/imports/cron', 'watchlists/cron']);
const anonymousOwned = new Set(['verify/check', 'verify/parse', 'verify/history', 'verify/image', 'verify/providers', 'verify/shares', 'watchlists', 'watchlists/check', 'watchlists/[id]']);
const publicInput = new Set(['auth/bootstrap', 'auth/login', 'auth/logout', 'auth/me', 'public/feedback', 'public/signup', 'search']);
function walk(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(resolve(folder, entry.name)) : entry.name === 'route.ts' ? [resolve(folder, entry.name)] : []);
}
export function endpointPolicies(root = process.cwd()) {
  return walk(resolve(root, 'src/app/api')).flatMap(file => {
    const source = readFileSync(file, 'utf8');
    const name = relative(resolve(root, 'src/app/api'), file).replaceAll('\\', '/').replace(/\/route.ts$/, '');
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const methods = tree.statements.flatMap(node => {
      if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) return node.exportClause.elements.map(entry=>entry.name.text);
      if (!node.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword)) return [];
      if (ts.isFunctionDeclaration(node) && node.name) return [node.name.text];
      if (ts.isVariableStatement(node)) return node.declarationList.declarations.filter(entry=>ts.isIdentifier(entry.name)).map(entry=>entry.name.text);
      return [];
    }).filter(name=>/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/.test(name));
    return methods.map(method => {
      const policy = cronRoutes.has(name) ? 'cron-secret'
        : ['github-webhook', 'webhooks/resend'].includes(name) ? 'webhook-signature'
        : name === 'sdk/ingest' && method === 'POST' ? 'service-key'
        : name === 'extension/context' && method === 'OPTIONS' ? 'preflight'
        : publicRoutes.has(name) ? 'public-provider'
        : anonymousOwned.has(name) ? 'anonymous-owner-or-member'
        : publicInput.has(name) ? 'public-input'
        : name === 'extension/context' || /await\s+(requireAuthenticatedActor|authorizeAiRequest)\s*\(/.test(source) ? 'member'
        : null;
      if (!policy) throw new Error(`Endpoint has no reviewed policy: ${method} /api/${name}`);
      return { method, path: `/api/${name}`, file: relative(root, file).replaceAll('\\', '/'), policy };
    });
  }).sort((a,b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`));
}
