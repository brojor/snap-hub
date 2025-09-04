# syntax=docker/dockerfile:1.7
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ---------- build jen pro server ----------
FROM base AS build-server
WORKDIR /usr/src/app
COPY . .
# nainstaluje jen server + jeho deps z monorepa
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --filter=server... --frozen-lockfile
# postaví jen server (a jeho závislosti ve workspace)
RUN pnpm -r --filter=server... build
# vyexportuje runtime payload serveru
RUN pnpm deploy --filter=server --prod /prod/server

# ---------- build jen pro client ----------
FROM base AS build-client
WORKDIR /usr/src/app
COPY . .
# nainstaluje jen client + jeho deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --filter=client... --frozen-lockfile
# postaví jen client (a jeho závislosti ve workspace)
RUN pnpm -r --filter=client... build

# ---------- server runtime ----------
FROM base AS server
WORKDIR /prod/server
COPY --from=build-server /prod/server ./
EXPOSE 3000
CMD ["pnpm", "start"]

# ---------- client runtime ----------
FROM base AS client
WORKDIR /prod/client
RUN pnpm add -g serve
ARG CLIENT_DIST=packages/client/dist
COPY --from=build-client /usr/src/app/${CLIENT_DIST} ./dist
EXPOSE 8080
ENTRYPOINT ["serve"]
CMD ["-s", "dist", "-l", "8080"]
