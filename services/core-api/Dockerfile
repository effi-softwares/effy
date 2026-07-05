# syntax=docker/dockerfile:1
# Multi-stage build (research B8): distroless static runtime (~15MB, CA certs +
# tzdata + nonroot included), TARGETARCH-aware so the same file builds the dev
# machine's native arch today and linux/arm64 for Fargate later.

FROM --platform=$BUILDPLATFORM golang:1.25-bookworm AS base
WORKDIR /app
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

# Dev stage: air live-reload; docker-compose bind-mounts the source over /app.
FROM base AS dev
RUN --mount=type=cache,target=/go/pkg/mod go install github.com/air-verse/air@v1.65.2
CMD ["air", "-c", ".air.toml"]

FROM base AS build
ARG TARGETOS TARGETARCH
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags="-s -w" -o /out/core-api ./cmd/core-api

FROM gcr.io/distroless/static-debian12:nonroot AS runtime
COPY --from=build /out/core-api /core-api
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/core-api"]
