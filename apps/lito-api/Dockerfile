FROM golang:1.25.4-bookworm AS core
WORKDIR /src
COPY apps/lito-cli/go.mod apps/lito-cli/go.sum ./
RUN go mod download
COPY apps/lito-cli/ ./
RUN CGO_ENABLED=0 go build -trimpath -o /lito ./cmd/lito

FROM node:22-bookworm-slim AS build
RUN npm install -g pnpm@10.15.0
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/lito-api/package.json apps/lito-api/package.json
RUN pnpm install --frozen-lockfile --filter litora-api...
COPY packages/ packages/
COPY apps/lito-api/ apps/lito-api/
RUN pnpm --filter litora-api build

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /workspace/apps/lito-api
COPY --from=build /workspace /workspace
COPY --from=core /lito /usr/local/bin/lito
COPY apps/lito-cli/data /workspace/apps/lito-cli/data
COPY infra/postgres/init /workspace/infra/postgres/init
RUN mkdir -p /workspace/.litora/jobs && chown -R node:node /workspace/.litora
ENV LITO_CLI_BINARY=/usr/local/bin/lito
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
