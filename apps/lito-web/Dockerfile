FROM node:22-bookworm-slim AS build
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

FROM nginx:1.28-alpine
COPY apps/lito-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/lito-web/dist /usr/share/nginx/html
EXPOSE 80
