FROM golang:1.25-alpine AS build
WORKDIR /src
COPY apps/workflow-go/go.mod apps/workflow-go/go.sum* ./
COPY apps/workflow-go/vendor ./vendor
COPY apps/workflow-go ./
RUN CGO_ENABLED=0 go build -mod=vendor -trimpath -ldflags="-s -w" -o /out/api ./cmd/api && \
    CGO_ENABLED=0 go build -mod=vendor -trimpath -ldflags="-s -w" -o /out/activity-worker ./cmd/activity-worker && \
    CGO_ENABLED=0 go build -mod=vendor -trimpath -ldflags="-s -w" -o /out/workflow-worker ./cmd/worker

FROM alpine:3.21
RUN addgroup -S dataflow && adduser -S dataflow -G dataflow
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /out/api /out/activity-worker /out/workflow-worker /usr/local/bin/
USER dataflow
ENTRYPOINT ["workflow-worker"]
