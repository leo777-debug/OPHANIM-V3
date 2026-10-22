import { createReconServer } from './service.mjs';
const server = createReconServer({ token: process.env.SCANNER_KEY, targets: process.env.SCANNER_ALLOWED_TARGETS });
server.maxConnections = 16; server.maxHeadersCount = 30; server.timeout = 10000;
server.listen(8080, '0.0.0.0', () => console.log('Restricted HTTPS diagnostics worker listening on 8080.'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { server.close(); server.closeIdleConnections(); });
