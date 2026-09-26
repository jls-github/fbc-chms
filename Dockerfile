# syntax=docker/dockerfile:1

FROM node:22-slim AS build
# esbuild's Go runtime can crash ("concurrent map writes") under QEMU when an
# amd64 image is built on an Apple Silicon Mac; one thread keeps it reliable.
ENV GOMAXPROCS=1
WORKDIR /app
COPY package.json package-lock.json ./
COPY mobile/package.json mobile/package-lock.json ./mobile/
RUN npm ci && npm ci --prefix mobile
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/drizzle ./drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3000/up').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Applies pending migrations on boot, then serves the API and the web app.
CMD ["node", "--enable-source-maps", "dist/server/index.js"]
