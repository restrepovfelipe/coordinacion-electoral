# Multi-stage build for the Comando Electoral 2026 backend (NestJS + Prisma).
# Authored per MIGRATION_SPEC.md §1.4; Node 24 per DISCOVERY.md §5 Amendment 7.
# There is no local container runtime on the dev host (Amendment 6) — this image
# is built remotely by Cloud Build at T44 and exercised at T45 (/api/healthz 200).

##### Build stage — install all deps, generate the Prisma client, compile #####
FROM node:24-slim AS build
WORKDIR /app

# OpenSSL is required by the Prisma query engine.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# pnpm via corepack, version-pinned for reproducible builds.
RUN corepack enable && corepack prepare pnpm@11.1.3 --activate

# Dependency install. prisma/ is copied first so @prisma/client's postinstall
# (`prisma generate`) finds the schema; pnpm-workspace.yaml carries the
# build-script approvals.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# Compile: copy the rest of the source, regenerate the client, build, then
# drop devDependencies from node_modules for a lean runtime image.
COPY . .
RUN pnpm exec prisma generate
RUN pnpm run build
RUN pnpm prune --prod

##### Production stage — runtime only, no toolchain or source #####
FROM node:24-slim AS production
WORKDIR /app
ENV NODE_ENV=production

# pgbouncer: connection pooler (sidecar, listens on 127.0.0.1:5432).
# openssl: required by the Prisma query engine.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl pgbouncer \
    && rm -rf /var/lib/apt/lists/*

# Production node_modules (incl. the generated Prisma client), compiled output,
# package.json and the schema — copied from the build stage.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma

# Entrypoint starts PgBouncer, waits for it, then exec node.
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Cloud Run injects PORT; main.ts listens on process.env.PORT ?? 3000.
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
