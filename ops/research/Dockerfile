FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node ops/research/*.mjs ./ops/research/
COPY --chown=node:node src/lib/intelligence/research-sources.json ./src/lib/intelligence/research-sources.json
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD ["node", "ops/research/health.mjs"]
CMD ["node", "ops/research/start.mjs"]
