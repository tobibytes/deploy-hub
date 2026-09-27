# One image holding the API and the built dashboard. Built for arm64 (the Pi) and
# amd64 (everything else) so the same tag runs in both places.
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------- build stage
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web

ARG RIG_VERSION=dev
ENV RIG_VERSION=$RIG_VERSION
RUN pnpm --filter @rig/web build \
 && pnpm --filter @rig/api build

# ------------------------------------------------------ production node_modules
FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# The API bundle inlines @rig/shared, but pnpm still wants the workspace folder
# to exist while it links.
COPY packages/shared/src packages/shared/src
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @rig/api

# -------------------------------------------------------------- runtime stage
FROM node:22-alpine AS runtime
WORKDIR /app/apps/api

# Rig reaches Docker over the socket proxy, so it needs no host privileges and
# runs as an unprivileged user.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    WEB_DIST=/app/apps/web/dist \
    MIGRATIONS_DIR=/app/apps/api/migrations

COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=prod-deps /app/apps/api/node_modules /app/apps/api/node_modules
COPY --from=build /app/apps/api/dist /app/apps/api/dist
COPY --from=build /app/apps/api/migrations /app/apps/api/migrations
COPY --from=build /app/apps/web/dist /app/apps/web/dist

ARG RIG_VERSION=dev
ENV RIG_VERSION=$RIG_VERSION

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
