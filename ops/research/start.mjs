import { createResearchServer } from './service.mjs';
const server = createResearchServer({ token: process.env.AI_SANDBOX_RESEARCH_TOKEN });
server.listen(8080, '0.0.0.0', () => console.log('Restricted official-feed research worker listening on 8080.'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { server.close(); server.closeIdleConnections(); });
