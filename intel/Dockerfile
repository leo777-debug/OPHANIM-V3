FROM node:22-alpine
WORKDIR /app/intel
COPY intel/package.json intel/package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node intel/server.js intel/policy.mjs intel/health.mjs ./
COPY --chown=node:node ops/shared/*.mjs /app/ops/shared/
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD ["node", "health.mjs"]
CMD ["node", "server.js"]
