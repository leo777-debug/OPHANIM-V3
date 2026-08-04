FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# curl is required by the maritime route's MarineTraffic tile fetch (Cloudflare
# 403s Node's fetch on TLS fingerprint; curl with the same headers passes).
# GhostTrack is pinned to a reviewed upstream commit and runs only behind the
# backend provider; it is never exposed as a web service.
ARG GHOSTTRACK_REF=a5cb8ad4c08acd803f166fb067b7dac724d6cb3d
ARG MAIGRET_REF=b186b779744d6aa8808453db418facf583dcd58e
RUN apk add --no-cache curl git python3 py3-pip py3-virtualenv && \
    git clone https://github.com/HunxByts/GhostTrack.git /opt/ghosttrack && \
    git -C /opt/ghosttrack checkout --detach "$GHOSTTRACK_REF" && \
    python3 -m venv /opt/ghosttrack/.venv && \
    /opt/ghosttrack/.venv/bin/pip install --no-cache-dir -r /opt/ghosttrack/requirements.txt && \
    git clone https://github.com/soxoj/maigret.git /opt/maigret && \
    git -C /opt/maigret checkout --detach "$MAIGRET_REF" && \
    python3 -m venv /opt/maigret/.venv && \
    /opt/maigret/.venv/bin/pip install --no-cache-dir /opt/maigret

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/db ./db

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV GHOSTTRACK_DIR="/opt/ghosttrack"
ENV GHOSTTRACK_PYTHON="/opt/ghosttrack/.venv/bin/python"
ENV GHOSTTRACK_ENABLED="true"
ENV MAIGRET_COMMAND="/opt/maigret/.venv/bin/maigret"
ENV MAIGRET_ENABLED="true"

CMD ["sh", "-c", "node db/run-migrations.mjs && node server.js"]
