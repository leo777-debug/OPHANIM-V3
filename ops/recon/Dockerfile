FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node ops/recon/*.mjs ./ops/recon/
COPY --chown=node:node ops/shared/*.mjs ./ops/shared/
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD ["node", "ops/recon/health.mjs"]
CMD ["node", "ops/recon/start.mjs"]
