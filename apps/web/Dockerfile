FROM node:22-alpine AS build
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/application/package.json packages/application/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/design-tokens/package.json packages/design-tokens/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/storage-contracts/package.json packages/storage-contracts/package.json
COPY packages/sync-core/package.json packages/sync-core/package.json

RUN corepack prepare pnpm@11.9.0 --activate \
    && pnpm install --frozen-lockfile

COPY apps/web apps/web
COPY packages packages
RUN pnpm --filter @nextone/web build

FROM caddy:2.10-alpine
COPY deploy/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /workspace/apps/web/dist /srv

EXPOSE 80 443 443/udp
