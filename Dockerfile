# syntax=docker/dockerfile:1

# The build stage runs on the builder's own CPU (e.g. an Apple Silicon Mac) rather
# than under emulation: its output is plain JavaScript and every production
# dependency is pure JS, so the result runs on the amd64 server unchanged.
FROM --platform=$BUILDPLATFORM node:22-slim AS build
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
