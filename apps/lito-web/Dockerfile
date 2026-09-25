FROM node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9 AS build
RUN npm install -g pnpm@10.15.0
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY apps/lito-web/package.json apps/lito-web/package.json
RUN pnpm install --frozen-lockfile --filter litora-web...
COPY packages/ packages/
COPY apps/lito-web/ apps/lito-web/
RUN pnpm --filter litora-web build

FROM nginx:1.30.0-alpine@sha256:0272e4604ed93c1792f03695a033a6e8546840f86e0de20a884bb17d2c924883
COPY apps/lito-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/lito-web/dist /usr/share/nginx/html
EXPOSE 80
