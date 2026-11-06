# SSR-mode image. Only needed if you deploy the opt-in SSR server; the default
# SPA build (`pnpm run build`) is static files for any web server / CDN.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build:ssr

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod && pnpm store prune
COPY --from=build /app/dist ./dist
COPY server.js server-runtime.js ./
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-5173}/healthz" || exit 1
USER node
CMD ["node", "server.js"]
