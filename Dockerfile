# syntax=docker/dockerfile:1
#
# Lords of the Lowlands - static, non-root container image.
#
#   docker build -t lotl .
#   docker run --rm -p 8080:8080 -v lotl-data:/data --read-only \
#     --cap-drop ALL --security-opt no-new-privileges lotl
#
# The binary is fully static (CGO_ENABLED=0, required by the in-process
# sandbox) and serves the embedded web client; the runtime image contains
# nothing but the binary, CA roots and /etc/passwd entries of distroless.

ARG GO_VERSION=1.24.7

FROM golang:${GO_VERSION}-bookworm AS build
WORKDIR /src
ENV CGO_ENABLED=0 GOFLAGS=-trimpath
COPY go.mod go.sum ./
RUN go mod download && go mod verify
COPY cmd ./cmd
COPY internal ./internal
COPY web ./web
RUN go build -buildvcs=false -ldflags="-s -w" -o /out/lotl-server ./cmd/lotl-server
# Empty data directory owned by the runtime user, so a fresh named volume
# mounted on /data inherits the right ownership.
RUN install -d -m 0700 -o 65532 -g 65532 /out/data

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/lotl-server /lotl-server
COPY --from=build --chown=65532:65532 /out/data /data
USER 65532:65532
EXPOSE 8080
VOLUME ["/data"]
ENV TZ=UTC
# -listen 0.0.0.0:8080 because the default (127.0.0.1) is unreachable from
# outside the container. Add flags after the image name, e.g.
#   docker run ... lotl -secure-cookies -trust-proxy
ENTRYPOINT ["/lotl-server", "-listen", "0.0.0.0:8080", "-data", "/data"]
