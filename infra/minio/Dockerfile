# Только локальный dev-стенд. Исходники MinIO распространяются под AGPLv3.
FROM golang:1.25.4-bookworm@sha256:e17419604b6d1f9bc245694425f0ec9b1b53685c80850900a376fb10cb0f70cb AS build

ARG MINIO_RELEASE=RELEASE.2025-10-15T17-29-55Z
ARG MINIO_SOURCE_COMMIT=9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a

RUN git clone --depth 1 --branch "${MINIO_RELEASE}" https://github.com/minio/minio.git /src
WORKDIR /src
RUN test "$(git rev-parse HEAD)" = "${MINIO_SOURCE_COMMIT}"
RUN CGO_ENABLED=0 go build -tags kqueue -trimpath \
    -ldflags "$(MINIO_RELEASE=RELEASE go run buildscripts/gen-ldflags.go)" -o /minio .

FROM debian:bookworm-slim@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /minio /usr/local/bin/minio
COPY --from=build /src/LICENSE /licenses/LICENSE
EXPOSE 9000 9001
ENTRYPOINT ["/usr/local/bin/minio"]
