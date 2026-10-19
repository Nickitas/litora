FROM golang:1.25.4-bookworm@sha256:e17419604b6d1f9bc245694425f0ec9b1b53685c80850900a376fb10cb0f70cb AS core
WORKDIR /src
COPY apps/lito-cli/go.mod apps/lito-cli/go.sum ./
RUN go mod download
COPY apps/lito-cli/ ./
RUN CGO_ENABLED=0 go build -trimpath -o /lito ./cmd/lito

FROM node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9 AS build
RUN npm install -g pnpm@10.15.0
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/lito-api/package.json apps/lito-api/package.json
RUN pnpm install --frozen-lockfile --filter litora-api...
COPY packages/ packages/
COPY apps/lito-api/ apps/lito-api/
RUN pnpm --filter litora-api build

FROM node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9 AS runtime
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

FROM runtime AS heavy
USER root
ARG TARGETARCH
RUN test "${TARGETARCH}" = "amd64" || \
    (echo "Образ heavy с Gmsh 4.15.2 поддерживает только linux/amd64" >&2; exit 1)
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*
ADD --checksum=sha256:2f81d19efb0dd94426bdab010131da59b7dac1939a3073890dc32c86ecbaa8db \
    https://gmsh.info/bin/Linux/gmsh-4.15.2-nox-Linux64-sdk.tgz /tmp/gmsh-sdk.tgz
RUN mkdir -p /opt/gmsh && \
    tar -xzf /tmp/gmsh-sdk.tgz -C /opt/gmsh --strip-components=1 && \
    ln -s /opt/gmsh/bin/gmsh /usr/local/bin/gmsh && \
    gmsh --version && rm /tmp/gmsh-sdk.tgz
USER node
